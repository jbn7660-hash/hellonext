/**
 * Causal Graph Store (Zustand)
 *
 * Global state management for causal graph data caching and analysis progress.
 * Enables efficient cross-component access to graph data and realtime updates.
 *
 * @module stores/causal-graph-store
 * @dependencies zustand
 * @exports useCausalGraphStore
 */

import { create } from 'zustand';
import type {
  CausalGraphNode,
  CausalGraphEdge,
  IISResult,
  DependencyModel,
  AnalysisProgress,
} from '@hellonext/shared';

interface CausalGraphStoreState {
  // Data
  nodes: CausalGraphNode[];
  edges: CausalGraphEdge[];
  iisResults: IISResult[];
  primaryFix: IISResult | null;

  // Metadata
  sessionId: string | null;
  cacheKey: string | null; // For invalidation
  cachedAt: number | null;

  // Progress tracking
  analysisProgress: AnalysisProgress | null;

  // Filtering
  minIISThreshold: number; // [0, 1]

  // UI State
  selectedNodeId: string | null;
  showDetailPanel: boolean;

  // Actions
  setGraphData: (data: DependencyModel, sessionId: string) => void;
  clearGraphData: () => void;
  setAnalysisProgress: (progress: AnalysisProgress | null) => void;
  setMinIISThreshold: (threshold: number) => void;
  selectNode: (nodeId: string | null) => void;
  setShowDetailPanel: (show: boolean) => void;
  isDataValid: () => boolean;
  getFilteredNodes: () => CausalGraphNode[];
}

const initialState = {
  nodes: [],
  edges: [],
  iisResults: [],
  primaryFix: null,
  sessionId: null,
  cacheKey: null,
  cachedAt: null,
  analysisProgress: null,
  minIISThreshold: 0,
  selectedNodeId: null,
  showDetailPanel: false,
};

export const useCausalGraphStore = create<CausalGraphStoreState>((set, get) => ({
  ...initialState,

  setGraphData: (data: DependencyModel, sessionId: string) => {
    set({
      nodes: data.nodes,
      edges: data.edges,
      iisResults: data.iisResults,
      primaryFix: data.primaryFix || null,
      sessionId,
      cacheKey: `${sessionId}:${Date.now()}`,
      cachedAt: Date.now(),
      analysisProgress: null, // Clear progress when data is set
    });
  },

  clearGraphData: () => {
    set({
      ...initialState,
    });
  },

  setAnalysisProgress: (progress: AnalysisProgress | null) => {
    set({ analysisProgress: progress });
  },

  setMinIISThreshold: (threshold: number) => {
    set({
      minIISThreshold: Math.max(0, Math.min(1, threshold)),
    });
  },

  selectNode: (nodeId: string | null) => {
    set({ selectedNodeId: nodeId });
  },

  setShowDetailPanel: (show: boolean) => {
    set({ showDetailPanel: show });
  },

  isDataValid: () => {
    const state = get();
    // Data is valid if we have nodes and edges, and it's reasonably fresh (< 30 min old)
    if (!state.sessionId || state.nodes.length === 0) {
      return false;
    }
    if (state.cachedAt && Date.now() - state.cachedAt > 30 * 60 * 1000) {
      return false;
    }
    return true;
  },

  getFilteredNodes: () => {
    const state = get();
    return state.nodes.filter((node) => {
      const iisResult = state.iisResults.find((r) => r.nodeId === node.id);
      return iisResult && iisResult.score >= state.minIISThreshold;
    });
  },
}));
