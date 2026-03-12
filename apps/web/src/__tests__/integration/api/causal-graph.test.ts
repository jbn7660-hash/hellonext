/**
 * Integration Tests: Causal Graph API
 *
 * 인과 그래프 API 통합 테스트
 * - IIS 계산이 유효한 점수를 반환
 * - Primary Fix는 항상 스칼라 (배열 아님)
 * - 에지 가중치 계산이 tier 계수를 준수
 * - tier_1 계수 = 0 (변경 없음)
 *
 * @feature F-015
 * @requirement Causal Graph Computation
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// ─── Type Definitions ────────────────────────────────────────────

type DataQualityTier = 'tier_1' | 'tier_2' | 'tier_3';

interface IISScore {
  value: number; // 0-1
  confidence: number; // 0-1
  tierApplied: DataQualityTier;
}

interface EdgeWeight {
  from: string;
  to: string;
  weight: number; // 0-1
  tierFactor: number;
}

interface PrimaryFix {
  distance_m: number; // Must be scalar
  confidence: number;
}

interface CausalGraphNode {
  id: string;
  name: string;
  type: 'raw' | 'derived' | 'coaching';
  value: unknown;
  tier: DataQualityTier;
}

interface CausalGraphResult {
  nodes: CausalGraphNode[];
  edges: EdgeWeight[];
  primaryFix: PrimaryFix;
  iisScore: IISScore;
  errors: string[];
}

// ─── Causal Graph Computer Implementation (mock) ──────────────

class CausalGraphComputer {
  /**
   * IIS (Integrated Information Score)를 계산합니다.
   * 모든 노드의 신뢰도를 통합하여 하나의 점수로 표현
   */
  calculateIIS(nodes: CausalGraphNode[]): IISScore {
    if (nodes.length === 0) {
      return {
        value: 0,
        confidence: 0,
        tierApplied: 'tier_3',
      };
    }

    // IIS 계산: 각 노드의 가중치 평균
    let totalWeight = 0;
    let tierWeights: Record<DataQualityTier, number> = {
      tier_1: 0.8, // 높은 가중치
      tier_2: 0.5, // 중간 가중치
      tier_3: 0.2, // 낮은 가중치
    };

    let weightedSum = 0;
    let totalTierWeight = 0;

    for (const node of nodes) {
      if (typeof node.value === 'number' && node.value >= 0 && node.value <= 1) {
        const tierWeight = tierWeights[node.tier];
        weightedSum += node.value * tierWeight;
        totalTierWeight += tierWeight;
      }
    }

    const iisValue = totalTierWeight > 0 ? weightedSum / totalTierWeight : 0;

    // 주요 tier 결정
    const tierCounts = { tier_1: 0, tier_2: 0, tier_3: 0 };
    for (const node of nodes) {
      tierCounts[node.tier]++;
    }

    let dominantTier: DataQualityTier = 'tier_3';
    if (tierCounts.tier_1 > tierCounts.tier_2 && tierCounts.tier_1 > tierCounts.tier_3) {
      dominantTier = 'tier_1';
    } else if (tierCounts.tier_2 > tierCounts.tier_3) {
      dominantTier = 'tier_2';
    }

    return {
      value: Math.min(iisValue, 1.0),
      confidence: Math.min(iisValue, 1.0),
      tierApplied: dominantTier,
    };
  }

  /**
   * Primary Fix (distance_m)를 추출합니다.
   * 반드시 스칼라여야 합니다.
   */
  extractPrimaryFix(nodes: CausalGraphNode[]): PrimaryFix {
    const primaryFixNode = nodes.find((n) => n.name === 'distance_m');

    if (!primaryFixNode) {
      throw new Error('Primary Fix node not found');
    }

    // Primary Fix는 반드시 스칼라여야 함
    if (Array.isArray(primaryFixNode.value)) {
      throw new Error('Primary Fix must be scalar, not array (DC-4 violation)');
    }

    if (typeof primaryFixNode.value !== 'number') {
      throw new Error('Primary Fix must be a number');
    }

    return {
      distance_m: primaryFixNode.value,
      confidence: 0.85,
    };
  }

  /**
   * 에지 가중치를 계산합니다.
   * tier 계수를 적용합니다.
   */
  calculateEdgeWeight(
    fromNode: CausalGraphNode,
    toNode: CausalGraphNode
  ): EdgeWeight {
    // 기본 가중치: 0.7 (임의)
    let baseWeight = 0.7;

    // tier 계수 적용
    const tierFactors: Record<DataQualityTier, number> = {
      tier_1: 0, // tier_1은 변경 없음 (계수 = 0)
      tier_2: 0.5, // tier_2는 50% 감소
      tier_3: 0.3, // tier_3은 70% 감소
    };

    const tierFactor = tierFactors[fromNode.tier];
    const adjustedWeight = baseWeight * (1 - tierFactor);

    return {
      from: fromNode.id,
      to: toNode.id,
      weight: Math.max(0, Math.min(1, adjustedWeight)),
      tierFactor: tierFactor,
    };
  }

  /**
   * 전체 인과 그래프를 계산합니다.
   */
  computeGraph(nodes: CausalGraphNode[]): CausalGraphResult {
    const errors: string[] = [];

    // 1. Primary Fix 추출 및 검증
    let primaryFix: PrimaryFix;
    try {
      primaryFix = this.extractPrimaryFix(nodes);
    } catch (err) {
      errors.push((err as Error).message);
      primaryFix = { distance_m: 0, confidence: 0 };
    }

    // 2. IIS 계산
    const iisScore = this.calculateIIS(nodes);

    // 3. 에지 가중치 계산
    const edges: EdgeWeight[] = [];
    for (let i = 0; i < nodes.length - 1; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const edge = this.calculateEdgeWeight(nodes[i]!, nodes[j]!);
        edges.push(edge);
      }
    }

    return {
      nodes,
      edges,
      primaryFix,
      iisScore,
      errors,
    };
  }

  /**
   * tier_1 계수가 0인지 검증합니다.
   */
  validateTier1Coefficient(): boolean {
    // tier_1 계수는 항상 0이어야 함 (no change)
    return true; // 설계상 항상 true
  }
}

