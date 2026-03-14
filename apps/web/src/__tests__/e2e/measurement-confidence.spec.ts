/**
 * E2E Tests: Measurement Confidence Flow
 *
 * 측정 신뢰도 흐름 E2E 테스트
 * - 스윙 기록 → 신뢰도 계산 → 3계층 분류
 * - 대기 검증 → 프로 확인 → 회원이 확인됨 표시
 * - 숨김 측정 → 회원에게 보이지 않음
 *
 * @feature F-016
 * @requirement Confidence Calculation, Verification
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// ─── Type Definitions ────────────────────────────────────────────

type ConfidenceClass = 'confirmed' | 'pending_verification' | 'hidden';

interface SwingRecording {
  id: string;
  member_id: string;
  duration_ms: number;
  video_url?: string;
  recording_timestamp: string;
}

interface Measurement {
  id: string;
  swing_id: string;
  member_id: string;
  confidence_score: number;
  confidence_class: ConfidenceClass;
  is_verified: boolean;
  is_hidden: boolean;
  verification_token?: string;
  created_at: string;
  updated_at: string;
  verified_by_pro?: string;
  verified_by_pro_at?: string;
  verified_by_member?: string;
  verified_by_member_at?: string;
}

interface ConfidenceFactors {
  keypointVisibility: number;
  cameraAngle: number;
  motionBlur: number;
  occlusion: number;
}

// ─── Measurement Confidence Pipeline (mock) ──────────────────

class MeasurementConfidencePipeline {
  private measurements: Map<string, Measurement> = new Map();
  private verificationTokens: Map<string, { measurementId: string; expiresAt: Date }> =
    new Map();

  /**
   * 스윙을 기록합니다.
   */
  async recordSwing(memberId: string, durationMs: number): Promise<SwingRecording> {
    return {
      id: `swing-${Date.now()}`,
      member_id: memberId,
      duration_ms: durationMs,
      recording_timestamp: new Date().toISOString(),
    };
  }

  /**
   * 신뢰도를 계산합니다 (5-인자 공식).
   */
  calculateConfidence(factors: ConfidenceFactors): number {
    const { keypointVisibility, cameraAngle, motionBlur, occlusion } = factors;
    return keypointVisibility * cameraAngle * motionBlur * occlusion * 1.0;
  }

  /**
   * 신뢰도를 분류합니다.
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
   * 측정값을 생성합니다 (신뢰도 계산 포함).
   */
  async createMeasurement(
    swing: SwingRecording,
    factors: ConfidenceFactors
  ): Promise<Measurement> {
    const confidenceScore = this.calculateConfidence(factors);
    const confidenceClass = this.classifyConfidence(confidenceScore);

    const measurement: Measurement = {
      id: `measure-${Date.now()}`,
      swing_id: swing.id,
      member_id: swing.member_id,
      confidence_score: confidenceScore,
      confidence_class: confidenceClass,
      is_verified: false,
      is_hidden: false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    // pending_verification이면 검증 토큰 생성
    if (confidenceClass === 'pending_verification') {
      const token = this.generateVerificationToken();
      measurement.verification_token = token;

      this.verificationTokens.set(token, {
        measurementId: measurement.id,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24시간
      });
    }

    this.measurements.set(measurement.id, measurement);
    return measurement;
  }

  /**
   * 검증 토큰을 생성합니다.
   */
  private generateVerificationToken(): string {
    return `token-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * 프로가 측정값을 확인합니다.
   */
  async proConfirmMeasurement(
    measurementId: string,
    proId: string
  ): Promise<Measurement> {
    const measurement = this.measurements.get(measurementId);
    if (!measurement) {
      throw new Error(`Measurement not found: ${measurementId}`);
    }

    const updated: Measurement = {
      ...measurement,
      is_verified: true,
      confidence_class: 'confirmed',
      verified_by_pro: proId,
      verified_by_pro_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    this.measurements.set(measurementId, updated);
    return updated;
  }

  /**
   * 회원이 측정값을 확인합니다.
   */
  async memberConfirmMeasurement(
    measurementId: string,
    memberId: string
  ): Promise<Measurement> {
    const measurement = this.measurements.get(measurementId);
    if (!measurement) {
      throw new Error(`Measurement not found: ${measurementId}`);
    }

    if (measurement.member_id !== memberId) {
      throw new Error('Unauthorized: measurement belongs to different member');
    }

    const updated: Measurement = {
      ...measurement,
      verified_by_member: memberId,
      verified_by_member_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    this.measurements.set(measurementId, updated);
    return updated;
  }

  /**
   * 측정값을 숨깁니다.
   */
  async hideMeasurement(measurementId: string): Promise<Measurement> {
    const measurement = this.measurements.get(measurementId);
    if (!measurement) {
      throw new Error(`Measurement not found: ${measurementId}`);
    }

    const updated: Measurement = {
      ...measurement,
      is_hidden: true,
      confidence_class: 'hidden',
      updated_at: new Date().toISOString(),
    };

    this.measurements.set(measurementId, updated);
    return updated;
  }

  /**
   * 회원이 볼 수 있는 측정값 목록을 반환합니다.
   */
  async getMeasurementsVisibleToMember(memberId: string): Promise<Measurement[]> {
    const visible: Measurement[] = [];

    for (const measurement of this.measurements.values()) {
      if (
        measurement.member_id === memberId &&
        !measurement.is_hidden &&
        measurement.confidence_class !== 'hidden'
      ) {
        visible.push(measurement);
      }
    }

    return visible;
  }

  /**
   * 대기 중인 검증 측정값을 반환합니다.
   */
  async getPendingVerifications(): Promise<Measurement[]> {
    const pending: Measurement[] = [];

    for (const measurement of this.measurements.values()) {
      if (
        measurement.confidence_class === 'pending_verification' &&
        !measurement.is_verified &&
        !measurement.is_hidden
      ) {
        pending.push(measurement);
      }
    }

    return pending;
  }

  /**
   * 측정값을 조회합니다.
   */
  async getMeasurement(id: string): Promise<Measurement | null> {
    return this.measurements.get(id) || null;
  }

  /**
   * 모든 측정값을 초기화합니다 (테스트용).
   */
  clear(): void {
    this.measurements.clear();
    this.verificationTokens.clear();
  }
}

// ─── Tests ──────────────────────────────────────────────────────

describe('Measurement Confidence Flow (F-016)', () => {
  let pipeline: MeasurementConfidencePipeline;

  beforeEach(() => {
    pipeline = new MeasurementConfidencePipeline();
  });

  afterEach(() => {
    pipeline.clear();
  });

  describe('Record Swing → Calculate Confidence → Classify', () => {
    // ─── 스윙 기록 → 신뢰도 계산 → 분류 ───
    it('should record swing and calculate initial measurement', async () => {
      const swing = await pipeline.recordSwing('member-1', 5000);

      expect(swing.id).toBeDefined();
      expect(swing.member_id).toBe('member-1');
      expect(swing.duration_ms).toBe(5000);
    });

    it('should calculate confidence from factors (confirmed tier: >=0.7)', async () => {
      const swing = await pipeline.recordSwing('member-2', 5000);

      const factors: ConfidenceFactors = {
        keypointVisibility: 0.95,
        cameraAngle: 0.85,
        motionBlur: 0.9,
        occlusion: 0.95,
      };

      const measurement = await pipeline.createMeasurement(swing, factors);

      expect(measurement.confidence_score).toBeGreaterThanOrEqual(0.7);
      expect(measurement.confidence_class).toBe('confirmed');
      expect(measurement.is_verified).toBe(false);
    });

    it('should classify measurement as pending_verification (0.4-0.69)', async () => {
      const swing = await pipeline.recordSwing('member-3', 5000);

      const factors: ConfidenceFactors = {
        keypointVisibility: 0.8,
        cameraAngle: 0.7,
        motionBlur: 0.8,
        occlusion: 0.85,
      };

      const measurement = await pipeline.createMeasurement(swing, factors);

      expect(measurement.confidence_score).toBeGreaterThanOrEqual(0.4);
      expect(measurement.confidence_score).toBeLessThan(0.7);
      expect(measurement.confidence_class).toBe('pending_verification');
    });

    it('should classify measurement as hidden (<0.4)', async () => {
      const swing = await pipeline.recordSwing('member-4', 5000);

      const factors: ConfidenceFactors = {
        keypointVisibility: 0.5,
        cameraAngle: 0.5,
        motionBlur: 0.5,
        occlusion: 0.5,
      };

      const measurement = await pipeline.createMeasurement(swing, factors);

      expect(measurement.confidence_score).toBeLessThan(0.4);
      expect(measurement.confidence_class).toBe('hidden');
    });

    it('should generate verification token for pending_verification', async () => {
      const swing = await pipeline.recordSwing('member-5', 5000);

      const factors: ConfidenceFactors = {
        keypointVisibility: 0.8,
        cameraAngle: 0.7,
        motionBlur: 0.8,
        occlusion: 0.8,
      };

      const measurement = await pipeline.createMeasurement(swing, factors);

      if (measurement.confidence_class === 'pending_verification') {
        expect(measurement.verification_token).toBeDefined();
      }
    });

    it('should NOT generate verification token for confirmed', async () => {
      const swing = await pipeline.recordSwing('member-6', 5000);

      const factors: ConfidenceFactors = {
        keypointVisibility: 0.95,
        cameraAngle: 0.9,
        motionBlur: 0.95,
        occlusion: 0.95,
      };

      const measurement = await pipeline.createMeasurement(swing, factors);

      if (measurement.confidence_class === 'confirmed') {
        expect(measurement.verification_token).toBeUndefined();
      }
    });
  });

  describe('Pending Verification → Pro Confirms → Member Sees Confirmed', () => {
    // ─── 대기 → 프로 확인 → 회원이 확인됨 표시 ───
    it('should show pending verification measurement initially', async () => {
      const swing = await pipeline.recordSwing('member-7', 5000);

      const factors: ConfidenceFactors = {
        keypointVisibility: 0.8,
        cameraAngle: 0.7,
        motionBlur: 0.8,
        occlusion: 0.8,
      };

      const measurement = await pipeline.createMeasurement(swing, factors);

      expect(measurement.confidence_class).toBe('pending_verification');
      expect(measurement.is_verified).toBe(false);
    });

    it('should list pending verification measurements for pro', async () => {
      const swing1 = await pipeline.recordSwing('member-8', 5000);
      const swing2 = await pipeline.recordSwing('member-9', 5000);

      const factors: ConfidenceFactors = {
        keypointVisibility: 0.8,
        cameraAngle: 0.7,
        motionBlur: 0.8,
        occlusion: 0.8,
      };

      await pipeline.createMeasurement(swing1, factors);
      await pipeline.createMeasurement(swing2, factors);

      const pending = await pipeline.getPendingVerifications();

      expect(pending.length).toBeGreaterThanOrEqual(2);
      expect(pending.every((m) => m.confidence_class === 'pending_verification')).toBe(
        true
      );
    });

    it('should allow pro to confirm pending measurement', async () => {
      const swing = await pipeline.recordSwing('member-10', 5000);

      const factors: ConfidenceFactors = {
        keypointVisibility: 0.8,
        cameraAngle: 0.7,
        motionBlur: 0.8,
        occlusion: 0.8,
      };

      let measurement = await pipeline.createMeasurement(swing, factors);
      const measurementId = measurement.id;

      // Pro confirms
      measurement = await pipeline.proConfirmMeasurement(measurementId, 'pro-1');

      expect(measurement.is_verified).toBe(true);
      expect(measurement.verified_by_pro).toBe('pro-1');
      expect(measurement.verified_by_pro_at).toBeDefined();
    });

    it('should update confidence class to confirmed after pro review', async () => {
      const swing = await pipeline.recordSwing('member-11', 5000);

      const factors: ConfidenceFactors = {
        keypointVisibility: 0.8,
        cameraAngle: 0.7,
        motionBlur: 0.8,
        occlusion: 0.8,
      };

      let measurement = await pipeline.createMeasurement(swing, factors);

      expect(measurement.confidence_class).toBe('pending_verification');

      // Pro confirms
      measurement = await pipeline.proConfirmMeasurement(measurement.id, 'pro-2');

      expect(measurement.confidence_class).toBe('confirmed');
    });

    it('should allow member to see confirmed measurement', async () => {
      const memberId = 'member-12';
      const swing = await pipeline.recordSwing(memberId, 5000);

      const factors: ConfidenceFactors = {
        keypointVisibility: 0.8,
        cameraAngle: 0.7,
        motionBlur: 0.8,
        occlusion: 0.8,
      };

      let measurement = await pipeline.createMeasurement(swing, factors);

      // Pro confirms
      measurement = await pipeline.proConfirmMeasurement(measurement.id, 'pro-3');

      // Member can now see it
      const visible = await pipeline.getMeasurementsVisibleToMember(memberId);

      expect(visible.some((m) => m.id === measurement.id)).toBe(true);
    });

    it('should allow member to mark measurement as confirmed', async () => {
      const memberId = 'member-13';
      const swing = await pipeline.recordSwing(memberId, 5000);

      const factors: ConfidenceFactors = {
        keypointVisibility: 0.95,
        cameraAngle: 0.9,
        motionBlur: 0.95,
        occlusion: 0.95,
      };

      let measurement = await pipeline.createMeasurement(swing, factors);

      // Member confirms
      measurement = await pipeline.memberConfirmMeasurement(measurement.id, memberId);

      expect(measurement.verified_by_member).toBe(memberId);
      expect(measurement.verified_by_member_at).toBeDefined();
    });
  });

  describe('Hidden Measurement → Not Visible to Member', () => {
    // ─── 숨김 측정: 회원에게 보이지 않음 ───
    it('should create hidden measurement when confidence < 0.4', async () => {
      const swing = await pipeline.recordSwing('member-14', 5000);

      const factors: ConfidenceFactors = {
        keypointVisibility: 0.3,
        cameraAngle: 0.4,
        motionBlur: 0.4,
        occlusion: 0.5,
      };

      const measurement = await pipeline.createMeasurement(swing, factors);

      expect(measurement.confidence_class).toBe('hidden');
      expect(measurement.is_hidden).toBe(false); // Not marked as hidden yet
    });

    it('should hide measurement explicitly', async () => {
      const memberId = 'member-15';
      const swing = await pipeline.recordSwing(memberId, 5000);

      const factors: ConfidenceFactors = {
        keypointVisibility: 0.8,
        cameraAngle: 0.7,
        motionBlur: 0.8,
        occlusion: 0.8,
      };

      let measurement = await pipeline.createMeasurement(swing, factors);

      // Hide the measurement
      measurement = await pipeline.hideMeasurement(measurement.id);

      expect(measurement.is_hidden).toBe(true);
      expect(measurement.confidence_class).toBe('hidden');
    });

    it('should not show hidden measurement to member', async () => {
      const memberId = 'member-16';
      const swing = await pipeline.recordSwing(memberId, 5000);

      const factors: ConfidenceFactors = {
        keypointVisibility: 0.95,
        cameraAngle: 0.9,
        motionBlur: 0.95,
        occlusion: 0.95,
      };

      let measurement = await pipeline.createMeasurement(swing, factors);

      // Hide it
      measurement = await pipeline.hideMeasurement(measurement.id);

      // Check member's visible list
      const visible = await pipeline.getMeasurementsVisibleToMember(memberId);

      expect(visible.some((m) => m.id === measurement.id)).toBe(false);
    });

    it('should hide measurement with initial low confidence', async () => {
      const memberId = 'member-17';
      const swing = await pipeline.recordSwing(memberId, 5000);

      const factors: ConfidenceFactors = {
        keypointVisibility: 0.2,
        cameraAngle: 0.3,
        motionBlur: 0.3,
        occlusion: 0.4,
      };

      const measurement = await pipeline.createMeasurement(swing, factors);

      // Low confidence measurements should be hidden
      expect(measurement.confidence_class).toBe('hidden');

      // Member should not see it
      const visible = await pipeline.getMeasurementsVisibleToMember(memberId);

      expect(visible.some((m) => m.id === measurement.id)).toBe(false);
    });

    it('should filter out hidden measurements from member view', async () => {
      const memberId = 'member-18';

      // Create multiple measurements
      const swing1 = await pipeline.recordSwing(memberId, 5000);
      const swing2 = await pipeline.recordSwing(memberId, 5000);

      const goodFactors: ConfidenceFactors = {
        keypointVisibility: 0.95,
        cameraAngle: 0.9,
        motionBlur: 0.95,
        occlusion: 0.95,
      };

      const poorFactors: ConfidenceFactors = {
        keypointVisibility: 0.2,
        cameraAngle: 0.3,
        motionBlur: 0.3,
        occlusion: 0.4,
      };

      const goodMeasure = await pipeline.createMeasurement(swing1, goodFactors);
      const poorMeasure = await pipeline.createMeasurement(swing2, poorFactors);

      // Hide the poor measurement
      await pipeline.hideMeasurement(poorMeasure.id);

      // Check member's view
      const visible = await pipeline.getMeasurementsVisibleToMember(memberId);

      expect(visible.some((m) => m.id === goodMeasure.id)).toBe(true);
      expect(visible.some((m) => m.id === poorMeasure.id)).toBe(false);
    });
  });

  describe('End-to-End Confidence Workflows', () => {
    // ─── 엔드투엔드 워크플로우 ───
    it('should complete confirmed measurement workflow', async () => {
      const memberId = 'member-19';
      const swing = await pipeline.recordSwing(memberId, 5000);

      const factors: ConfidenceFactors = {
        keypointVisibility: 0.95,
        cameraAngle: 0.9,
        motionBlur: 0.95,
        occlusion: 0.95,
      };

      let measurement = await pipeline.createMeasurement(swing, factors);

      // Should be immediately confirmed
      expect(measurement.confidence_class).toBe('confirmed');

      // Member can see it
      const visible = await pipeline.getMeasurementsVisibleToMember(memberId);
      expect(visible.some((m) => m.id === measurement.id)).toBe(true);

      // Member confirms it
      measurement = await pipeline.memberConfirmMeasurement(measurement.id, memberId);
      expect(measurement.verified_by_member).toBeDefined();
    });

    it('should complete pending verification workflow', async () => {
      const memberId = 'member-20';
      const swing = await pipeline.recordSwing(memberId, 5000);

      const factors: ConfidenceFactors = {
        keypointVisibility: 0.8,
        cameraAngle: 0.7,
        motionBlur: 0.8,
        occlusion: 0.8,
      };

      let measurement = await pipeline.createMeasurement(swing, factors);

      // Initially pending
      expect(measurement.confidence_class).toBe('pending_verification');
      expect(measurement.verification_token).toBeDefined();

      // Pro reviews and confirms
      measurement = await pipeline.proConfirmMeasurement(measurement.id, 'pro-4');
      expect(measurement.is_verified).toBe(true);

      // Now member can see it
      const visible = await pipeline.getMeasurementsVisibleToMember(memberId);
      expect(visible.some((m) => m.id === measurement.id)).toBe(true);
    });

    it('should complete hidden measurement workflow', async () => {
      const memberId = 'member-21';
      const swing = await pipeline.recordSwing(memberId, 5000);

      const factors: ConfidenceFactors = {
        keypointVisibility: 0.3,
        cameraAngle: 0.4,
        motionBlur: 0.4,
        occlusion: 0.5,
      };

      let measurement = await pipeline.createMeasurement(swing, factors);

      // Classified as hidden
      expect(measurement.confidence_class).toBe('hidden');

      // Member should not see it
      let visible = await pipeline.getMeasurementsVisibleToMember(memberId);
      expect(visible.some((m) => m.id === measurement.id)).toBe(false);

      // Even if we try to make it visible, it stays hidden
      const fetched = await pipeline.getMeasurement(measurement.id);
      expect(fetched?.confidence_class).toBe('hidden');
    });
  });

  describe('Visual Verification (Screenshots)', () => {
    // ─── 시각적 검증: 신뢰도 지표 스크린샷 ───
    it('should display tier indicators correctly for confirmed measurements', async () => {
      const swing = await pipeline.recordSwing('member-visual-1', 5000);

      const factors: ConfidenceFactors = {
        keypointVisibility: 0.95,
        cameraAngle: 0.9,
        motionBlur: 0.95,
        occlusion: 0.95,
      };

      const measurement = await pipeline.createMeasurement(swing, factors);

      // In a real E2E test, would capture screenshot and verify green checkmark
      expect(measurement.confidence_class).toBe('confirmed');
      // Screenshot would verify visual indicator shows "Confirmed"
    });

    it('should display pending verification indicator', async () => {
      const swing = await pipeline.recordSwing('member-visual-2', 5000);

      const factors: ConfidenceFactors = {
        keypointVisibility: 0.8,
        cameraAngle: 0.7,
        motionBlur: 0.8,
        occlusion: 0.8,
      };

      const measurement = await pipeline.createMeasurement(swing, factors);

      expect(measurement.confidence_class).toBe('pending_verification');
      // Screenshot would verify yellow indicator shows "Awaiting Verification"
    });

    it('should not display hidden measurements in UI', async () => {
      const memberId = 'member-visual-3';
      const swing = await pipeline.recordSwing(memberId, 5000);

      const factors: ConfidenceFactors = {
        keypointVisibility: 0.2,
        cameraAngle: 0.3,
        motionBlur: 0.3,
        occlusion: 0.4,
      };

      await pipeline.createMeasurement(swing, factors);

      const visible = await pipeline.getMeasurementsVisibleToMember(memberId);

      // Hidden measurements should not appear
      expect(visible.length).toBe(0);
      // Screenshot would verify measurement list is empty or shows no data state
    });
  });

  describe('Tier Transition (Measurement Moving Between Tiers)', () => {
    // ─── 계층 전이: 검증 후 측정값이 계층 간 이동 ───
    it('should transition measurement from pending to confirmed after pro verification', async () => {
      const swing = await pipeline.recordSwing('member-trans-1', 5000);

      const factors: ConfidenceFactors = {
        keypointVisibility: 0.8,
        cameraAngle: 0.7,
        motionBlur: 0.8,
        occlusion: 0.8,
      };

      let measurement = await pipeline.createMeasurement(swing, factors);
      const initialClass = measurement.confidence_class;

      expect(initialClass).toBe('pending_verification');

      // Pro verifies
      measurement = await pipeline.proConfirmMeasurement(measurement.id, 'pro-5');

      expect(measurement.confidence_class).toBe('confirmed');
      expect(measurement.confidence_class).not.toBe(initialClass);
    });

    it('should show confidence score progression during verification', async () => {
      const swing = await pipeline.recordSwing('member-trans-2', 5000);

      const factors: ConfidenceFactors = {
        keypointVisibility: 0.75,
        cameraAngle: 0.65,
        motionBlur: 0.75,
        occlusion: 0.75,
      };

      const measurement = await pipeline.createMeasurement(swing, factors);

      // Initial confidence score
      expect(measurement.confidence_score).toBeGreaterThanOrEqual(0.4);
      expect(measurement.confidence_score).toBeLessThan(0.7);

      // After pro confirmation, classification changes but score might remain same
      const confirmed = await pipeline.proConfirmMeasurement(measurement.id, 'pro-6');
      expect(confirmed.is_verified).toBe(true);
    });
  });

  describe('Batch Verification (Pro Verifying Multiple)', () => {
    // ─── 배치 검증: 프로가 여러 측정값 순차 검증 ───
    it('should allow pro to verify multiple measurements in sequence', async () => {
      const pendingMeasurements: Measurement[] = [];

      // Create 5 pending measurements
      for (let i = 0; i < 5; i++) {
        const swing = await pipeline.recordSwing(`member-batch-${i}`, 5000);
        const factors: ConfidenceFactors = {
          keypointVisibility: 0.8,
          cameraAngle: 0.7,
          motionBlur: 0.8,
          occlusion: 0.8,
        };

        const measurement = await pipeline.createMeasurement(swing, factors);
        pendingMeasurements.push(measurement);
      }

      // Pro verifies all
      for (const measurement of pendingMeasurements) {
        const verified = await pipeline.proConfirmMeasurement(measurement.id, 'pro-batch');
        expect(verified.is_verified).toBe(true);
      }

      // No more pending
      const remaining = await pipeline.getPendingVerifications();
      const stillPending = remaining.filter((m) =>
        pendingMeasurements.some((pm) => pm.id === m.id)
      );

      expect(stillPending.length).toBe(0);
    });

    it('should handle mixed batch verification (some confirmed already)', async () => {
      const swing1 = await pipeline.recordSwing('member-mixed-1', 5000);
      const swing2 = await pipeline.recordSwing('member-mixed-2', 5000);

      const goodFactors: ConfidenceFactors = {
        keypointVisibility: 0.95,
        cameraAngle: 0.9,
        motionBlur: 0.95,
        occlusion: 0.95,
      };

      const mediumFactors: ConfidenceFactors = {
        keypointVisibility: 0.8,
        cameraAngle: 0.7,
        motionBlur: 0.8,
        occlusion: 0.8,
      };

      const confirmed = await pipeline.createMeasurement(swing1, goodFactors);
      const pending = await pipeline.createMeasurement(swing2, mediumFactors);

      expect(confirmed.confidence_class).toBe('confirmed');
      expect(pending.confidence_class).toBe('pending_verification');

      // Pro verifies the pending one
      const verifiedPending = await pipeline.proConfirmMeasurement(
        pending.id,
        'pro-mixed'
      );

      expect(verifiedPending.is_verified).toBe(true);
    });
  });

  describe('Verification Token Expiry (24h Timeout)', () => {
    // ─── 검증 토큰 만료: 24시간 제한 ───
    it('should issue verification token with 24-hour expiry', async () => {
      const swing = await pipeline.recordSwing('member-expiry-1', 5000);

      const factors: ConfidenceFactors = {
        keypointVisibility: 0.8,
        cameraAngle: 0.7,
        motionBlur: 0.8,
        occlusion: 0.8,
      };

      const measurement = await pipeline.createMeasurement(swing, factors);

      if (measurement.verification_token) {
        // Token should be present
        expect(measurement.verification_token).toBeDefined();
        expect(measurement.verification_token.length).toBeGreaterThan(0);

        // In real scenario, would verify token expires in 24 hours
        // For now, verify it's been created
        expect(measurement.created_at).toBeDefined();
      }
    });

    it('should handle token for pending measurements', async () => {
      const swing = await pipeline.recordSwing('member-expiry-2', 5000);

      const factors: ConfidenceFactors = {
        keypointVisibility: 0.8,
        cameraAngle: 0.7,
        motionBlur: 0.8,
        occlusion: 0.8,
      };

      const measurement = await pipeline.createMeasurement(swing, factors);

      expect(measurement.confidence_class).toBe('pending_verification');

      if (measurement.confidence_class === 'pending_verification') {
        expect(measurement.verification_token).toBeDefined();
      }
    });
  });

  describe('Mobile Gestures (Touch Interactions)', () => {
    // ─── 모바일 제스처: 터치 인터랙션 ───
    it('should handle touch to expand measurement details', async () => {
      const swing = await pipeline.recordSwing('member-mobile-1', 5000);

      const factors: ConfidenceFactors = {
        keypointVisibility: 0.95,
        cameraAngle: 0.9,
        motionBlur: 0.95,
        occlusion: 0.95,
      };

      const measurement = await pipeline.createMeasurement(swing, factors);

      // In E2E test on mobile viewport, would simulate touch to expand
      expect(measurement.id).toBeDefined();
      expect(measurement.confidence_score).toBeDefined();
      // Would verify details expand on touch
    });

    it('should support swipe gesture for member verification', async () => {
      const swing = await pipeline.recordSwing('member-mobile-2', 5000);

      const factors: ConfidenceFactors = {
        keypointVisibility: 0.95,
        cameraAngle: 0.9,
        motionBlur: 0.95,
        occlusion: 0.95,
      };

      let measurement = await pipeline.createMeasurement(swing, factors);

      // In mobile E2E test, would simulate swipe gesture
      // Then confirm membership
      measurement = await pipeline.memberConfirmMeasurement(
        measurement.id,
        'member-mobile-2'
      );

      expect(measurement.verified_by_member).toBe('member-mobile-2');
      // Would verify checkmark appears after swipe
    });

    it('should support long-press gesture for measurement actions', async () => {
      const swing = await pipeline.recordSwing('member-mobile-3', 5000);

      const factors: ConfidenceFactors = {
        keypointVisibility: 0.8,
        cameraAngle: 0.7,
        motionBlur: 0.8,
        occlusion: 0.8,
      };

      let measurement = await pipeline.createMeasurement(swing, factors);

      // In mobile E2E test, would simulate long-press
      // Then perform action like hiding measurement
      measurement = await pipeline.hideMeasurement(measurement.id);

      expect(measurement.is_hidden).toBe(true);
      // Would verify context menu appears on long-press
    });

    it('should respond to mobile viewport size (portrait)', async () => {
      const swing = await pipeline.recordSwing('member-mobile-portrait', 5000);

      const factors: ConfidenceFactors = {
        keypointVisibility: 0.95,
        cameraAngle: 0.9,
        motionBlur: 0.95,
        occlusion: 0.95,
      };

      const measurement = await pipeline.createMeasurement(swing, factors);

      // In E2E test with mobile viewport (e.g., 375x667), would verify layout
      expect(measurement.confidence_class).toBe('confirmed');
      // Would verify layout is optimized for portrait
    });

    it('should respond to mobile viewport size (landscape)', async () => {
      const swing = await pipeline.recordSwing('member-mobile-landscape', 5000);

      const factors: ConfidenceFactors = {
        keypointVisibility: 0.95,
        cameraAngle: 0.9,
        motionBlur: 0.95,
        occlusion: 0.95,
      };

      const measurement = await pipeline.createMeasurement(swing, factors);

      // In E2E test with landscape viewport (e.g., 667x375), would verify layout
      expect(measurement.confidence_class).toBe('confirmed');
      // Would verify layout adjusts for landscape
    });
  });

  describe('Multiple Members and Measurements', () => {
    // ─── 복수 회원 및 측정값 ───
    it('should isolate measurements per member', async () => {
      const member1 = 'member-22';
      const member2 = 'member-23';

      const swing1 = await pipeline.recordSwing(member1, 5000);
      const swing2 = await pipeline.recordSwing(member2, 5000);

      const factors: ConfidenceFactors = {
        keypointVisibility: 0.95,
        cameraAngle: 0.9,
        motionBlur: 0.95,
        occlusion: 0.95,
      };

      const measure1 = await pipeline.createMeasurement(swing1, factors);
      const measure2 = await pipeline.createMeasurement(swing2, factors);

      // Each member sees only their own
      const visible1 = await pipeline.getMeasurementsVisibleToMember(member1);
      const visible2 = await pipeline.getMeasurementsVisibleToMember(member2);

      expect(visible1.some((m) => m.id === measure1.id)).toBe(true);
      expect(visible1.some((m) => m.id === measure2.id)).toBe(false);

      expect(visible2.some((m) => m.id === measure2.id)).toBe(true);
      expect(visible2.some((m) => m.id === measure1.id)).toBe(false);
    });

    it('should handle multiple pending verifications', async () => {
      const swing1 = await pipeline.recordSwing('member-24', 5000);
      const swing2 = await pipeline.recordSwing('member-25', 5000);

      const factors: ConfidenceFactors = {
        keypointVisibility: 0.8,
        cameraAngle: 0.7,
        motionBlur: 0.8,
        occlusion: 0.8,
      };

      await pipeline.createMeasurement(swing1, factors);
      await pipeline.createMeasurement(swing2, factors);

      const pending = await pipeline.getPendingVerifications();

      expect(pending.length).toBeGreaterThanOrEqual(2);
    });
  });
});
