/**
 * Data Layer Separator Utility
 *
 * Separates pose analysis data into three distinct layers (DC-1):
 * - Layer A: Raw Measurements (direct sensor data)
 * - Layer B: Derived Metrics (computed from Layer A)
 * - Layer C: Coaching Decisions (human/expert-derived recommendations)
 *
 * ⚠️ 타입 구분:
 *   - DB 스키마 타입: @hellonext/shared에서 import (RawMeasurement, DerivedMetric, CoachingDecision)
 *   - 클라이언트 분류 타입: Client* 접두어 (이 파일에서 정의, separateIntoLayers()에서 사용)
 *
 * Ensures no cross-contamination between layers and maintains data integrity.
 *
 * @module lib/patent/data-layer-separator
 * @feature DC-1
 */

// DB 스키마 타입 (Single Source of Truth)
import type {
  RawMeasurement,
  DerivedMetric,
  CoachingDecision,
} from '@hellonext/shared';

// DB 타입 re-export (다른 파일에서 이 모듈을 통해 접근 가능)
export type { RawMeasurement, DerivedMetric, CoachingDecision };

/**
 * 클라이언트 측 분류용 Raw measurement.
 * (DB RawMeasurement와 다른 형태 — 포즈 감지 결과를 분류 전 사용)
 */
export interface ClientRawMeasurement {
  id: string;
  type: string;
  value: number;
  unit: string;
  timestamp: number;
  confidence: number;
}

/**
 * 클라이언트 측 분류용 Derived metric.
 */
export interface ClientDerivedMetric {
  id: string;
  name: string;
  formula: string;
  value: number;
  dependsOn: string[]; // IDs of raw measurements
  timestamp: number;
}

/**
 * 클라이언트 측 분류용 Coaching decision.
 */
export interface ClientCoachingDecision {
  id: string;
  category: string;
  description: string;
  priority: 'high' | 'medium' | 'low';
  basedOnMetrics: string[]; // IDs of derived metrics
  timestamp: number;
}

/**
 * Separated pose data organized by layer.
 */
export interface SeparatedLayers {
  layerA: ClientRawMeasurement[];
  layerB: ClientDerivedMetric[];
  layerC: ClientCoachingDecision[];
}

/**
 * Separate pose analysis data into three distinct layers.
 * Ensures no cross-contamination between layers.
 *
 * @param poseData - Raw pose detection data
 * @param aiAnalysis - AI-generated analysis results
 * @returns Separated layers with properly categorized data
 */
export function separateIntoLayers(
  poseData: Record<string, any>,
  aiAnalysis: Record<string, any>
): SeparatedLayers {
  const layerA: ClientRawMeasurement[] = [];
  const layerB: ClientDerivedMetric[] = [];
  const layerC: ClientCoachingDecision[] = [];

  // Extract Layer A: Raw measurements
  if (poseData.keypoints) {
    poseData.keypoints.forEach((keypoint: any, index: number) => {
      layerA.push({
        id: `keypoint_${index}`,
        type: 'keypoint',
        value: keypoint.score || 0,
        unit: 'confidence_score',
        timestamp: Date.now(),
        confidence: keypoint.score || 0,
      });
    });
  }

  // Extract Layer B: Derived metrics from AI analysis
  if (aiAnalysis.metrics) {
    Object.entries(aiAnalysis.metrics).forEach(([key, value]: [string, any]) => {
      layerB.push({
        id: `metric_${key}`,
        name: key,
        formula: aiAnalysis.metricFormulas?.[key] || 'unknown',
        value: typeof value === 'number' ? value : 0,
        dependsOn: extractDependencies(key, poseData),
        timestamp: Date.now(),
      });
    });
  }

  // Extract Layer C: Coaching decisions
  if (aiAnalysis.recommendations) {
    aiAnalysis.recommendations.forEach((rec: any, index: number) => {
      layerC.push({
        id: `decision_${index}`,
        category: rec.category || 'general',
        description: rec.text || '',
        priority: rec.priority || 'medium',
        basedOnMetrics: rec.basedOnMetrics || [],
        timestamp: Date.now(),
      });
    });
  }

  return { layerA, layerB, layerC };
}

/**
 * Extract dependencies for a derived metric.
 * Maps metric names to the raw measurements they depend on.
 *
 * @param metricName - Name of the derived metric
 * @param poseData - Raw pose data
 * @returns List of raw measurement IDs this metric depends on
 */
function extractDependencies(metricName: string, poseData: Record<string, any>): string[] {
  // Common metric → keypoint dependency mapping
  const dependencyMap: Record<string, string[]> = {
    'knee_angle': ['keypoint_9', 'keypoint_10', 'keypoint_8'],
    'hip_angle': ['keypoint_11', 'keypoint_12', 'keypoint_9'],
    'shoulder_rotation': ['keypoint_5', 'keypoint_6'],
    'spine_alignment': ['keypoint_5', 'keypoint_6', 'keypoint_11', 'keypoint_12'],
    'ankle_stability': ['keypoint_15', 'keypoint_16'],
  };

  return dependencyMap[metricName] || [];
}

/**
 * Validate Layer A immutability — ensure no update operations on raw measurements
 *
 * @param layers - Separated layers
 * @returns true if Layer A has no update methods
 */
export function validateLayerAImmutability(layers: SeparatedLayers): boolean {
  // Layer A must be read-only; check that all entries are frozen or readonly
  for (const measurement of layers.layerA) {
    // Verify the object is not mutable
    if (Object.isExtensible(measurement)) {
      // Note: In practice, TypeScript readonly prevents assignment at compile time
      // This runtime check is defensive
      console.warn(`Layer A measurement ${measurement.id} is not immutable`);
      return false;
    }
  }
  return true;
}

/**
 * Validate layer dependency: B depends on A, C depends on B
 *
 * @param layer - Layer to validate ('A', 'B', or 'C')
 * @param sourceLayer - Source layers for dependency checking
 * @returns true if dependencies are valid
 */
export function validateLayerDependency(
  layer: 'A' | 'B' | 'C',
  layers: SeparatedLayers
): boolean {
  if (layer === 'A') {
    // Layer A has no dependencies
    return true;
  }

  if (layer === 'B') {
    // Validate that Layer B only references Layer A
    for (const metric of layers.layerB) {
      for (const dep of metric.dependsOn) {
        const found = layers.layerA.some((m) => m.id === dep);
        if (!found) {
          console.warn(`Layer B metric ${metric.id} references unknown Layer A measurement ${dep}`);
          return false;
        }
      }
    }
    return true;
  }

  if (layer === 'C') {
    // Validate that Layer C only references Layer B
    for (const decision of layers.layerC) {
      for (const dep of decision.basedOnMetrics) {
        const found = layers.layerB.some((m) => m.id === dep);
        if (!found) {
          console.warn(`Layer C decision ${decision.id} references unknown Layer B metric ${dep}`);
          return false;
        }
      }
    }
    return true;
  }

  return false;
}

/**
 * Validate layer separation: ensure no cross-contamination.
 *
 * @param layers - Separated layers
 * @returns true if validation passes, false otherwise
 */
export function validateLayerSeparation(layers: SeparatedLayers): boolean {
  // Validate all three layers
  return (
    validateLayerDependency('A', layers) &&
    validateLayerDependency('B', layers) &&
    validateLayerDependency('C', layers)
  );
}
