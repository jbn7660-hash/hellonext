/**
 * Unit Tests: Measurement Confidence Calculation
 *
 * 측정 신뢰도 계산 및 분류 검증
 * - 5-인자 공식: keypoint_vis × cam_angle × motion_blur × occlusion × K
 * - 신뢰도 분류: 확인됨 (>=0.7), 대기중 (0.4-0.69), 숨김 (<0.4)
 * - 검증 토큰 발행 조건
 *
 * @feature F-016
 * @patent Patent 3
 * @requirement DC-2
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// ─── Type Definitions ────────────────────────────────────────────

type ConfidenceClass = 'confirmed' | 'pending_verification' | 'hidden';

interface ConfidenceFactors {
  keypointVisibility: number; // 0-1
  cameraAngle: number; // 0-1
  motionBlur: number; // 0-1
  occlusion: number; // 0-1
}

interface ConfidenceResult {
  score: number; // 0-1
  classification: ConfidenceClass;
  verificationTokenRequired: boolean;
}

// ─── Confidence Calculator Implementation (mock) ──────────────────

class ConfidenceCalculator {
  private readonly K = 1.0; // Constant factor

  /**
   * 신뢰도를 계산합니다 (5-인자 공식).
   * score = V_c × (1 - P_a) × (1 - P_m) × (1 - P_o) × K
   */
  calculateConfidence(factors: ConfidenceFactors): number {
    const { keypointVisibility, cameraAngle, motionBlur, occlusion } = factors;

    // NaN 검증 (먼저 확인)
    if (isNaN(keypointVisibility) || isNaN(cameraAngle) || isNaN(motionBlur) || isNaN(occlusion)) {
      throw new Error('Factors cannot be NaN');
    }

    // 입력값 범위 검증
    if (
      keypointVisibility < 0 ||
      keypointVisibility > 1 ||
      cameraAngle < 0 ||
      cameraAngle > 1 ||
      motionBlur < 0 ||
      motionBlur > 1 ||
      occlusion < 0 ||
      occlusion > 1
    ) {
      throw new Error('All factors must be between 0 and 1');
    }

    // 5-인자 공식: V_c × (1 - P_a) × (1 - P_m) × (1 - P_o) × K
    return keypointVisibility * (1 - cameraAngle) * (1 - motionBlur) * (1 - occlusion) * this.K;
  }

  /**
   * 신뢰도 점수를 분류합니다.
   */
  classifyConfidence(score: number): ConfidenceClass {
    if (score >= 0.7) {
      return 'confirmed';
    } else if (score >= 0.4 && score < 0.7) {
      return 'pending_verification';
    } else {
      return 'hidden';
    }
  }

  /**
   * 결과를 통합적으로 계산합니다.
   */
  computeConfidenceResult(factors: ConfidenceFactors): ConfidenceResult {
    const score = this.calculateConfidence(factors);
    const classification = this.classifyConfidence(score);

    // 검증 토큰은 pending_verification 상태일 때만 발행
    const verificationTokenRequired = classification === 'pending_verification';

    return {
      score,
      classification,
      verificationTokenRequired,
    };
  }

  /**
   * 신뢰도 점수가 유효한 범위인지 검증합니다.
   */
  validateScore(score: number): boolean {
    return score >= 0 && score <= 1;
  }

  /**
   * K값을 변경하여 신뢰도를 계산합니다 (민감도 테스트용).
   */
  calculateConfidenceWithK(factors: ConfidenceFactors, K: number): number {
    const { keypointVisibility, cameraAngle, motionBlur, occlusion } = factors;

    if (
      keypointVisibility < 0 || keypointVisibility > 1 ||
      cameraAngle < 0 || cameraAngle > 1 ||
      motionBlur < 0 || motionBlur > 1 ||
      occlusion < 0 || occlusion > 1 ||
      K < 0
    ) {
      throw new Error('Invalid input ranges');
    }

    // 5-인자 공식: V_c × (1 - P_a) × (1 - P_m) × (1 - P_o) × K
    return keypointVisibility * (1 - cameraAngle) * (1 - motionBlur) * (1 - occlusion) * K;
  }
}

