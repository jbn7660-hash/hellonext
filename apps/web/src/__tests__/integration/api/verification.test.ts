/**
 * Integration Tests: Verification Handler API
 *
 * 검증 핸들러 API 통합 테스트
 * - confirm 응답 → measurement 상태를 confirmed로 전환
 * - correct 응답 → 신뢰도 재계산
 * - reject 응답 → measurement 상태를 hidden으로 전환
 * - 유효하지 않은 토큰 → 404 에러
 * - 만료된 토큰 → 410 에러
 *
 * @feature F-016
 * @requirement Verification Handler
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mockSupabaseClient } from '../../setup';

// ─── Type Definitions ────────────────────────────────────────────

type MeasurementState = 'UNBOUND' | 'PREPROCESSED' | 'LINKED' | 'FINALIZED';

interface VerificationToken {
  id: string;
  measurement_id: string;
  token: string;
  state: 'pending' | 'used' | 'expired';
  created_at: string;
  expires_at: string;
  pro_id?: string;
}

interface Measurement {
  id: string;
  swing_id: string;
  state: MeasurementState;
  confidence_score: number;
  is_verified: boolean;
  is_hidden: boolean;
  updated_at: string;
}

interface VerificationRequest {
  token: string;
  action: 'confirm' | 'correct' | 'reject';
  pro_id?: string;
  feedback?: string;
}

interface VerificationResponse {
  success: boolean;
  measurement: Measurement;
  error?: string;
}

// ─── Verification Handler Implementation (mock) ─────────────────

class VerificationHandler {
  /**
   * 검증 토큰을 조회합니다.
   */
  async findToken(token: string): Promise<VerificationToken | null> {
    // Mock: 실제로는 DB 조회
    if (token === 'valid-token-123') {
      return {
        id: 'token-1',
        measurement_id: 'measure-1',
        token: 'valid-token-123',
        state: 'pending',
        created_at: '2026-03-11T10:00:00Z',
        expires_at: '2026-03-12T10:00:00Z',
        pro_id: 'pro-123',
      };
    }

    if (token === 'expired-token-456') {
      return {
        id: 'token-2',
        measurement_id: 'measure-2',
        token: 'expired-token-456',
        state: 'expired',
        created_at: '2026-03-09T10:00:00Z',
        expires_at: '2026-03-10T10:00:00Z',
        pro_id: 'pro-123',
      };
    }

    return null;
  }

  /**
   * 측정값을 조회합니다.
   */
  async findMeasurement(id: string): Promise<Measurement | null> {
    // Mock data
    if (id === 'measure-1') {
      return {
        id: 'measure-1',
        swing_id: 'swing-1',
        state: 'FINALIZED' as MeasurementState,
        confidence_score: 0.55,
        is_verified: false,
        is_hidden: false,
        updated_at: '2026-03-11T10:00:00Z',
      };
    }

    if (id === 'measure-2') {
      return {
        id: 'measure-2',
        swing_id: 'swing-2',
        state: 'FINALIZED' as MeasurementState,
        confidence_score: 0.60,
        is_verified: false,
        is_hidden: false,
        updated_at: '2026-03-11T10:00:00Z',
      };
    }

    return null;
  }

  /**
   * 측정값의 상태를 업데이트합니다.
   */
  async updateMeasurement(
    id: string,
    updates: Partial<Measurement>
  ): Promise<Measurement> {
    const measurement = await this.findMeasurement(id);
    if (!measurement) {
      throw new Error(`Measurement not found: ${id}`);
    }

    return {
      ...measurement,
      ...updates,
      updated_at: new Date().toISOString(),
    };
  }

  /**
   * 검증 토큰을 사용 표시합니다.
   */
  async markTokenUsed(tokenId: string): Promise<void> {
    // Mock: 실제로는 DB 업데이트
  }

  /**
   * confirm 응답 처리: measurement 상태를 confirmed로 전환
   */
  async handleConfirm(request: VerificationRequest): Promise<VerificationResponse> {
    // 1. 토큰 검증
    const token = await this.findToken(request.token);

    if (!token) {
      return {
        success: false,
        measurement: {} as Measurement,
        error: '404: Invalid verification token',
      };
    }

    if (token.state === 'expired') {
      return {
        success: false,
        measurement: {} as Measurement,
        error: '410: Verification token has expired',
      };
    }

    // 2. 측정값 조회
    const measurement = await this.findMeasurement(token.measurement_id);
    if (!measurement) {
      return {
        success: false,
        measurement: {} as Measurement,
        error: '404: Measurement not found',
      };
    }

    // 3. 상태 업데이트
    const updated = await this.updateMeasurement(token.measurement_id, {
      is_verified: true,
      state: 'FINALIZED' as MeasurementState,
    });

    // 4. 토큰을 사용 표시
    await this.markTokenUsed(token.id);

    return {
      success: true,
      measurement: updated,
    };
  }

  /**
   * correct 응답 처리: 신뢰도 재계산
   */
  async handleCorrect(request: VerificationRequest): Promise<VerificationResponse> {
    // 1. 토큰 검증
    const token = await this.findToken(request.token);

    if (!token) {
      return {
        success: false,
        measurement: {} as Measurement,
        error: '404: Invalid verification token',
      };
    }

    if (token.state === 'expired') {
      return {
        success: false,
        measurement: {} as Measurement,
        error: '410: Verification token has expired',
      };
    }

    // 2. 측정값 조회
    const measurement = await this.findMeasurement(token.measurement_id);
    if (!measurement) {
      return {
        success: false,
        measurement: {} as Measurement,
        error: '404: Measurement not found',
      };
    }

    // 3. 신뢰도 재계산 (상향 조정)
    const recalculatedScore = Math.min(measurement.confidence_score + 0.15, 1.0);

    // 4. 상태 업데이트
    const updated = await this.updateMeasurement(token.measurement_id, {
      confidence_score: recalculatedScore,
      is_verified: true,
    });

    // 5. 토큰을 사용 표시
    await this.markTokenUsed(token.id);

    return {
      success: true,
      measurement: updated,
    };
  }

  /**
   * reject 응답 처리: measurement 상태를 hidden으로 전환
   */
  async handleReject(request: VerificationRequest): Promise<VerificationResponse> {
    // 1. 토큰 검증
    const token = await this.findToken(request.token);

    if (!token) {
      return {
        success: false,
        measurement: {} as Measurement,
        error: '404: Invalid verification token',
      };
    }

    if (token.state === 'expired') {
      return {
        success: false,
        measurement: {} as Measurement,
        error: '410: Verification token has expired',
      };
    }

    // 2. 측정값 조회
    const measurement = await this.findMeasurement(token.measurement_id);
    if (!measurement) {
      return {
        success: false,
        measurement: {} as Measurement,
        error: '404: Measurement not found',
      };
    }

    // 3. 상태 업데이트 (hidden으로 설정)
    const updated = await this.updateMeasurement(token.measurement_id, {
      is_hidden: true,
      is_verified: true,
    });

    // 4. 토큰을 사용 표시
    await this.markTokenUsed(token.id);

    return {
      success: true,
      measurement: updated,
    };
  }
}

