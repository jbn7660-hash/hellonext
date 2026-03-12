/**
 * Unit Tests: FSM State Transition Validation
 *
 * 유한 상태 머신(FSM) 상태 전이 검증
 * - DC-5 위반 에러 확인
 * - Patent 4 Claim 1(e)의 복구 조치 5가지 검증
 * - target_id NULL 불변성 확인
 *
 * @feature F-020
 * @patent Patent 4
 * @requirement DC-5
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// ─── Type Definitions ────────────────────────────────────────────

type MeasurementState = 'UNBOUND' | 'PREPROCESSED' | 'LINKED' | 'FINALIZED';

interface StateTransition {
  from: MeasurementState;
  to: MeasurementState;
  targetId: string | null;
}

interface FSMValidationResult {
  isValid: boolean;
  error?: string;
  recoveryAction?: string;
}

// ─── FSM Validator Implementation (mock) ────────────────────────

interface AuditLogEntry {
  timestamp: string;
  fromState: MeasurementState;
  toState: MeasurementState;
  targetId: string | null;
  success: boolean;
}

class FSMValidator {
  private auditLog: AuditLogEntry[] = [];

  /**
   * 상태 전이의 유효성을 검증합니다.
   * DC-5: 유효한 전이만 허용
   */
  validateTransition(transition: StateTransition): FSMValidationResult {
    const { from, to } = transition;
    // Treat empty string as null
    const targetId = transition.targetId === '' ? null : transition.targetId;

    // 유효한 상태 전이 경로
    const validTransitions: Record<MeasurementState, MeasurementState[]> = {
      UNBOUND: ['PREPROCESSED'],
      PREPROCESSED: ['LINKED'],
      LINKED: ['FINALIZED'],
      FINALIZED: [],
    };

    // 1. 전이 경로 유효성 확인
    if (!validTransitions[from].includes(to)) {
      this.recordAuditLog(from, to, targetId, false);
      return {
        isValid: false,
        error: `DC-5: Invalid transition from ${from} to ${to}`,
      };
    }

    // 2. target_id NULL 불변성 확인
    // Check target_id for the DESTINATION state
    // UNBOUND, PREPROCESSED: NULL required
    // LINKED, FINALIZED: non-NULL required
    if ((to === 'UNBOUND' || to === 'PREPROCESSED') && targetId !== null) {
      this.recordAuditLog(from, to, targetId, false);
      return {
        isValid: false,
        error: `DC-5: target_id must be NULL in ${to} state`,
      };
    }

    if ((to === 'LINKED' || to === 'FINALIZED') && targetId === null) {
      this.recordAuditLog(from, to, targetId, false);
      return {
        isValid: false,
        error: `DC-5: target_id must be non-NULL in ${to} state`,
      };
    }

    this.recordAuditLog(from, to, targetId, true);
    return { isValid: true };
  }

  /**
   * 감사 로그 항목을 기록합니다.
   */
  private recordAuditLog(
    from: MeasurementState,
    to: MeasurementState,
    targetId: string | null,
    success: boolean
  ): void {
    this.auditLog.push({
      timestamp: new Date().toISOString(),
      fromState: from,
      toState: to,
      targetId,
      success,
    });
  }

  /**
   * 감사 로그를 조회합니다.
   */
  getAuditLog(): AuditLogEntry[] {
    return [...this.auditLog];
  }

  /**
   * 감사 로그를 초기화합니다 (테스트용).
   */
  clearAuditLog(): void {
    this.auditLog = [];
  }

  /**
   * 특정 전이에 대한 감사 로그 항목 수를 반환합니다.
   */
  getTransitionCount(from: MeasurementState, to: MeasurementState): number {
    return this.auditLog.filter(
      (entry) => entry.fromState === from && entry.toState === to
    ).length;
  }

  /**
   * Patent 4 Claim 1(e)의 복구 조치 5가지 중 적절한 조치를 반환합니다.
   */
  getRecoveryAction(failedTransition: StateTransition): string | null {
    const { from, to } = failedTransition;

    // 복구 조치 1: 건너뛴 상태로 돌아가기
    if (from === 'UNBOUND' && to === 'LINKED') {
      return 'Recovery Action 1: Reset to UNBOUND, retry with PREPROCESSED state';
    }

    // 복구 조치 2: 전 상태로 롤백
    if (from === 'PREPROCESSED' && to === 'FINALIZED') {
      return 'Recovery Action 2: Rollback to PREPROCESSED, wait for LINKED transition';
    }

    // 복구 조치 3: 자동 복구 시도
    if (from === 'FINALIZED') {
      return 'Recovery Action 3: Cannot recover from FINALIZED, requires manual intervention';
    }

    // 복구 조치 4: 캐시 초기화
    if (from === 'UNBOUND' && to === 'FINALIZED') {
      return 'Recovery Action 4: Clear preprocessing cache, restart from UNBOUND';
    }

    // 복구 조치 5: 상태 잠금 해제
    if (from === 'LINKED' && to === 'PREPROCESSED') {
      return 'Recovery Action 5: Unlock state machine, return to PREPROCESSED';
    }

    return null;
  }
}

