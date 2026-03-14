/**
 * useCausalGraph Hook
 *
 * Manages causal graph visualization and analysis for error pattern relationships.
 * Features:
 * - Realtime subscription to analysis progress
 * - Graph data caching in Zustand store
 * - Automatic retry with exponential backoff
 * - DAG validation (no orphan nodes)
 * - Node filtering by IIS score threshold
 * - AbortController for cleanup
 *
 * @module hooks/use-causal-graph
 * @feature F-015
 */

'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { createClient } from '@/lib/supabase/client';
import { logger } from '@/lib/utils/logger';
import { useCausalGraphStore } from '@/stores/causal-graph-store';
import { useRealtimeBroadcast } from './use-realtime';
import type {
  CausalGraphNode,
  CausalGraphEdge,
  IISResult,
  DependencyModel,
  isValidDAG,
} from '@hellonext/shared/types';
import type { AnalysisProgress } from '@hellonext/shared/types';

/**
 * Hook state.
 */
export interface UseCausalGraphState {
  nodes: CausalGraphNode[];
  edges: CausalGraphEdge[];
  primaryFix: IISResult | null;
  iisScores: Record<string, number>;
  loading: boolean;
  error: string | null;
  analysisProgress: AnalysisProgress | null;
  minIISThreshold: number;
}

/**
 * Hook actions.
 */
export interface UseCausalGraphActions {
  triggerAnalysis: (sessionId: string) => Promise<void>;
  refresh: (sessionId?: string) => Promise<void>;
  setMinIISThreshold: (threshold: number) => void;
  selectNode: (nodeId: string | null) => void;
}

// Max retry attempts with exponential backoff
const MAX_RETRIES = 3;
const INITIAL_DELAY_MS = 1000;

/**
 * useCausalGraph hook.
 * Loads causal graph data for error pattern analysis with caching and realtime updates.
 *
 * @param sessionId - Optional session ID to initialize with
 * @returns Hook state and actions
 */