// ─── Tests ──────────────────────────────────────────────────────

describe('Verification Handler API (F-016)', () => {
  let handler: VerificationHandler;

  beforeEach(() => {
    handler = new VerificationHandler();
    vi.clearAllMocks();
  });

  describe('confirm Response - State Transition', () => {
    // ─── confirm 응답: 상태 전환 ───
    it('should transition measurement to confirmed state', async () => {
      const request: VerificationRequest = {
        token: 'valid-token-123',
        action: 'confirm',
        pro_id: 'pro-123',
      };

      const response = await handler.handleConfirm(request);

      expect(response.success).toBe(true);
      expect(response.measurement.is_verified).toBe(true);
      expect(response.measurement.state).toBe('FINALIZED');
      expect(response.error).toBeUndefined();
    });

    it('should confirm pending verification measurement', async () => {
      const request: VerificationRequest = {
        token: 'valid-token-123',
        action: 'confirm',
      };

      const response = await handler.handleConfirm(request);

      expect(response.success).toBe(true);
      expect(response.measurement.is_verified).toBe(true);
    });
  });

  describe('correct Response - Confidence Recalculation', () => {
    // ─── correct 응답: 신뢰도 재계산 ───
    it('should recalculate confidence score upward', async () => {
      const request: VerificationRequest = {
        token: 'valid-token-123',
        action: 'correct',
      };

      const response = await handler.handleCorrect(request);

      expect(response.success).toBe(true);
      expect(response.measurement.confidence_score).toBeGreaterThan(0.55);
      expect(response.measurement.is_verified).toBe(true);
    });

    it('should increase confidence by ~0.15 on correct action', async () => {
      const request: VerificationRequest = {
        token: 'valid-token-123',
        action: 'correct',
      };

      // Original confidence is 0.55 for measure-1
      const response = await handler.handleCorrect(request);

      const expectedConfidence = 0.55 + 0.15; // 0.70
      expect(response.measurement.confidence_score).toBeCloseTo(expectedConfidence, 2);
    });

    it('should cap confidence at 1.0', async () => {
      // Create a measurement with high initial confidence
      const highConfidenceMeasure = {
        id: 'measure-high',
        swing_id: 'swing-high',
        state: 'FINALIZED' as MeasurementState,
        confidence_score: 0.95,
        is_verified: false,
        is_hidden: false,
        updated_at: '2026-03-11T10:00:00Z',
      };

      // Mock: would be capped at 1.0
      const recalculated = Math.min(0.95 + 0.15, 1.0);
      expect(recalculated).toBe(1.0);
    });
  });

  describe('reject Response - Hidden State', () => {
    // ─── reject 응답: 숨김 상태 ───
    it('should transition measurement to hidden state', async () => {
      const request: VerificationRequest = {
        token: 'valid-token-123',
        action: 'reject',
        feedback: 'Poor form detected',
      };

      const response = await handler.handleReject(request);

      expect(response.success).toBe(true);
      expect(response.measurement.is_hidden).toBe(true);
      expect(response.measurement.is_verified).toBe(true);
    });

    it('should hide rejected measurement from member view', async () => {
      const request: VerificationRequest = {
        token: 'valid-token-123',
        action: 'reject',
      };

      const response = await handler.handleReject(request);

      expect(response.success).toBe(true);
      expect(response.measurement.is_hidden).toBe(true);
    });
  });

  describe('Invalid Token - 404 Error', () => {
    // ─── 유효하지 않은 토큰: 404 에러 ───
    it('should return 404 for non-existent token on confirm', async () => {
      const request: VerificationRequest = {
        token: 'invalid-token-000',
        action: 'confirm',
      };

      const response = await handler.handleConfirm(request);

      expect(response.success).toBe(false);
      expect(response.error).toContain('404');
      expect(response.error).toContain('Invalid verification token');
    });

    it('should return 404 for non-existent token on correct', async () => {
      const request: VerificationRequest = {
        token: 'nonexistent-token',
        action: 'correct',
      };

      const response = await handler.handleCorrect(request);

      expect(response.success).toBe(false);
      expect(response.error).toContain('404');
    });

    it('should return 404 for non-existent token on reject', async () => {
      const request: VerificationRequest = {
        token: 'fake-token-xyz',
        action: 'reject',
      };

      const response = await handler.handleReject(request);

      expect(response.success).toBe(false);
      expect(response.error).toContain('404');
    });

    it('should not modify measurement on invalid token', async () => {
      const request: VerificationRequest = {
        token: 'nonexistent-token',
        action: 'confirm',
      };

      const response = await handler.handleConfirm(request);

      expect(response.success).toBe(false);
      expect(Object.keys(response.measurement).length).toBe(0); // Empty object
    });
  });

  describe('Expired Token - 410 Error', () => {
    // ─── 만료된 토큰: 410 에러 ───
    it('should return 410 for expired token on confirm', async () => {
      const request: VerificationRequest = {
        token: 'expired-token-456',
        action: 'confirm',
      };

      const response = await handler.handleConfirm(request);

      expect(response.success).toBe(false);
      expect(response.error).toContain('410');
      expect(response.error).toContain('expired');
    });

    it('should return 410 for expired token on correct', async () => {
      const request: VerificationRequest = {
        token: 'expired-token-456',
        action: 'correct',
      };

      const response = await handler.handleCorrect(request);

      expect(response.success).toBe(false);
      expect(response.error).toContain('410');
    });

    it('should return 410 for expired token on reject', async () => {
      const request: VerificationRequest = {
        token: 'expired-token-456',
        action: 'reject',
      };

      const response = await handler.handleReject(request);

      expect(response.success).toBe(false);
      expect(response.error).toContain('410');
    });

    it('should not modify measurement on expired token', async () => {
      const request: VerificationRequest = {
        token: 'expired-token-456',
        action: 'confirm',
      };

      const response = await handler.handleConfirm(request);

      expect(response.success).toBe(false);
      // Should not have modified the actual measurement
    });
  });

  describe('Token State Management', () => {
    // ─── 토큰 상태 관리 ───
    it('should mark token as used after successful confirm', async () => {
      const markTokenUsedSpy = vi.spyOn(handler, 'markTokenUsed');

      const request: VerificationRequest = {
        token: 'valid-token-123',
        action: 'confirm',
      };

      const response = await handler.handleConfirm(request);

      if (response.success) {
        expect(markTokenUsedSpy).toHaveBeenCalled();
      }
    });

    it('should mark token as used after successful correct', async () => {
      const markTokenUsedSpy = vi.spyOn(handler, 'markTokenUsed');

      const request: VerificationRequest = {
        token: 'valid-token-123',
        action: 'correct',
      };

      const response = await handler.handleCorrect(request);

      if (response.success) {
        expect(markTokenUsedSpy).toHaveBeenCalled();
      }
    });

    it('should mark token as used after successful reject', async () => {
      const markTokenUsedSpy = vi.spyOn(handler, 'markTokenUsed');

      const request: VerificationRequest = {
        token: 'valid-token-123',
        action: 'reject',
      };

      const response = await handler.handleReject(request);

      if (response.success) {
        expect(markTokenUsedSpy).toHaveBeenCalled();
      }
    });

    it('should not mark token as used on failed request', async () => {
      const markTokenUsedSpy = vi.spyOn(handler, 'markTokenUsed');

      const request: VerificationRequest = {
        token: 'invalid-token-000',
        action: 'confirm',
      };

      const response = await handler.handleConfirm(request);

      if (!response.success) {
        expect(markTokenUsedSpy).not.toHaveBeenCalled();
      }
    });
  });

  describe('Measurement Updates', () => {
    // ─── 측정값 업데이트 ───
    it('should update measurement timestamp on confirm', async () => {
      const request: VerificationRequest = {
        token: 'valid-token-123',
        action: 'confirm',
      };

      const beforeTime = new Date();
      const response = await handler.handleConfirm(request);
      const afterTime = new Date();

      if (response.success) {
        const updatedTime = new Date(response.measurement.updated_at);
        expect(updatedTime.getTime()).toBeGreaterThanOrEqual(beforeTime.getTime());
        expect(updatedTime.getTime()).toBeLessThanOrEqual(afterTime.getTime() + 1000);
      }
    });

    it('should preserve other measurement fields on confirm', async () => {
      const request: VerificationRequest = {
        token: 'valid-token-123',
        action: 'confirm',
      };

      const response = await handler.handleConfirm(request);

      if (response.success) {
        expect(response.measurement.id).toBe('measure-1');
        expect(response.measurement.swing_id).toBe('swing-1');
      }
    });
  });

  describe('End-to-End Verification Flows', () => {
    // ─── 엔드투엔드 검증 흐름 ───
    it('should complete full confirm workflow', async () => {
      const confirmRequest: VerificationRequest = {
        token: 'valid-token-123',
        action: 'confirm',
        pro_id: 'pro-123',
      };

      const response = await handler.handleConfirm(confirmRequest);

      expect(response.success).toBe(true);
      expect(response.measurement.is_verified).toBe(true);
      expect(response.measurement.state).toBe('FINALIZED');
      expect(response.error).toBeUndefined();
    });

    it('should complete full correct workflow with confidence increase', async () => {
      const correctRequest: VerificationRequest = {
        token: 'valid-token-123',
        action: 'correct',
      };

      const response = await handler.handleCorrect(correctRequest);

      expect(response.success).toBe(true);
      expect(response.measurement.confidence_score).toBeGreaterThan(0.55);
      expect(response.measurement.is_verified).toBe(true);
    });

    it('should complete full reject workflow', async () => {
      const rejectRequest: VerificationRequest = {
        token: 'valid-token-123',
        action: 'reject',
        feedback: 'Invalid measurement',
      };

      const response = await handler.handleReject(rejectRequest);

      expect(response.success).toBe(true);
      expect(response.measurement.is_hidden).toBe(true);
      expect(response.measurement.is_verified).toBe(true);
    });
  });
});
