/**
 * Initial Causal Graph DAG (Patent 1, F-015)
 *
 * Based on 22 error patterns + 6 causality chains from instructions.md
 * Nodes = error pattern codes (EP-001 ~ EP-022)
 * Edges = causal relationships between patterns
 */

export interface CausalEdge {
  from_node: string;
  to_node: string;
  edge_type: 'causes' | 'aggravates' | 'correlates';
  weight: number;
}

/**
 * 6 Primary Causality Chains
 * Derived from instructions.md domain knowledge
 */
export const CAUSAL_CHAINS: CausalEdge[] = [
  // Chain 1: 그립 → 백스윙 → 탑 포지션
  { from_node: 'EP-001', to_node: 'EP-004', edge_type: 'causes', weight: 0.8 },
  { from_node: 'EP-004', to_node: 'EP-007', edge_type: 'causes', weight: 0.7 },

  // Chain 2: 어드레스 → 체중 이동 → 임팩트
  { from_node: 'EP-002', to_node: 'EP-008', edge_type: 'causes', weight: 0.75 },
  { from_node: 'EP-008', to_node: 'EP-012', edge_type: 'causes', weight: 0.7 },

  // Chain 3: 힙 회전 → 상체 회전 → 클럽 경로
  { from_node: 'EP-003', to_node: 'EP-006', edge_type: 'causes', weight: 0.85 },
  { from_node: 'EP-006', to_node: 'EP-010', edge_type: 'causes', weight: 0.65 },

  // Chain 4: 헤드업 → 다운스윙 → 임팩트
  { from_node: 'EP-005', to_node: 'EP-009', edge_type: 'aggravates', weight: 0.6 },
  { from_node: 'EP-009', to_node: 'EP-012', edge_type: 'aggravates', weight: 0.55 },

  // Chain 5: 템포 → 전환 → 릴리즈
  { from_node: 'EP-011', to_node: 'EP-013', edge_type: 'causes', weight: 0.7 },
  { from_node: 'EP-013', to_node: 'EP-015', edge_type: 'causes', weight: 0.6 },

  // Chain 6: 얼리 익스텐션 → 스윙 플레인 → 구질
  { from_node: 'EP-014', to_node: 'EP-016', edge_type: 'causes', weight: 0.75 },
  { from_node: 'EP-016', to_node: 'EP-018', edge_type: 'causes', weight: 0.65 },
];

/** Data quality tiers for edit delta calibration (Patent 1 Claim 3) */
export const DATA_QUALITY_TIERS = {
  TIER_1: { id: 'tier_1', label: 'AI 결과 무수정', calibrationCoefficient: 0 },
  TIER_2: { id: 'tier_2', label: '일부 수정', calibrationCoefficient: 1.0 },
  TIER_3: { id: 'tier_3', label: '전면 수정', calibrationCoefficient: 0.5 },
} as const;

export type DataQualityTier = keyof typeof DATA_QUALITY_TIERS;