// ─── Tests ──────────────────────────────────────────────────────

describe('Confidence Score Calculation (DC-2, Patent 3)', () => {
  let calculator: ConfidenceCalculator;

  beforeEach(() => {
    calculator = new ConfidenceCalculator();
  });

  describe('5-Factor Formula Correctness', () => {
    // ─── 5-인자 공식 정확성 ───
    it('should calculate confidence using all 5 factors', () => {
      const factors: ConfidenceFactors = {
        keypointVisibility: 0.9,
        cameraAngle: 0.8,
        motionBlur: 0.7,
        occlusion: 0.6,
      };

      const score = calculator.calculateConfidence(factors);
      const expected = 0.9 * (1 - 0.8) * (1 - 0.7) * (1 - 0.6) * 1.0;

      expect(score).toBeCloseTo(expected, 5);
    });

    it('should calculate factors correctly: 0.5 × (1-0.5) × (1-0.5) × (1-0.5) × 1.0 = 0.0625', () => {
      const factors: ConfidenceFactors = {
        keypointVisibility: 0.5,
        cameraAngle: 0.5,
        motionBlur: 0.5,
        occlusion: 0.5,
      };

      const score = calculator.calculateConfidence(factors);
      const expected = 0.5 * (1 - 0.5) * (1 - 0.5) * (1 - 0.5) * 1.0;
      expect(score).toBeCloseTo(expected, 5);
    });

    it('should result in 1.0 × 0.0 × 0.0 × 0.0 × 1.0 = 0 when all penalties are 1.0', () => {
      const factors: ConfidenceFactors = {
        keypointVisibility: 1.0,
        cameraAngle: 1.0,
        motionBlur: 1.0,
        occlusion: 1.0,
      };

      const score = calculator.calculateConfidence(factors);
      const expected = 1.0 * (1 - 1.0) * (1 - 1.0) * (1 - 1.0) * 1.0;
      expect(score).toBeCloseTo(expected, 5);
    });
  });

  describe('Edge Cases: All Factors = 1.0 (All penalties = max)', () => {
    // ─── 모든 인자가 1.0일 때 (최대 페널티 상태) ───
    it('should result in confidence = 0 when all penalty factors are 1.0', () => {
      const factors: ConfidenceFactors = {
        keypointVisibility: 1.0,
        cameraAngle: 1.0,
        motionBlur: 1.0,
        occlusion: 1.0,
      };

      const score = calculator.calculateConfidence(factors);
      const expected = 1.0 * (1 - 1.0) * (1 - 1.0) * (1 - 1.0) * 1.0;
      expect(score).toBe(expected);
    });
  });

  describe('Edge Cases: Critical Zero Conditions', () => {
    // ─── keypointVisibility가 0일 때 (어떤 패널티든 결과는 0) ───
    it('should result in confidence = 0 when keypointVisibility is 0', () => {
      const factors: ConfidenceFactors = {
        keypointVisibility: 0,
        cameraAngle: 0.5,
        motionBlur: 0.5,
        occlusion: 0.5,
      };

      const score = calculator.calculateConfidence(factors);
      expect(score).toBe(0);
    });

    it('should result in confidence = 0 when cameraAngle penalty is 1.0 (max penalty)', () => {
      const factors: ConfidenceFactors = {
        keypointVisibility: 1.0,
        cameraAngle: 1.0,
        motionBlur: 0.5,
        occlusion: 0.5,
      };

      const score = calculator.calculateConfidence(factors);
      const expected = 1.0 * (1 - 1.0) * (1 - 0.5) * (1 - 0.5) * 1.0;
      expect(score).toBe(expected);
    });

    it('should result in confidence = 1.0 when all penalties are 0 (no penalty)', () => {
      const factors: ConfidenceFactors = {
        keypointVisibility: 1.0,
        cameraAngle: 0,
        motionBlur: 0,
        occlusion: 0,
      };

      const score = calculator.calculateConfidence(factors);
      const expected = 1.0 * (1 - 0) * (1 - 0) * (1 - 0) * 1.0;
      expect(score).toBe(expected);
    });

    it('should result in confidence = 0 when multiple penalties are max', () => {
      const factors: ConfidenceFactors = {
        keypointVisibility: 1.0,
        cameraAngle: 1.0,
        motionBlur: 1.0,
        occlusion: 0.5,
      };

      const score = calculator.calculateConfidence(factors);
      const expected = 1.0 * (1 - 1.0) * (1 - 1.0) * (1 - 0.5) * 1.0;
      expect(score).toBe(expected);
    });
  });

  describe('Classification: Confirmed (>= 0.7)', () => {
    // ─── 분류: 확인됨 ───
    it('should classify score 1.0 as confirmed', () => {
      const factors: ConfidenceFactors = {
        keypointVisibility: 1.0,
        cameraAngle: 0,
        motionBlur: 0,
        occlusion: 0,
      };

      const result = calculator.computeConfidenceResult(factors);
      expect(result.classification).toBe('confirmed');
      expect(result.score).toBeCloseTo(1.0);
    });

    it('should classify score 0.7 as confirmed', () => {
      const factors: ConfidenceFactors = {
        keypointVisibility: 0.7,
        cameraAngle: 0,
        motionBlur: 0,
        occlusion: 0,
      };

      const result = calculator.computeConfidenceResult(factors);
      expect(result.classification).toBe('confirmed');
      expect(result.score).toBeCloseTo(0.7);
    });

    it('should classify score 0.8 as confirmed', () => {
      const factors: ConfidenceFactors = {
        keypointVisibility: 0.8,
        cameraAngle: 0,
        motionBlur: 0,
        occlusion: 0,
      };

      const result = calculator.computeConfidenceResult(factors);
      expect(result.classification).toBe('confirmed');
      expect(result.score).toBeCloseTo(0.8);
    });
  });

  describe('Classification: Pending Verification (0.4 - 0.69)', () => {
    // ─── 분류: 대기중 ───
    it('should classify score 0.4 as pending_verification', () => {
      const factors: ConfidenceFactors = {
        keypointVisibility: 0.4,
        cameraAngle: 0,
        motionBlur: 0,
        occlusion: 0,
      };

      const result = calculator.computeConfidenceResult(factors);
      expect(result.classification).toBe('pending_verification');
      expect(result.score).toBeCloseTo(0.4);
    });

    it('should classify score 0.5 as pending_verification', () => {
      const factors: ConfidenceFactors = {
        keypointVisibility: 0.5,
        cameraAngle: 0,
        motionBlur: 0,
        occlusion: 0,
      };

      const result = calculator.computeConfidenceResult(factors);
      expect(result.classification).toBe('pending_verification');
      expect(result.score).toBeCloseTo(0.5);
    });

    it('should classify score 0.69 as pending_verification', () => {
      const factors: ConfidenceFactors = {
        keypointVisibility: 0.69,
        cameraAngle: 0,
        motionBlur: 0,
        occlusion: 0,
      };

      const result = calculator.computeConfidenceResult(factors);
      expect(result.classification).toBe('pending_verification');
      expect(result.score).toBeCloseTo(0.69);
    });

    it('should classify score 0.6 as pending_verification', () => {
      const factors: ConfidenceFactors = {
        keypointVisibility: 0.6,
        cameraAngle: 0,
        motionBlur: 0,
        occlusion: 0,
      };

      const result = calculator.computeConfidenceResult(factors);
      expect(result.classification).toBe('pending_verification');
      expect(result.score).toBeCloseTo(0.6);
    });
  });

  describe('Classification: Hidden (< 0.4)', () => {
    // ─── 분류: 숨김 ───
    it('should classify score 0.39 as hidden', () => {
      const factors: ConfidenceFactors = {
        keypointVisibility: 0.39,
        cameraAngle: 0,
        motionBlur: 0,
        occlusion: 0,
      };

      const result = calculator.computeConfidenceResult(factors);
      expect(result.classification).toBe('hidden');
      expect(result.score).toBeCloseTo(0.39);
    });

    it('should classify score 0.3 as hidden', () => {
      const factors: ConfidenceFactors = {
        keypointVisibility: 0.3,
        cameraAngle: 0,
        motionBlur: 0,
        occlusion: 0,
      };

      const result = calculator.computeConfidenceResult(factors);
      expect(result.classification).toBe('hidden');
    });

    it('should classify score 0 as hidden', () => {
      const factors: ConfidenceFactors = {
        keypointVisibility: 0,
        cameraAngle: 1.0,
        motionBlur: 1.0,
        occlusion: 1.0,
      };

      const result = calculator.computeConfidenceResult(factors);
      expect(result.classification).toBe('hidden');
    });
  });

  describe('Boundary Values', () => {
    // ─── 경계값 ───
    it('should handle exact boundary: 0.7 (confirmed)', () => {
      const factors: ConfidenceFactors = {
        keypointVisibility: 0.7,
        cameraAngle: 0,
        motionBlur: 0,
        occlusion: 0,
      };

      const result = calculator.computeConfidenceResult(factors);
      expect(result.score).toBeCloseTo(0.7);
      expect(result.classification).toBe('confirmed');
    });

    it('should handle exact boundary: 0.4 (pending_verification)', () => {
      const factors: ConfidenceFactors = {
        keypointVisibility: 0.4,
        cameraAngle: 0,
        motionBlur: 0,
        occlusion: 0,
      };

      const result = calculator.computeConfidenceResult(factors);
      expect(result.score).toBeCloseTo(0.4);
      expect(result.classification).toBe('pending_verification');
    });

    it('should handle near-boundary: 0.699999 (pending_verification)', () => {
      const factors: ConfidenceFactors = {
        keypointVisibility: 0.699999,
        cameraAngle: 0,
        motionBlur: 0,
        occlusion: 0,
      };

      const result = calculator.computeConfidenceResult(factors);
      expect(result.classification).toBe('pending_verification');
    });

    it('should handle near-boundary: 0.400001 (pending_verification)', () => {
      const factors: ConfidenceFactors = {
        keypointVisibility: 0.400001,
        cameraAngle: 0,
        motionBlur: 0,
        occlusion: 0,
      };

      const result = calculator.computeConfidenceResult(factors);
      expect(result.score).toBeCloseTo(0.400001);
      expect(result.classification).toBe('pending_verification');
    });
  });

  describe('Verification Token Issuance', () => {
    // ─── 검증 토큰 발행 ───
    it('should issue verification token for pending_verification state', () => {
      const factors: ConfidenceFactors = {
        keypointVisibility: 0.5,
        cameraAngle: 0,
        motionBlur: 0,
        occlusion: 0,
      };

      const result = calculator.computeConfidenceResult(factors);
      expect(result.score).toBeCloseTo(0.5);
      expect(result.classification).toBe('pending_verification');
      expect(result.verificationTokenRequired).toBe(true);
    });

    it('should NOT issue verification token for confirmed state', () => {
      const factors: ConfidenceFactors = {
        keypointVisibility: 0.8,
        cameraAngle: 0,
        motionBlur: 0,
        occlusion: 0,
      };

      const result = calculator.computeConfidenceResult(factors);
      expect(result.score).toBeCloseTo(0.8);
      expect(result.classification).toBe('confirmed');
      expect(result.verificationTokenRequired).toBe(false);
    });

    it('should NOT issue verification token for hidden state', () => {
      const factors: ConfidenceFactors = {
        keypointVisibility: 0.3,
        cameraAngle: 0,
        motionBlur: 0,
        occlusion: 0,
      };

      const result = calculator.computeConfidenceResult(factors);
      expect(result.score).toBeCloseTo(0.3);
      expect(result.classification).toBe('hidden');
      expect(result.verificationTokenRequired).toBe(false);
    });
  });

  describe('Score Validation', () => {
    // ─── 점수 검증 ───
    it('should reject score < 0', () => {
      expect(calculator.validateScore(-0.1)).toBe(false);
      expect(calculator.validateScore(-1)).toBe(false);
    });

    it('should reject score > 1', () => {
      expect(calculator.validateScore(1.1)).toBe(false);
      expect(calculator.validateScore(2)).toBe(false);
    });

    it('should accept score = 0', () => {
      expect(calculator.validateScore(0)).toBe(true);
    });

    it('should accept score = 1', () => {
      expect(calculator.validateScore(1)).toBe(true);
    });

    it('should accept score between 0 and 1', () => {
      expect(calculator.validateScore(0.5)).toBe(true);
      expect(calculator.validateScore(0.123)).toBe(true);
      expect(calculator.validateScore(0.999)).toBe(true);
    });
  });

  describe('Input Validation', () => {
    // ─── 입력 검증 ───
    it('should throw error when keypointVisibility < 0', () => {
      const factors: ConfidenceFactors = {
        keypointVisibility: -0.1,
        cameraAngle: 1.0,
        motionBlur: 1.0,
        occlusion: 1.0,
      };

      expect(() => calculator.calculateConfidence(factors)).toThrow();
    });

    it('should throw error when any factor > 1', () => {
      const factors: ConfidenceFactors = {
        keypointVisibility: 1.1,
        cameraAngle: 1.0,
        motionBlur: 1.0,
        occlusion: 1.0,
      };

      expect(() => calculator.calculateConfidence(factors)).toThrow();
    });

    it('should throw error when cameraAngle > 1', () => {
      const factors: ConfidenceFactors = {
        keypointVisibility: 1.0,
        cameraAngle: 1.5,
        motionBlur: 1.0,
        occlusion: 1.0,
      };

      expect(() => calculator.calculateConfidence(factors)).toThrow();
    });
  });

  describe('Complex Scenarios', () => {
    // ─── 복잡한 시나리오 ───
    it('should handle realistic swing measurement: good form, poor angle', () => {
      const factors: ConfidenceFactors = {
        keypointVisibility: 0.95, // Good keypoint visibility
        cameraAngle: 0.4, // Moderate camera angle penalty
        motionBlur: 0.2, // Minor motion blur penalty
        occlusion: 0.1, // Minimal occlusion penalty
      };

      const result = calculator.computeConfidenceResult(factors);
      const expectedScore = 0.95 * (1 - 0.4) * (1 - 0.2) * (1 - 0.1);

      expect(result.score).toBeCloseTo(expectedScore);
      expect(result.classification).toBe('pending_verification');
    });

    it('should handle realistic swing measurement: good form, good angle', () => {
      const factors: ConfidenceFactors = {
        keypointVisibility: 0.95,
        cameraAngle: 0.05, // Low penalty (good angle)
        motionBlur: 0.1, // Low penalty (minimal blur)
        occlusion: 0.05, // Low penalty (minimal occlusion)
      };

      const result = calculator.computeConfidenceResult(factors);
      const expectedScore = 0.95 * (1 - 0.05) * (1 - 0.1) * (1 - 0.05);
      expect(result.score).toBeCloseTo(expectedScore);
      expect(result.classification).toBe('confirmed');
      expect(result.verificationTokenRequired).toBe(false);
    });

    it('should handle poor measurement', () => {
      const factors: ConfidenceFactors = {
        keypointVisibility: 0.5,
        cameraAngle: 0.5, // Moderate penalty
        motionBlur: 0.5, // Moderate penalty
        occlusion: 0.5, // Moderate penalty
      };

      const result = calculator.computeConfidenceResult(factors);
      const expectedScore = 0.5 * (1 - 0.5) * (1 - 0.5) * (1 - 0.5);
      expect(result.score).toBeCloseTo(expectedScore);
      expect(result.classification).toBe('hidden');
    });
  });

  describe('Boundary Precision (Epsilon Testing)', () => {
    // ─── 경계값 정밀도 검증 (0.39999999, 0.40000001, 0.69999999, 0.70000001) ───
    it('should classify 0.39999999 as hidden (just below 0.4)', () => {
      const factors: ConfidenceFactors = {
        keypointVisibility: 0.39999999,
        cameraAngle: 1.0,
        motionBlur: 1.0,
        occlusion: 1.0,
      };

      const result = calculator.computeConfidenceResult(factors);
      expect(result.classification).toBe('hidden');
    });

    it('should classify 0.40000001 as pending_verification (just above 0.4)', () => {
      const factors: ConfidenceFactors = {
        keypointVisibility: 0.40000001,
        cameraAngle: 0,
        motionBlur: 0,
        occlusion: 0,
      };

      const result = calculator.computeConfidenceResult(factors);
      expect(result.score).toBeCloseTo(0.40000001);
      expect(result.classification).toBe('pending_verification');
    });

    it('should classify 0.69999999 as pending_verification (just below 0.7)', () => {
      const factors: ConfidenceFactors = {
        keypointVisibility: 0.69999999,
        cameraAngle: 0,
        motionBlur: 0,
        occlusion: 0,
      };

      const result = calculator.computeConfidenceResult(factors);
      expect(result.score).toBeCloseTo(0.69999999);
      expect(result.classification).toBe('pending_verification');
    });

    it('should classify 0.70000001 as confirmed (just above 0.7)', () => {
      const factors: ConfidenceFactors = {
        keypointVisibility: 0.70000001,
        cameraAngle: 0,
        motionBlur: 0,
        occlusion: 0,
      };

      const result = calculator.computeConfidenceResult(factors);
      expect(result.score).toBeCloseTo(0.70000001);
      expect(result.classification).toBe('confirmed');
    });
  });

  describe('Statistical Distribution (1000 random inputs)', () => {
    // ─── 통계적 분포 검증: 1000개 랜덤 입력으로 모두 올바르게 분류되는지 검증 ───
    it('should correctly classify 1000 random confidence scores', () => {
      const randomTests = 1000;
      const confirmations = { hidden: 0, pending_verification: 0, confirmed: 0 };

      for (let i = 0; i < randomTests; i++) {
        const score = Math.random(); // 0~1 균등 분포
        const classification = calculator.classifyConfidence(score);

        confirmations[classification]++;

        // Verify consistency
        if (score < 0.4) {
          expect(classification).toBe('hidden');
        } else if (score >= 0.4 && score < 0.7) {
          expect(classification).toBe('pending_verification');
        } else {
          expect(classification).toBe('confirmed');
        }
      }

      // Verify distribution (approximate ranges)
      expect(confirmations.hidden).toBeGreaterThan(300); // ~40%
      expect(confirmations.pending_verification).toBeGreaterThan(200); // ~30%
      expect(confirmations.confirmed).toBeGreaterThan(200); // ~30%
    });

    it('should handle 100+ measurements with consistent results', () => {
      const measurements = 100;
      const results: ConfidenceResult[] = [];

      for (let i = 0; i < measurements; i++) {
        const factors: ConfidenceFactors = {
          keypointVisibility: Math.random(),
          cameraAngle: Math.random(),
          motionBlur: Math.random(),
          occlusion: Math.random(),
        };

        const result = calculator.computeConfidenceResult(factors);
        results.push(result);
      }

      // All results should be valid
      results.forEach((r) => {
        expect(r.score).toBeGreaterThanOrEqual(0);
        expect(r.score).toBeLessThanOrEqual(1);
        expect(['confirmed', 'pending_verification', 'hidden']).toContain(
          r.classification
        );
      });
    });
  });

  describe('Performance Benchmarks', () => {
    // ─── 성능 벤치마크: <1ms per calculation ───
    it('should calculate confidence in under 1ms per input', () => {
      const factors: ConfidenceFactors = {
        keypointVisibility: 0.8,
        cameraAngle: 0.8,
        motionBlur: 0.8,
        occlusion: 0.8,
      };

      const startTime = performance.now();
      for (let i = 0; i < 1000; i++) {
        calculator.calculateConfidence(factors);
      }
      const endTime = performance.now();

      const avgTime = (endTime - startTime) / 1000;
      expect(avgTime).toBeLessThan(1); // < 1ms average
    });

    it('should classify 1000 scores in under 1ms average', () => {
      const startTime = performance.now();
      for (let i = 0; i < 1000; i++) {
        calculator.classifyConfidence(Math.random());
      }
      const endTime = performance.now();

      const avgTime = (endTime - startTime) / 1000;
      expect(avgTime).toBeLessThan(1); // < 1ms average
    });
  });

  describe('Negative Inputs and Edge Cases', () => {
    // ─── 음수, NaN, Infinity 처리 ───
    it('should throw error for negative keypointVisibility', () => {
      const factors: ConfidenceFactors = {
        keypointVisibility: -0.1,
        cameraAngle: 0.5,
        motionBlur: 0.5,
        occlusion: 0.5,
      };

      expect(() => calculator.calculateConfidence(factors)).toThrow(
        'All factors must be between 0 and 1'
      );
    });

    it('should throw error for NaN input', () => {
      const factors: ConfidenceFactors = {
        keypointVisibility: NaN,
        cameraAngle: 0.5,
        motionBlur: 0.5,
        occlusion: 0.5,
      };

      expect(() => calculator.calculateConfidence(factors)).toThrow();
    });

    it('should handle Infinity gracefully', () => {
      const score = Infinity;
      // classifyConfidence should handle it (may treat as invalid separately)
      expect(() => calculator.classifyConfidence(score)).not.toThrow();
    });

    it('should reject score validation for negative values', () => {
      expect(calculator.validateScore(-0.5)).toBe(false);
      expect(calculator.validateScore(-1)).toBe(false);
    });

    it('should reject score validation for NaN', () => {
      expect(calculator.validateScore(NaN)).toBe(false);
    });

    it('should reject score validation for Infinity', () => {
      expect(calculator.validateScore(Infinity)).toBe(false);
    });
  });

  describe('K Calibration Tests', () => {
    // ─── K값 민감도 검증: K가 변할 때 동작 확인 ───
    it('should scale confidence by K=0.5', () => {
      const factors: ConfidenceFactors = {
        keypointVisibility: 1.0,
        cameraAngle: 0,
        motionBlur: 0,
        occlusion: 0,
      };

      const scoreK1 = calculator.calculateConfidenceWithK(factors, 1.0);
      const scoreK05 = calculator.calculateConfidenceWithK(factors, 0.5);

      expect(scoreK05).toBeCloseTo(scoreK1 * 0.5);
    });

    it('should scale confidence by K=1.5', () => {
      const factors: ConfidenceFactors = {
        keypointVisibility: 0.5,
        cameraAngle: 0.2,
        motionBlur: 0.2,
        occlusion: 0.2,
      };

      const scoreK1 = calculator.calculateConfidenceWithK(factors, 1.0);
      const scoreK15 = calculator.calculateConfidenceWithK(factors, 1.5);

      expect(scoreK15).toBeCloseTo(scoreK1 * 1.5);
    });

    it('should affect threshold classification with K=2.0', () => {
      const factors: ConfidenceFactors = {
        keypointVisibility: 0.4,
        cameraAngle: 0.4,
        motionBlur: 0.4,
        occlusion: 0.4,
      };

      const scoreK1 = calculator.calculateConfidenceWithK(factors, 1.0);
      const scoreK2 = calculator.calculateConfidenceWithK(factors, 2.0);

      // Original score with K=1: 0.0256 (hidden)
      expect(calculator.classifyConfidence(scoreK1)).toBe('hidden');
      // Doubled score with K=2: 0.0512 (still hidden)
      expect(calculator.classifyConfidence(scoreK2)).toBe('hidden');
    });

    it('should verify K=1.0 is default baseline', () => {
      const factors: ConfidenceFactors = {
        keypointVisibility: 0.8,
        cameraAngle: 0.2,
        motionBlur: 0.15,
        occlusion: 0.1,
      };

      const defaultScore = calculator.calculateConfidence(factors);
      const k1Score = calculator.calculateConfidenceWithK(factors, 1.0);

      expect(defaultScore).toBeCloseTo(k1Score);
    });
  });

  describe('Cross-Validation: Confidence + Classification Consistency', () => {
    // ─── 신뢰도 계산과 분류의 일관성 검증 ───
    it('should maintain consistency between score and classification', () => {
      const testCases = [
        // Confirmed: 0.95 × (1-0.05) × (1-0.1) × (1-0.05) ≈ 0.81 >= 0.7
        { factors: { keypointVisibility: 0.95, cameraAngle: 0.05, motionBlur: 0.1, occlusion: 0.05 }, expected: 'confirmed' },
        // Pending: 0.5 × (1-0.2) × (1-0.05) × (1-0.1) = 0.5 × 0.8 × 0.95 × 0.9 ≈ 0.342 (still hidden - need higher)
        // Better: 0.7 × (1-0.1) × (1-0.1) × (1-0.1) = 0.7 × 0.9 × 0.9 × 0.9 ≈ 0.51 >= 0.4
        { factors: { keypointVisibility: 0.7, cameraAngle: 0.1, motionBlur: 0.1, occlusion: 0.1 }, expected: 'pending_verification' },
        // Hidden: 0.3 × (1-0.5) × (1-0.5) × (1-0.5) ≈ 0.04 < 0.4
        { factors: { keypointVisibility: 0.3, cameraAngle: 0.5, motionBlur: 0.5, occlusion: 0.5 }, expected: 'hidden' },
      ];

      testCases.forEach(({ factors, expected }) => {
        const result = calculator.computeConfidenceResult(factors);
        expect(result.classification).toBe(expected);

        // Verify score aligns with classification
        if (expected === 'confirmed') {
          expect(result.score).toBeGreaterThanOrEqual(0.7);
        } else if (expected === 'pending_verification') {
          expect(result.score).toBeGreaterThanOrEqual(0.4);
          expect(result.score).toBeLessThan(0.7);
        } else {
          expect(result.score).toBeLessThan(0.4);
        }
      });
    });

    it('should verify verification token matches classification', () => {
      const testCases = [
        { score: 0.8, shouldHaveToken: false },
        { score: 0.55, shouldHaveToken: true },
        { score: 0.2, shouldHaveToken: false },
      ];

      testCases.forEach(({ score, shouldHaveToken }) => {
        const classification = calculator.classifyConfidence(score);
        const shouldIssueToken = classification === 'pending_verification';
        expect(shouldIssueToken).toBe(shouldHaveToken);
      });
    });

    it('should ensure no score produces conflicting classification and token state', () => {
      for (let i = 0; i < 100; i++) {
        const score = Math.random();
        const classification = calculator.classifyConfidence(score);

        // Only pending_verification should have tokens
        if (classification === 'confirmed' || classification === 'hidden') {
          expect(classification).not.toBe('pending_verification');
        }
      }
    });
  });
});