export function useCausalGraph(sessionId?: string): UseCausalGraphState & UseCausalGraphActions {
  // Local state
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Zustand store
  const storeState = useCausalGraphStore((state) => ({
    nodes: state.nodes,
    edges: state.edges,
    iisResults: state.iisResults,
    primaryFix: state.primaryFix,
    analysisProgress: state.analysisProgress,
    minIISThreshold: state.minIISThreshold,
    setGraphData: state.setGraphData,
    clearGraphData: state.clearGraphData,
    setAnalysisProgress: state.setAnalysisProgress,
    setMinIISThreshold: state.setMinIISThreshold,
    selectNode: state.selectNode,
    isDataValid: state.isDataValid,
    getFilteredNodes: state.getFilteredNodes,
  }));

  // Refs for cleanup and retries
  const abortControllerRef = useRef<AbortController | null>(null);
  const retryCountRef = useRef(0);
  const supabase = createClient();

  // Memoized IIS scores map
  const iisScores = useMemo(
    () => {
      const scores: Record<string, number> = {};
      storeState.iisResults.forEach((result) => {
        scores[result.nodeId] = result.score;
      });
      return scores;
    },
    [storeState.iisResults]
  );

  // Fetch with retry logic
  const fetchWithRetry = useCallback(
    async (targetSessionId: string, attempt: number = 0): Promise<DependencyModel | null> => {
      try {
        const { data, error: fetchError } = await supabase
          .from('causal_graphs')
          .select('*')
          .eq('session_id', targetSessionId)
          .single() as unknown as {
            data: { nodes: any[]; edges: any[]; iis_results: any[] } | null;
            error: Error | null;
          };

        if (fetchError) {
          throw fetchError;
        }

        if (!data) {
          return null;
        }

        // Validate graph structure (no orphan nodes)
        const graphNodes: CausalGraphNode[] = (data.nodes || []).map((node: any) => ({
          id: node.id,
          label: node.label,
          errorPattern: node.error_pattern,
          iisScore: node.iis_score,
        }));

        const graphEdges: CausalGraphEdge[] = (data.edges || []).map((edge: any) => ({
          source: edge.source,
          target: edge.target,
          weight: edge.weight,
          type: edge.type || 'correlates',
        }));

        const iisResults: IISResult[] = (data.iis_results || []).map((result: any) => ({
          nodeId: result.node_id,
          score: result.score,
          rank: result.rank,
          causalPath: result.causal_path || [],
          confidence: result.confidence || 0,
          dataQualityTier: result.data_quality_tier || 'tier_3',
        }));

        // Import isValidDAG for runtime validation
        const { isValidDAG } = await import('@hellonext/shared/types');

        const model: DependencyModel = {
          nodes: graphNodes,
          edges: graphEdges,
          iisResults,
          primaryFix: iisResults.length > 0 ? (iisResults[0] ?? null) : null,
        };

        const validationResult = isValidDAG(model);
        if (!validationResult.valid) {
          logger.warn('Causal graph has structural issues', {
            orphanNodes: validationResult.orphanNodes,
            hasCycles: validationResult.hasCycles,
          });
        }

        retryCountRef.current = 0;
        return model;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to fetch causal graph';

        // Retry with exponential backoff
        if (attempt < MAX_RETRIES) {
          const delay = INITIAL_DELAY_MS * Math.pow(2, attempt);
          logger.warn('Retrying causal graph fetch', { attempt: attempt + 1, delay });

          await new Promise((resolve) => setTimeout(resolve, delay));
          return fetchWithRetry(targetSessionId, attempt + 1);
        }

        throw new Error(`${message} (after ${MAX_RETRIES} retries)`);
      }
    },
    [supabase]
  );

  // Refresh graph data
  const refresh = useCallback(
    async (targetSessionId?: string) => {
      const sId = targetSessionId || sessionId;

      if (!sId) {
        return;
      }

      // Cancel previous request
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      abortControllerRef.current = new AbortController();

      try {
        setLoading(true);
        setError(null);

        const model = await fetchWithRetry(sId);

        if (!model) {
          storeState.clearGraphData();
          return;
        }

        storeState.setGraphData(model, sId);

        logger.info('Causal graph loaded', {
          nodeCount: model.nodes.length,
          edgeCount: model.edges.length,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to load causal graph';
        setError(message);
        logger.error('Failed to load causal graph', { error: err });
      } finally {
        setLoading(false);
      }
    },
    [sessionId, storeState, fetchWithRetry]
  );

  // Realtime subscription to analysis progress
  useRealtimeBroadcast(
    `causal-analysis:${sessionId}`,
    'progress_update',
    (payload: AnalysisProgress) => {
      logger.debug('Analysis progress update', { stage: payload.stage, percentage: payload.percentage });
      storeState.setAnalysisProgress(payload);
    },
    !!sessionId
  );

  // Load on mount
  useEffect(() => {
    if (sessionId) {
      // Check if data is already valid in store
      if (!storeState.isDataValid()) {
        refresh(sessionId);
      }
    }

    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [sessionId, refresh, storeState]);

  // Trigger full analysis
  const triggerAnalysis = useCallback(
    async (targetSessionId: string) => {
      try {
        setLoading(true);
        setError(null);

        const { error: invokeError } = await supabase.functions.invoke('causal-analysis', {
          body: {
            sessionId: targetSessionId,
          },
        });

        if (invokeError) throw invokeError;

        logger.info('Causal analysis triggered', { sessionId: targetSessionId });

        // Wait for analysis to complete (realtime updates will update progress)
        // Once analysis is complete, refresh data
        await new Promise((resolve) => setTimeout(resolve, 3000)); // Initial wait
        await refresh(targetSessionId);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to trigger analysis';
        setError(message);
        logger.error('Failed to trigger causal analysis', { error: err });
        throw err;
      }
    },
    [supabase, refresh]
  );

  return {
    nodes: storeState.nodes,
    edges: storeState.edges,
    primaryFix: storeState.primaryFix,
    iisScores,
    loading,
    error,
    analysisProgress: storeState.analysisProgress,
    minIISThreshold: storeState.minIISThreshold,
    triggerAnalysis,
    refresh,
    setMinIISThreshold: storeState.setMinIISThreshold,
    selectNode: storeState.selectNode,
  };
}