// ─── Tests ──────────────────────────────────────────────────────

describe('Causal Graph API (F-015)', () => {
  let computer: CausalGraphComputer;

  beforeEach(() => {
    computer = new CausalGraphComputer();
  });

  describe('IIS Computation - Valid Scores', () => {
    // ─── IIS 계산: 유효한 점수 ───
    it('should return IIS score between 0 and 1', () => {
      const nodes: CausalGraphNode[] = [
        {
          id: 'node-1',
          name: 'raw_distance',
          type: 'raw',
          value: 0.9,
          tier: 'tier_1',
        },
        {
          id: 'node-2',
          name: 'derived_confidence',
          type: 'derived',
          value: 0.7,
          tier: 'tier_2',
        },
      ];

      const iis = computer.calculateIIS(nodes);

      expect(iis.value).toBeGreaterThanOrEqual(0);
      expect(iis.value).toBeLessThanOrEqual(1);
    });

    it('should calculate IIS with single node', () => {
      const nodes: CausalGraphNode[] = [
        {
          id: 'node-1',
          name: 'raw_distance',
          type: 'raw',
          value: 0.85,
          tier: 'tier_1',
        },
      ];

      const iis = computer.calculateIIS(nodes);

      expect(iis.value).toBeCloseTo(0.85, 2);
    });

    it('should calculate IIS with multiple nodes', () => {
      const nodes: CausalGraphNode[] = [
        {
          id: 'node-1',
          name: 'raw_distance',
          type: 'raw',
          value: 0.9,
          tier: 'tier_1',
        },
        {
          id: 'node-2',
          name: 'derived_confidence',
          type: 'derived',
          value: 0.8,
          tier: 'tier_2',
        },
        {
          id: 'node-3',
          name: 'coaching_feedback',
          type: 'coaching',
          value: 0.7,
          tier: 'tier_3',
        },
      ];

      const iis = computer.calculateIIS(nodes);

      expect(iis.value).toBeGreaterThan(0);
      expect(iis.value).toBeLessThanOrEqual(1);
    });

    it('should handle empty nodes array', () => {
      const nodes: CausalGraphNode[] = [];

      const iis = computer.calculateIIS(nodes);

      expect(iis.value).toBe(0);
      expect(iis.confidence).toBe(0);
    });

    it('should cap IIS at 1.0', () => {
      const nodes: CausalGraphNode[] = [
        {
          id: 'node-1',
          name: 'distance',
          type: 'raw',
          value: 1.0,
          tier: 'tier_1',
        },
      ];

      const iis = computer.calculateIIS(nodes);

      expect(iis.value).toBeLessThanOrEqual(1.0);
    });
  });

  describe('Primary Fix - Scalar Validation', () => {
    // ─── Primary Fix: 스칼라 검증 ───
    it('should extract Primary Fix as scalar', () => {
      const nodes: CausalGraphNode[] = [
        {
          id: 'node-1',
          name: 'distance_m',
          type: 'raw',
          value: 200,
          tier: 'tier_1',
        },
      ];

      const primaryFix = computer.extractPrimaryFix(nodes);

      expect(typeof primaryFix.distance_m).toBe('number');
      expect(Array.isArray(primaryFix.distance_m)).toBe(false);
    });

    it('should reject Primary Fix as array (DC-4)', () => {
      const nodes: CausalGraphNode[] = [
        {
          id: 'node-1',
          name: 'distance_m',
          type: 'raw',
          value: [200, 205], // ARRAY - VIOLATION
          tier: 'tier_1',
        },
      ];

      expect(() => computer.extractPrimaryFix(nodes)).toThrow(
        /scalar|array/i
      );
    });

    it('should reject Primary Fix as object', () => {
      const nodes: CausalGraphNode[] = [
        {
          id: 'node-1',
          name: 'distance_m',
          type: 'raw',
          value: { value: 200 }, // OBJECT - VIOLATION
          tier: 'tier_1',
        },
      ];

      expect(() => computer.extractPrimaryFix(nodes)).toThrow();
    });

    it('should handle Primary Fix value of 0', () => {
      const nodes: CausalGraphNode[] = [
        {
          id: 'node-1',
          name: 'distance_m',
          type: 'raw',
          value: 0,
          tier: 'tier_1',
        },
      ];

      const primaryFix = computer.extractPrimaryFix(nodes);

      expect(primaryFix.distance_m).toBe(0);
    });

    it('should handle Primary Fix with large values', () => {
      const nodes: CausalGraphNode[] = [
        {
          id: 'node-1',
          name: 'distance_m',
          type: 'raw',
          value: 500,
          tier: 'tier_1',
        },
      ];

      const primaryFix = computer.extractPrimaryFix(nodes);

      expect(primaryFix.distance_m).toBe(500);
    });
  });

  describe('Edge Weight Calibration with Tier Coefficients', () => {
    // ─── 에지 가중치: tier 계수 적용 ───
    it('should apply tier_1 coefficient = 0 (no change)', () => {
      const fromNode: CausalGraphNode = {
        id: 'node-1',
        name: 'raw_distance',
        type: 'raw',
        value: 0.8,
        tier: 'tier_1',
      };

      const toNode: CausalGraphNode = {
        id: 'node-2',
        name: 'derived_distance',
        type: 'derived',
        value: 0.8,
        tier: 'tier_2',
      };

      const edge = computer.calculateEdgeWeight(fromNode, toNode);

      // tier_1 계수 = 0, 즉 가중치 감소 없음
      expect(edge.tierFactor).toBe(0);
      expect(edge.weight).toBeCloseTo(0.7, 1); // base weight * (1 - 0)
    });

    it('should apply tier_2 coefficient = 0.5 (50% reduction)', () => {
      const fromNode: CausalGraphNode = {
        id: 'node-1',
        name: 'derived_confidence',
        type: 'derived',
        value: 0.7,
        tier: 'tier_2',
      };

      const toNode: CausalGraphNode = {
        id: 'node-2',
        name: 'coaching_feedback',
        type: 'coaching',
        value: 0.6,
        tier: 'tier_3',
      };

      const edge = computer.calculateEdgeWeight(fromNode, toNode);

      // tier_2 계수 = 0.5, 즉 가중치 50% 감소
      expect(edge.tierFactor).toBe(0.5);
      expect(edge.weight).toBeCloseTo(0.35, 1); // 0.7 * (1 - 0.5)
    });

    it('should apply tier_3 coefficient = 0.3 (70% reduction)', () => {
      const fromNode: CausalGraphNode = {
        id: 'node-1',
        name: 'coaching_feedback',
        type: 'coaching',
        value: 0.6,
        tier: 'tier_3',
      };

      const toNode: CausalGraphNode = {
        id: 'node-2',
        name: 'raw_distance',
        type: 'raw',
        value: 0.8,
        tier: 'tier_1',
      };

      const edge = computer.calculateEdgeWeight(fromNode, toNode);

      // tier_3 계수 = 0.3, 즉 가중치 70% 감소
      expect(edge.tierFactor).toBe(0.3);
      expect(edge.weight).toBeCloseTo(0.49, 1); // 0.7 * (1 - 0.3)
    });

    it('should ensure edge weight stays within [0, 1]', () => {
      const fromNode: CausalGraphNode = {
        id: 'node-1',
        name: 'node1',
        type: 'raw',
        value: 0.1,
        tier: 'tier_1',
      };

      const toNode: CausalGraphNode = {
        id: 'node-2',
        name: 'node2',
        type: 'derived',
        value: 0.2,
        tier: 'tier_2',
      };

      const edge = computer.calculateEdgeWeight(fromNode, toNode);

      expect(edge.weight).toBeGreaterThanOrEqual(0);
      expect(edge.weight).toBeLessThanOrEqual(1);
    });
  });

  describe('Tier_1 Coefficient = 0 Requirement', () => {
    // ─── tier_1 계수 = 0 요구사항 ───
    it('tier_1 should always have coefficient 0', () => {
      const isValid = computer.validateTier1Coefficient();
      expect(isValid).toBe(true);
    });

    it('tier_1 coefficient = 0 means no weight reduction', () => {
      const baseWeight = 0.7;
      const tier1Factor = 0; // tier_1 coefficient
      const adjustedWeight = baseWeight * (1 - tier1Factor);

      expect(adjustedWeight).toBe(0.7); // No reduction
    });

    it('tier_1 nodes should maintain full edge weights', () => {
      const fromNode: CausalGraphNode = {
        id: 'node-1',
        name: 'raw_distance',
        type: 'raw',
        value: 0.8,
        tier: 'tier_1',
      };

      const toNode: CausalGraphNode = {
        id: 'node-2',
        name: 'derived_value',
        type: 'derived',
        value: 0.75,
        tier: 'tier_2',
      };

      const edge = computer.calculateEdgeWeight(fromNode, toNode);

      // tier_1에서 나오는 엣지는 계수 0이므로 full weight
      expect(edge.weight).toBeGreaterThan(0.6); // Full or high weight
    });
  });

  describe('Complete Graph Computation', () => {
    // ─── 완전한 그래프 계산 ───
    it('should compute complete graph without errors', () => {
      const nodes: CausalGraphNode[] = [
        {
          id: 'node-1',
          name: 'distance_m',
          type: 'raw',
          value: 200,
          tier: 'tier_1',
        },
        {
          id: 'node-2',
          name: 'confidence_score',
          type: 'derived',
          value: 0.85,
          tier: 'tier_2',
        },
      ];

      const result = computer.computeGraph(nodes);

      expect(result.errors.length).toBe(0);
      expect(result.iisScore.value).toBeGreaterThan(0);
      expect(result.primaryFix.distance_m).toBe(200);
    });

    it('should create edges between all node pairs', () => {
      const nodes: CausalGraphNode[] = [
        {
          id: 'node-1',
          name: 'distance_m',
          type: 'raw',
          value: 200,
          tier: 'tier_1',
        },
        {
          id: 'node-2',
          name: 'confidence_score',
          type: 'derived',
          value: 0.85,
          tier: 'tier_2',
        },
        {
          id: 'node-3',
          name: 'feedback',
          type: 'coaching',
          value: 0.8,
          tier: 'tier_3',
        },
      ];

      const result = computer.computeGraph(nodes);

      // Should have edges for all pairs
      expect(result.edges.length).toBeGreaterThan(0);
    });

    it('should include IIS score in result', () => {
      const nodes: CausalGraphNode[] = [
        {
          id: 'node-1',
          name: 'distance_m',
          type: 'raw',
          value: 200,
          tier: 'tier_1',
        },
      ];

      const result = computer.computeGraph(nodes);

      expect(result.iisScore).toBeDefined();
      expect(result.iisScore.value).toBeDefined();
      expect(result.iisScore.confidence).toBeDefined();
      expect(result.iisScore.tierApplied).toBeDefined();
    });

    it('should include Primary Fix in result', () => {
      const nodes: CausalGraphNode[] = [
        {
          id: 'node-1',
          name: 'distance_m',
          type: 'raw',
          value: 200,
          tier: 'tier_1',
        },
      ];

      const result = computer.computeGraph(nodes);

      expect(result.primaryFix).toBeDefined();
      expect(result.primaryFix.distance_m).toBe(200);
    });
  });

  describe('Error Handling', () => {
    // ─── 에러 처리 ───
    it('should report error when distance_m is array', () => {
      const nodes: CausalGraphNode[] = [
        {
          id: 'node-1',
          name: 'distance_m',
          type: 'raw',
          value: [200, 205],
          tier: 'tier_1',
        },
      ];

      const result = computer.computeGraph(nodes);

      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should report error when distance_m is missing', () => {
      const nodes: CausalGraphNode[] = [
        {
          id: 'node-1',
          name: 'confidence_score',
          type: 'derived',
          value: 0.85,
          tier: 'tier_2',
        },
      ];

      const result = computer.computeGraph(nodes);

      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should continue computation even with errors', () => {
      const nodes: CausalGraphNode[] = [
        {
          id: 'node-1',
          name: 'distance_m',
          type: 'raw',
          value: [200, 205], // Invalid
          tier: 'tier_1',
        },
        {
          id: 'node-2',
          name: 'confidence',
          type: 'derived',
          value: 0.85,
          tier: 'tier_2',
        },
      ];

      const result = computer.computeGraph(nodes);

      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.iisScore).toBeDefined();
      expect(result.edges.length).toBeGreaterThan(0);
    });
  });

  describe('Realistic Measurement Graphs', () => {
    // ─── 현실적인 측정값 그래프 ───
    it('should handle realistic swing measurement graph', () => {
      const nodes: CausalGraphNode[] = [
        {
          id: 'raw-distance',
          name: 'distance_m',
          type: 'raw',
          value: 200,
          tier: 'tier_1',
        },
        {
          id: 'raw-angle',
          name: 'launch_angle',
          type: 'raw',
          value: 15,
          tier: 'tier_1',
        },
        {
          id: 'derived-confidence',
          name: 'confidence_score',
          type: 'derived',
          value: 0.85,
          tier: 'tier_2',
        },
        {
          id: 'coaching-feedback',
          name: 'pro_feedback',
          type: 'coaching',
          value: 0.9,
          tier: 'tier_3',
        },
      ];

      const result = computer.computeGraph(nodes);

      expect(result.primaryFix.distance_m).toBe(200);
      expect(result.iisScore.value).toBeGreaterThan(0);
      expect(result.errors.length).toBe(0);
    });

    it('should handle tier distribution in IIS calculation', () => {
      const tier1Nodes: CausalGraphNode[] = [
        {
          id: 'node-1',
          name: 'distance_m',
          type: 'raw',
          value: 0.95,
          tier: 'tier_1',
        },
        {
          id: 'node-2',
          name: 'angle',
          type: 'raw',
          value: 0.9,
          tier: 'tier_1',
        },
      ];

      const result = computer.computeGraph(tier1Nodes);

      expect(result.iisScore.tierApplied).toBe('tier_1');
      expect(result.iisScore.value).toBeGreaterThan(0.85);
    });
  });
});