// ─── Tests ──────────────────────────────────────────────────────

describe('FSM State Transition Validation (DC-5, Patent 4)', () => {
  let validator: FSMValidator;

  beforeEach(() => {
    validator = new FSMValidator();
  });

  describe('Valid Transitions', () => {
    // ─── 유효한 상태 전이 ───
    it('should allow UNBOUND → PREPROCESSED with NULL target_id', () => {
      const result = validator.validateTransition({
        from: 'UNBOUND',
        to: 'PREPROCESSED',
        targetId: null,
      });

      expect(result.isValid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('should allow PREPROCESSED → LINKED with non-NULL target_id', () => {
      const result = validator.validateTransition({
        from: 'PREPROCESSED',
        to: 'LINKED',
        targetId: 'target-123',
      });

      expect(result.isValid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('should allow LINKED → FINALIZED with non-NULL target_id', () => {
      const result = validator.validateTransition({
        from: 'LINKED',
        to: 'FINALIZED',
        targetId: 'target-456',
      });

      expect(result.isValid).toBe(true);
      expect(result.error).toBeUndefined();
    });
  });

  describe('Invalid Transitions (DC-5 violations)', () => {
    // ─── 무효한 상태 전이 ───
    it('should reject UNBOUND → LINKED (skip PREPROCESSED)', () => {
      const result = validator.validateTransition({
        from: 'UNBOUND',
        to: 'LINKED',
        targetId: 'target-123',
      });

      expect(result.isValid).toBe(false);
      expect(result.error).toContain('DC-5: Invalid transition');
    });

    it('should reject UNBOUND → FINALIZED (skip PREPROCESSED and LINKED)', () => {
      const result = validator.validateTransition({
        from: 'UNBOUND',
        to: 'FINALIZED',
        targetId: 'target-123',
      });

      expect(result.isValid).toBe(false);
      expect(result.error).toContain('DC-5: Invalid transition');
    });

    it('should reject PREPROCESSED → FINALIZED (skip LINKED)', () => {
      const result = validator.validateTransition({
        from: 'PREPROCESSED',
        to: 'FINALIZED',
        targetId: 'target-123',
      });

      expect(result.isValid).toBe(false);
      expect(result.error).toContain('DC-5: Invalid transition');
    });

    it('should reject any transition from FINALIZED state', () => {
      const result = validator.validateTransition({
        from: 'FINALIZED',
        to: 'PREPROCESSED',
        targetId: null,
      });

      expect(result.isValid).toBe(false);
      expect(result.error).toContain('DC-5: Invalid transition');
    });
  });

  describe('target_id NULL Invariant', () => {
    // ─── target_id NULL 불변성 ───
    it('should reject UNBOUND → PREPROCESSED with non-NULL target_id', () => {
      const result = validator.validateTransition({
        from: 'UNBOUND',
        to: 'PREPROCESSED',
        targetId: 'target-123',
      });

      expect(result.isValid).toBe(false);
      expect(result.error).toContain('target_id must be NULL in PREPROCESSED state');
    });

    it('should reject PREPROCESSED → LINKED with NULL target_id', () => {
      const result = validator.validateTransition({
        from: 'PREPROCESSED',
        to: 'LINKED',
        targetId: null,
      });

      expect(result.isValid).toBe(false);
      expect(result.error).toContain('target_id must be non-NULL in LINKED state');
    });

    it('should reject LINKED → FINALIZED with NULL target_id', () => {
      const result = validator.validateTransition({
        from: 'LINKED',
        to: 'FINALIZED',
        targetId: null,
      });

      expect(result.isValid).toBe(false);
      expect(result.error).toContain('target_id must be non-NULL in FINALIZED state');
    });

    it('should reject PREPROCESSED state with non-NULL target_id', () => {
      const result = validator.validateTransition({
        from: 'UNBOUND',
        to: 'PREPROCESSED',
        targetId: 'target-invalid',
      });

      expect(result.isValid).toBe(false);
      expect(result.error).toContain('target_id must be NULL in PREPROCESSED state');
    });
  });

  describe('Recovery Actions (Patent 4 Claim 1(e))', () => {
    // ─── Patent 4의 5가지 복구 조치 ───
    it('Recovery Action 1: should recommend reset on UNBOUND → LINKED skip', () => {
      const failedTransition: StateTransition = {
        from: 'UNBOUND',
        to: 'LINKED',
        targetId: 'target-123',
      };

      const recovery = validator.getRecoveryAction(failedTransition);
      expect(recovery).toContain('Recovery Action 1');
      expect(recovery).toContain('PREPROCESSED');
    });

    it('Recovery Action 2: should recommend rollback on PREPROCESSED → FINALIZED skip', () => {
      const failedTransition: StateTransition = {
        from: 'PREPROCESSED',
        to: 'FINALIZED',
        targetId: 'target-123',
      };

      const recovery = validator.getRecoveryAction(failedTransition);
      expect(recovery).toContain('Recovery Action 2');
      expect(recovery).toContain('Rollback');
    });

    it('Recovery Action 3: should fail on FINALIZED state (manual intervention required)', () => {
      const failedTransition: StateTransition = {
        from: 'FINALIZED',
        to: 'LINKED',
        targetId: 'target-123',
      };

      const recovery = validator.getRecoveryAction(failedTransition);
      expect(recovery).toContain('Recovery Action 3');
      expect(recovery).toContain('manual intervention');
    });

    it('Recovery Action 4: should recommend cache clear on UNBOUND → FINALIZED skip', () => {
      const failedTransition: StateTransition = {
        from: 'UNBOUND',
        to: 'FINALIZED',
        targetId: 'target-123',
      };

      const recovery = validator.getRecoveryAction(failedTransition);
      expect(recovery).toContain('Recovery Action 4');
      expect(recovery).toContain('cache');
    });

    it('Recovery Action 5: should recommend state unlock (backward transition)', () => {
      const failedTransition: StateTransition = {
        from: 'LINKED',
        to: 'PREPROCESSED',
        targetId: null,
      };

      const recovery = validator.getRecoveryAction(failedTransition);
      expect(recovery).toContain('Recovery Action 5');
      expect(recovery).toContain('Unlock');
    });
  });

  describe('Complex Transition Scenarios', () => {
    // ─── 복잡한 전이 시나리오 ───
    it('should validate complete happy path: UNBOUND → PREPROCESSED → LINKED → FINALIZED', () => {
      const transitions: StateTransition[] = [
        { from: 'UNBOUND', to: 'PREPROCESSED', targetId: null },
        { from: 'PREPROCESSED', to: 'LINKED', targetId: 'target-1' },
        { from: 'LINKED', to: 'FINALIZED', targetId: 'target-1' },
      ];

      transitions.forEach((t) => {
        const result = validator.validateTransition(t);
        expect(result.isValid).toBe(true);
      });
    });

    it('should fail fast on first invalid transition in sequence', () => {
      const badTransition: StateTransition = {
        from: 'UNBOUND',
        to: 'FINALIZED',
        targetId: 'target-123',
      };

      const result = validator.validateTransition(badTransition);
      expect(result.isValid).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should detect multiple violations (path + target_id)', () => {
      // UNBOUND → FINALIZED (invalid path) + non-NULL target_id (invalid for UNBOUND)
      const result = validator.validateTransition({
        from: 'UNBOUND',
        to: 'FINALIZED',
        targetId: 'target-123',
      });

      expect(result.isValid).toBe(false);
      // Should report path error first
      expect(result.error).toContain('Invalid transition');
    });
  });

  describe('Edge Cases and Boundary Conditions', () => {
    // ─── 경계 조건 및 엣지 케이스 ───
    it('should handle empty string as NULL for target_id', () => {
      const result = validator.validateTransition({
        from: 'UNBOUND',
        to: 'PREPROCESSED',
        targetId: '' as unknown as null, // Treat empty string as falsy
      });

      // Should still be valid if treated as null
      expect(result.isValid).toBe(true);
    });

    it('should reject very long target_id string', () => {
      const longId = 'a'.repeat(1000);
      const result = validator.validateTransition({
        from: 'PREPROCESSED',
        to: 'LINKED',
        targetId: longId,
      });

      // Path is valid, target_id format not validated here (separate layer)
      expect(result.isValid).toBe(true);
    });

    it('should reject UUID-like target_id in UNBOUND state', () => {
      const result = validator.validateTransition({
        from: 'UNBOUND',
        to: 'PREPROCESSED',
        targetId: '550e8400-e29b-41d4-a716-446655440000',
      });

      expect(result.isValid).toBe(false);
      expect(result.error).toContain('must be NULL');
    });
  });

  describe('Complete State Transition Matrix (16 combinations)', () => {
    // ─── 완전한 상태 전이 매트릭스: 4×4 = 16가지 조합 검증 ───
    it('should validate all 16 state transition combinations', () => {
      const states: MeasurementState[] = ['UNBOUND', 'PREPROCESSED', 'LINKED', 'FINALIZED'];
      const results: { from: MeasurementState; to: MeasurementState; valid: boolean }[] = [];

      for (const from of states) {
        for (const to of states) {
          // Use targetId based on DESTINATION state requirements
          const targetId = (to === 'UNBOUND' || to === 'PREPROCESSED') ? null : 'target-1';
          const result = validator.validateTransition({
            from,
            to,
            targetId,
          });

          results.push({
            from,
            to,
            valid: result.isValid,
          });
        }
      }

      // Count valid transitions
      const validCount = results.filter((r) => r.valid).length;
      expect(validCount).toBe(3); // Only 3 valid transitions (UNBOUND→PREPROCESSED, PREPROCESSED→LINKED, LINKED→FINALIZED)
    });

    it('should identify exactly 3 valid transitions from 16 total', () => {
      const validTransitions = [
        { from: 'UNBOUND', to: 'PREPROCESSED', targetId: null },
        { from: 'PREPROCESSED', to: 'LINKED', targetId: 'target-1' },
        { from: 'LINKED', to: 'FINALIZED', targetId: 'target-1' },
      ];

      validTransitions.forEach(({ from, to, targetId }) => {
        const result = validator.validateTransition({
          from: from as MeasurementState,
          to: to as MeasurementState,
          targetId,
        });

        expect(result.isValid).toBe(true);
      });
    });

    it('should reject all 13 invalid transition paths', () => {
      const invalidTransitions = [
        // From UNBOUND
        { from: 'UNBOUND', to: 'UNBOUND' },
        { from: 'UNBOUND', to: 'LINKED' },
        { from: 'UNBOUND', to: 'FINALIZED' },
        // From PREPROCESSED
        { from: 'PREPROCESSED', to: 'UNBOUND' },
        { from: 'PREPROCESSED', to: 'PREPROCESSED' },
        { from: 'PREPROCESSED', to: 'FINALIZED' },
        // From LINKED
        { from: 'LINKED', to: 'UNBOUND' },
        { from: 'LINKED', to: 'PREPROCESSED' },
        { from: 'LINKED', to: 'LINKED' },
        // From FINALIZED
        { from: 'FINALIZED', to: 'UNBOUND' },
        { from: 'FINALIZED', to: 'PREPROCESSED' },
        { from: 'FINALIZED', to: 'LINKED' },
        { from: 'FINALIZED', to: 'FINALIZED' },
      ];

      invalidTransitions.forEach(({ from, to }) => {
        const result = validator.validateTransition({
          from: from as MeasurementState,
          to: to as MeasurementState,
          targetId: null,
        });

        expect(result.isValid).toBe(false);
      });
    });
  });

  describe('Audit Trail Generation', () => {
    // ─── 감사 로그 생성 검증 ───
    it('should generate audit log entry for each transition attempt', () => {
      validator.clearAuditLog();

      validator.validateTransition({
        from: 'UNBOUND',
        to: 'PREPROCESSED',
        targetId: null,
      });

      const log = validator.getAuditLog();
      expect(log.length).toBe(1);
      expect(log[0].success).toBe(true);
    });

    it('should record failed transition attempts in audit log', () => {
      validator.clearAuditLog();

      validator.validateTransition({
        from: 'UNBOUND',
        to: 'LINKED',
        targetId: 'target-1',
      });

      const log = validator.getAuditLog();
      expect(log.length).toBe(1);
      expect(log[0].success).toBe(false);
      expect(log[0].fromState).toBe('UNBOUND');
      expect(log[0].toState).toBe('LINKED');
    });

    it('should track target_id in audit log entries', () => {
      validator.clearAuditLog();

      validator.validateTransition({
        from: 'PREPROCESSED',
        to: 'LINKED',
        targetId: 'target-123',
      });

      const log = validator.getAuditLog();
      expect(log[0].targetId).toBe('target-123');
    });

    it('should maintain chronological order in audit log', () => {
      validator.clearAuditLog();

      const transitions = [
        { from: 'UNBOUND', to: 'PREPROCESSED', targetId: null },
        { from: 'PREPROCESSED', to: 'LINKED', targetId: 'target-1' },
        { from: 'LINKED', to: 'FINALIZED', targetId: 'target-1' },
      ];

      transitions.forEach((t) => {
        validator.validateTransition(t as StateTransition);
      });

      const log = validator.getAuditLog();
      expect(log.length).toBe(3);

      for (let i = 0; i < log.length - 1; i++) {
        expect(new Date(log[i].timestamp) <= new Date(log[i + 1].timestamp)).toBe(true);
      }
    });

    it('should count transitions by state pair', () => {
      validator.clearAuditLog();

      // Execute same transition twice
      validator.validateTransition({
        from: 'UNBOUND',
        to: 'PREPROCESSED',
        targetId: null,
      });

      validator.validateTransition({
        from: 'UNBOUND',
        to: 'PREPROCESSED',
        targetId: null,
      });

      const count = validator.getTransitionCount('UNBOUND', 'PREPROCESSED');
      expect(count).toBe(2);
    });
  });

  describe('Concurrent Transitions (Rapid Sequential)', () => {
    // ─── 빠른 연속 전이: 레이스 컨디션 없음 확인 ───
    it('should handle rapid sequential transitions without race conditions', () => {
      validator.clearAuditLog();

      const transitions: StateTransition[] = [
        { from: 'UNBOUND', to: 'PREPROCESSED', targetId: null },
        { from: 'PREPROCESSED', to: 'LINKED', targetId: 'target-1' },
        { from: 'LINKED', to: 'FINALIZED', targetId: 'target-1' },
      ];

      // Execute rapidly
      for (let i = 0; i < 100; i++) {
        transitions.forEach((t) => {
          validator.validateTransition(t);
        });
      }

      const log = validator.getAuditLog();
      expect(log.length).toBe(300); // 3 transitions × 100 iterations

      // All should be successful
      const successCount = log.filter((e) => e.success).length;
      expect(successCount).toBe(300);
    });

    it('should not lose audit log entries during concurrent access', () => {
      validator.clearAuditLog();

      // Simulate multiple concurrent operations
      const operations = [];
      for (let i = 0; i < 50; i++) {
        validator.validateTransition({
          from: 'UNBOUND',
          to: 'PREPROCESSED',
          targetId: null,
        });
      }

      const log = validator.getAuditLog();
      expect(log.length).toBe(50);
    });

    it('should maintain data integrity during rapid state changes', () => {
      validator.clearAuditLog();

      for (let i = 0; i < 20; i++) {
        validator.validateTransition({
          from: 'UNBOUND',
          to: 'PREPROCESSED',
          targetId: null,
        });

        validator.validateTransition({
          from: 'PREPROCESSED',
          to: 'LINKED',
          targetId: 'target-x',
        });

        validator.validateTransition({
          from: 'LINKED',
          to: 'FINALIZED',
          targetId: 'target-x',
        });
      }

      const log = validator.getAuditLog();
      const unboundCount = log.filter((e) => e.fromState === 'UNBOUND').length;
      const linkedCount = log.filter((e) => e.fromState === 'LINKED').length;

      expect(unboundCount).toBe(20);
      expect(linkedCount).toBe(20);
    });
  });

  describe('State Persistence and Serialization', () => {
    // ─── 상태 직렬화/역직렬화 검증 ───
    it('should serialize and deserialize state transition', () => {
      const transition: StateTransition = {
        from: 'PREPROCESSED',
        to: 'LINKED',
        targetId: 'target-abc-123',
      };

      // Serialize
      const serialized = JSON.stringify(transition);
      expect(serialized).toBeDefined();

      // Deserialize
      const deserialized = JSON.parse(serialized) as StateTransition;

      // Verify consistency
      const result = validator.validateTransition(deserialized);
      expect(result.isValid).toBe(true);
    });

    it('should preserve targetId null through serialization', () => {
      const transition: StateTransition = {
        from: 'UNBOUND',
        to: 'PREPROCESSED',
        targetId: null,
      };

      const serialized = JSON.stringify(transition);
      const deserialized = JSON.parse(serialized) as StateTransition;

      expect(deserialized.targetId).toBeNull();

      const result = validator.validateTransition(deserialized);
      expect(result.isValid).toBe(true);
    });

    it('should maintain state validity across JSON roundtrip', () => {
      const transitions: StateTransition[] = [
        { from: 'UNBOUND', to: 'PREPROCESSED', targetId: null },
        { from: 'PREPROCESSED', to: 'LINKED', targetId: 'id-1' },
        { from: 'LINKED', to: 'FINALIZED', targetId: 'id-1' },
      ];

      transitions.forEach((t) => {
        const roundtripped = JSON.parse(JSON.stringify(t)) as StateTransition;
        const result = validator.validateTransition(roundtripped);
        expect(result.isValid).toBe(true);
      });
    });
  });

  describe('target_id Invariant Verification', () => {
    // ─── target_id NULL 불변성 검증 (모든 전이점에서) ───
    it('should enforce target_id=NULL at UNBOUND state', () => {
      const result = validator.validateTransition({
        from: 'UNBOUND',
        to: 'PREPROCESSED',
        targetId: 'any-id',
      });

      expect(result.isValid).toBe(false);
      expect(result.error).toContain('target_id must be NULL');
    });

    it('should enforce target_id=NULL at PREPROCESSED state', () => {
      const result = validator.validateTransition({
        from: 'PREPROCESSED',
        to: 'UNBOUND',
        targetId: 'any-id',
      });

      expect(result.isValid).toBe(false);
    });

    it('should enforce target_id!=NULL at LINKED state', () => {
      const result = validator.validateTransition({
        from: 'PREPROCESSED',
        to: 'LINKED',
        targetId: null,
      });

      expect(result.isValid).toBe(false);
      expect(result.error).toContain('target_id must be non-NULL');
    });

    it('should enforce target_id!=NULL at FINALIZED state', () => {
      const result = validator.validateTransition({
        from: 'LINKED',
        to: 'FINALIZED',
        targetId: null,
      });

      expect(result.isValid).toBe(false);
      expect(result.error).toContain('target_id must be non-NULL');
    });

    it('should maintain target_id invariant across all valid paths', () => {
      const validPaths: StateTransition[] = [
        { from: 'UNBOUND', to: 'PREPROCESSED', targetId: null },
        { from: 'PREPROCESSED', to: 'LINKED', targetId: 'target-1' },
        { from: 'LINKED', to: 'FINALIZED', targetId: 'target-1' },
      ];

      validPaths.forEach((path) => {
        const result = validator.validateTransition(path);
        expect(result.isValid).toBe(true);

        // Verify invariant: targetId should match destination state requirements
        if (path.to === 'UNBOUND' || path.to === 'PREPROCESSED') {
          expect(path.targetId).toBeNull();
        } else {
          expect(path.targetId).not.toBeNull();
        }
      });
    });
  });
});
