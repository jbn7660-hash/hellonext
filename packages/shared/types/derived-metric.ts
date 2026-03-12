/** Layer B: Derived Metric (DC-1 — Recalculable) */
export interface DerivedMetric {
  id: string;
  session_id: string;
  compound_metrics: CompoundMetrics;
  auto_detected_symptoms: string[];
  dependency_edges: DependencyEdge[];
  formula_id: string;
  created_at: string;
  recalculated_at: string | null;
}

export interface CompoundMetrics {
  x_factor?: number;
  swing_tempo?: number;
  hip_rotation?: number;
  shoulder_rotation?: number;
  [key: string]: number | undefined;
}

export interface DependencyEdge {
  from_symptom: string;
  to_symptom: string;
  strength: number;
}

/** Causal graph node representing an error pattern (Patent 1) */
export interface CausalGraphNode {
  id: string;
  label: string;
  errorPattern: string;
  iisScore: number;
}

/** Causal graph edge representing causal relationship (Patent 1) */
export interface CausalGraphEdge {
  source: string;
  target: string;
  weight: number; // Causal strength [0, 1]
  type: 'causes' | 'aggravates' | 'correlates'; // Edge type for visualization
}

/** IIS (Integrated Impact Score) result with causal path and confidence */
export interface IISResult {
  nodeId: string;
  score: number; // [0, 1]
  rank: number; // Position when sorted by score
  causalPath: string[]; // Path from root cause to this node
  confidence: number; // Data quality confidence [0, 1]
  dataQualityTier: 'tier_1' | 'tier_2' | 'tier_3';
}

/** Full DAG structure with validation */
export interface DependencyModel {
  nodes: CausalGraphNode[];
  edges: CausalGraphEdge[];
  iisResults: IISResult[];
  primaryFix: IISResult | null;
}

/** Check if DAG has no cycles and all nodes have edges */
export function isValidDAG(model: DependencyModel): {
  valid: boolean;
  orphanNodes?: string[];
  hasCycles?: boolean;
} {
  const { nodes, edges } = model;

  // Check for orphan nodes (nodes with no incoming or outgoing edges)
  const nodeIds = new Set(nodes.map((n) => n.id));
  const connectedNodes = new Set<string>();

  edges.forEach((edge) => {
    connectedNodes.add(edge.source);
    connectedNodes.add(edge.target);
  });

  const orphanNodes = Array.from(nodeIds).filter((id) => !connectedNodes.has(id));

  // Simple cycle detection using DFS
  const visited = new Set<string>();
  const recursionStack = new Set<string>();
  let hasCycles = false;

  function dfs(nodeId: string): void {
    visited.add(nodeId);
    recursionStack.add(nodeId);

    const outgoing = edges.filter((e) => e.source === nodeId).map((e) => e.target);

    for (const targetId of outgoing) {
      if (!visited.has(targetId)) {
        dfs(targetId);
      } else if (recursionStack.has(targetId)) {
        hasCycles = true;
      }
    }

    recursionStack.delete(nodeId);
  }

  for (const node of nodes) {
    if (!visited.has(node.id)) {
      dfs(node.id);
    }
  }

  return {
    valid: orphanNodes.length === 0 && !hasCycles,
    orphanNodes: orphanNodes.length > 0 ? orphanNodes : undefined,
    hasCycles: hasCycles ? true : undefined,
  };
}
