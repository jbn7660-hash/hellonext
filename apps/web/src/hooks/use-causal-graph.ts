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
  AnalysisProgress,
} from '@hellonext/shared/types';

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
  // DB schema: causal_graph_edges (from_node, to_node, weight, edge_type, calibration_count, calibrated_at)
  //            error_patterns (id, code, name_ko, name_en, description, position, causality_parents)
  //            coaching_decisions (id, session_id, primary_fix, auto_draft, coach_edited, data_quality_tier, ...)
  const fetchWithRetry = useCallback(
    async (targetSessionId: string, attempt: number = 0): Promise<DependencyModel | null> => {
      try {
        // 1. Fetch coaching decision for this session (contains IIS results in auto_draft)
        const { data: decisionRaw, error: decisionError } = await supabase
          .from('coaching_decisions')
          .select('id, primary_fix, auto_draft, data_quality_tier')
          .eq('session_id', targetSessionId)
          .single();

        if (decisionError && decisionError.code === 'PGRST116') {
          // No decision found — no analysis yet
          return null;
        }
        if (decisionError) throw decisionError;

        const decision = decisionRaw as {
          id: string;
          primary_fix: string | null;
          auto_draft: { detected_symptoms?: string[]; iis_scores?: Record<string, number>; causal_path?: string[] } | null;
          data_quality_tier: string;
        } | null;

        if (!decision) return null;

        // 2. Fetch causal graph edges
        const { data: edgesRaw, error: edgesError } = await supabase
          .from('causal_graph_edges')
          .select('id, from_node, to_node, weight, edge_type');

        if (edgesError) throw edgesError;

        // 3. Fetch error patterns for node labels
        const { data: patternsRaw, error: patternsError } = await supabase
          .from('error_patterns')
          .select('id, code, name_ko, position');

        if (patternsError) throw patternsError;

        const patterns = (patternsRaw ?? []) as { id: number; code: string; name_ko: string; position: string }[];
        const patternMap = new Map(patterns.map((p) => [p.code, p]));

        // Build nodes from auto_draft symptoms + edge endpoints
        const nodeIdSet = new Set<string>();
        const autoDraft = decision.auto_draft;
        const iisScoresMap = autoDraft?.iis_scores ?? {};

        // Collect all node IDs from edges
        const edges = (edgesRaw ?? []) as { id: string; from_node: string; to_node: string; weight: number; edge_type: string }[];
        edges.forEach((e) => {
          nodeIdSet.add(e.from_node);
          nodeIdSet.add(e.to_node);
        });

        // Also include detected symptoms
        (autoDraft?.detected_symptoms ?? []).forEach((s: string) => nodeIdSet.add(s));

        // Build graph nodes
        const graphNodes: CausalGraphNode[] = Array.from(nodeIdSet).map((nodeId) => {
          const pattern = patternMap.get(nodeId);
          return {
            id: nodeId,
            label: pattern?.name_ko ?? nodeId,
            errorPattern: nodeId,
            iisScore: iisScoresMap[nodeId] ?? 0,
          };
        });

        // Build graph edges (map DB columns to UI types)
        const edgeTypeMap: Record<string, 'causes' | 'aggravates' | 'correlates'> = {
          causes: 'causes',
          aggravates: 'aggravates',
          correlates: 'correlates',
        };

        const graphEdges: CausalGraphEdge[] = edges.map((edge) => ({
          source: edge.from_node,
          target: edge.to_node,
          weight: edge.weight,
          type: edgeTypeMap[edge.edge_type] ?? 'correlates',
        }));

        // Build IIS results from auto_draft.iis_scores
        const sortedIIS = Object.entries(iisScoresMap)
          .sort(([, a], [, b]) => b - a)
          .map(([nodeId, score], index) => ({
            nodeId,
            score,
            rank: index + 1,
            causalPath: autoDraft?.causal_path ?? [],
            confidence: score,
            dataQualityTier: (decision.data_quality_tier || 'tier_3') as 'tier_1' | 'tier_2' | 'tier_3',
          }));

        // Import isValidDAG for runtime validation
        const { isValidDAG: validateDAG } = await import('@hellonext/shared/types');

        const model: DependencyModel = {
          nodes: graphNodes,
          edges: graphEdges,
          iisResults: sortedIIS,
          primaryFix: sortedIIS.length > 0 ? (sortedIIS[0] ?? null) : null,
        };

        const validationResult = validateDAG(model);
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
