/**
 * E2E Tests: Voice Memo FSM Pipeline
 *
 * 음성 메모 FSM 파이프라인 E2E 테스트
 * - 행복 경로: UNBOUND→PREPROCESSED→LINKED→FINALIZED
 * - 고아 메모: UNBOUND→PREPROCESSED→(대기)→LINKED
 * - 복구 시나리오: 각 상태에서 재시작 시뮬레이션
 * - DC-5 위반: 유효하지 않은 상태 스킵 시도
 *
 * @feature F-017
 * @requirement FSM, Voice Recording
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

// ─── Type Definitions ────────────────────────────────────────────

type MeasurementState = 'UNBOUND' | 'PREPROCESSED' | 'LINKED' | 'FINALIZED';

interface VoiceMemo {
  id: string;
  swing_id: string;
  recording_url?: string;
  duration_ms: number;
  state: MeasurementState;
  target_id: string | null;
  created_at: string;
  updated_at: string;
  processed_at?: string;
  linked_at?: string;
  finalized_at?: string;
}

interface StateTransitionLog {
  timestamp: string;
  fromState: MeasurementState;
  toState: MeasurementState;
  success: boolean;
  error?: string;
}

// ─── Voice FSM Pipeline Implementation (mock) ──────────────────

class VoiceFSMPipeline {
  private stateTransitionLogs: StateTransitionLog[] = [];

  /**
   * 새로운 음성 메모를 생성합니다 (UNBOUND 상태).
   */
  async createVoiceMemo(swingId: string): Promise<VoiceMemo> {
    return {
      id: `memo-${Date.now()}`,
      swing_id: swingId,
      duration_ms: 0,
      state: 'UNBOUND',
      target_id: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
  }

  /**
   * UNBOUND → PREPROCESSED 전환
   * 음성 파일이 업로드되고 전처리됨
   */
  async preprocessVoice(memo: VoiceMemo): Promise<VoiceMemo> {
    if (memo.state !== 'UNBOUND') {
      throw new Error(`Cannot preprocess from state ${memo.state}`);
    }

    // Simulate preprocessing
    await new Promise((resolve) => setTimeout(resolve, 100));

    const updated: VoiceMemo = {
      ...memo,
      state: 'PREPROCESSED',
      recording_url: 'https://storage.example.com/memo-' + memo.id,
      processed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    this.logTransition(memo.state, updated.state, true);
    return updated;
  }

  /**
   * PREPROCESSED → LINKED 전환
   * 음성이 swing_id와 연결됨
   */
  async linkToSwing(memo: VoiceMemo, targetId: string): Promise<VoiceMemo> {
    if (memo.state !== 'PREPROCESSED') {
      throw new Error(`Cannot link from state ${memo.state}`);
    }

    // Simulate linking
    await new Promise((resolve) => setTimeout(resolve, 100));

    const updated: VoiceMemo = {
      ...memo,
      state: 'LINKED',
      target_id: targetId,
      linked_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    this.logTransition(memo.state, updated.state, true);
    return updated;
  }

  /**
   * LINKED → FINALIZED 전환
   * 최종 검증 및 완료
   */
  async finalizeVoice(memo: VoiceMemo): Promise<VoiceMemo> {
    if (memo.state !== 'LINKED') {
      throw new Error(`Cannot finalize from state ${memo.state}`);
    }

    if (!memo.target_id) {
      throw new Error('Cannot finalize without target_id');
    }

    // Simulate finalization
    await new Promise((resolve) => setTimeout(resolve, 100));

    const updated: VoiceMemo = {
      ...memo,
      state: 'FINALIZED',
      finalized_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    this.logTransition(memo.state, updated.state, true);
    return updated;
  }

  /**
   * DC-5 위반 감지: 유효하지 않은 상태 전환 시도
   */
  async attemptInvalidTransition(
    memo: VoiceMemo,
    targetState: MeasurementState
  ): Promise<{ success: boolean; error: string }> {
    try {
      // 유효하지 않은 전환 목록
      const invalidTransitions: Record<MeasurementState, MeasurementState[]> = {
        UNBOUND: ['LINKED', 'FINALIZED'],
        PREPROCESSED: ['FINALIZED'],
        LINKED: ['PREPROCESSED', 'UNBOUND'],
        FINALIZED: ['UNBOUND', 'PREPROCESSED', 'LINKED'],
      };

      if (invalidTransitions[memo.state].includes(targetState)) {
        const error = `DC-5: Invalid transition from ${memo.state} to ${targetState}`;
        this.logTransition(memo.state, targetState, false, error);
        return { success: false, error };
      }

      return { success: true, error: '' };
    } catch (err) {
      return { success: false, error: (err as Error).message };
    }
  }

  /**
   * 상태 전환을 로그에 기록합니다.
   */
  private logTransition(
    fromState: MeasurementState,
    toState: MeasurementState,
    success: boolean,
    error?: string
  ): void {
    this.stateTransitionLogs.push({
      timestamp: new Date().toISOString(),
      fromState,
      toState,
      success,
      error,
    });
  }

  /**
   * 상태 전환 로그를 반환합니다.
   */
  getTransitionLogs(): StateTransitionLog[] {
    return [...this.stateTransitionLogs];
  }

  /**
   * 로그를 초기화합니다.
   */
  clearLogs(): void {
    this.stateTransitionLogs = [];
  }

  /**
   * 현재 상태 시퀀스를 반환합니다.
   */
  getStateSequence(): MeasurementState[] {
    const states: MeasurementState[] = [];
    let currentState: MeasurementState | null = null;

    for (const log of this.stateTransitionLogs) {
      if (log.success) {
        if (currentState !== log.fromState) {
          currentState = log.fromState;
        }
        states.push(log.toState);
        currentState = log.toState;
      }
    }

    return states;
  }
}

// ─── Tests ──────────────────────────────────────────────────────

describe('Voice Memo FSM Pipeline (F-017)', () => {
  let pipeline: VoiceFSMPipeline;

  beforeEach(() => {
    pipeline = new VoiceFSMPipeline();
  });

  afterEach(() => {
    pipeline.clearLogs();
  });

  describe('Full Happy Path: UNBOUND → PREPROCESSED → LINKED → FINALIZED', () => {
    // ─── 행복 경로: 완전한 FSM 진행 ───
    it('should complete full happy path successfully', async () => {
      // 1. UNBOUND: 메모 생성
      let memo = await pipeline.createVoiceMemo('swing-1');
      expect(memo.state).toBe('UNBOUND');
      expect(memo.target_id).toBeNull();

      // 2. UNBOUND → PREPROCESSED: 음성 전처리
      memo = await pipeline.preprocessVoice(memo);
      expect(memo.state).toBe('PREPROCESSED');
      expect(memo.recording_url).toBeDefined();

      // 3. PREPROCESSED → LINKED: swing과 연결
      memo = await pipeline.linkToSwing(memo, 'target-1');
      expect(memo.state).toBe('LINKED');
      expect(memo.target_id).toBe('target-1');

      // 4. LINKED → FINALIZED: 최종화
      memo = await pipeline.finalizeVoice(memo);
      expect(memo.state).toBe('FINALIZED');
      expect(memo.finalized_at).toBeDefined();
    });

    it('should log all transitions in happy path', async () => {
      let memo = await pipeline.createVoiceMemo('swing-2');
      memo = await pipeline.preprocessVoice(memo);
      memo = await pipeline.linkToSwing(memo, 'target-2');
      memo = await pipeline.finalizeVoice(memo);

      const logs = pipeline.getTransitionLogs();

      expect(logs.length).toBe(3);
      expect(logs[0]!.fromState).toBe('UNBOUND');
      expect(logs[0]!.toState).toBe('PREPROCESSED');
      expect(logs[1]!.fromState).toBe('PREPROCESSED');
      expect(logs[1]!.toState).toBe('LINKED');
      expect(logs[2]!.fromState).toBe('LINKED');
      expect(logs[2]!.toState).toBe('FINALIZED');
    });

    it('should verify state sequence in happy path', async () => {
      let memo = await pipeline.createVoiceMemo('swing-3');
      memo = await pipeline.preprocessVoice(memo);
      memo = await pipeline.linkToSwing(memo, 'target-3');
      memo = await pipeline.finalizeVoice(memo);

      const sequence = pipeline.getStateSequence();

      expect(sequence).toEqual(['PREPROCESSED', 'LINKED', 'FINALIZED']);
    });

    it('should timestamp each transition', async () => {
      let memo = await pipeline.createVoiceMemo('swing-4');
      const beforePreprocess = new Date();

      memo = await pipeline.preprocessVoice(memo);
      memo = await pipeline.linkToSwing(memo, 'target-4');
      memo = await pipeline.finalizeVoice(memo);

      const afterFinalize = new Date();
      const logs = pipeline.getTransitionLogs();

      for (const log of logs) {
        const logTime = new Date(log.timestamp);
        expect(logTime.getTime()).toBeGreaterThanOrEqual(beforePreprocess.getTime());
        expect(logTime.getTime()).toBeLessThanOrEqual(afterFinalize.getTime() + 1000);
      }
    });
  });

  describe('Orphan Memo Scenario: UNBOUND → PREPROCESSED → (wait) → LINKED', () => {
    // ─── 고아 메모: 전처리 후 대기 ───
    it('should handle orphan memo that waits in PREPROCESSED state', async () => {
      // Create and preprocess
      let memo = await pipeline.createVoiceMemo('swing-5');
      memo = await pipeline.preprocessVoice(memo);

      expect(memo.state).toBe('PREPROCESSED');
      expect(memo.target_id).toBeNull();

      // Simulate waiting (no action for a period)
      await new Promise((resolve) => setTimeout(resolve, 200));

      // Later, link it
      memo = await pipeline.linkToSwing(memo, 'target-5');

      expect(memo.state).toBe('LINKED');
      expect(memo.target_id).toBe('target-5');
    });

    it('should allow transition to LINKED from PREPROCESSED after delay', async () => {
      let memo = await pipeline.createVoiceMemo('swing-6');
      memo = await pipeline.preprocessVoice(memo);

      // Wait interval
      const beforeLink = new Date();
      await new Promise((resolve) => setTimeout(resolve, 150));
      memo = await pipeline.linkToSwing(memo, 'target-6');
      const afterLink = new Date();

      expect(memo.state).toBe('LINKED');
      expect(afterLink.getTime() - beforeLink.getTime()).toBeGreaterThan(100);
    });

    it('should complete orphan memo flow after waiting', async () => {
      let memo = await pipeline.createVoiceMemo('swing-7');
      memo = await pipeline.preprocessVoice(memo);

      // Wait in PREPROCESSED state
      await new Promise((resolve) => setTimeout(resolve, 150));

      // Continue path
      memo = await pipeline.linkToSwing(memo, 'target-7');
      memo = await pipeline.finalizeVoice(memo);

      expect(memo.state).toBe('FINALIZED');

      const sequence = pipeline.getStateSequence();
      expect(sequence).toContain('PREPROCESSED');
      expect(sequence).toContain('LINKED');
      expect(sequence).toContain('FINALIZED');
    });
  });

  describe('Recovery Scenarios: Simulate Restart at Each State', () => {
    // ─── 복구 시나리오: 각 상태에서 재시작 ───
    it('should recover from UNBOUND state restart', async () => {
      // Create memo
      let memo = await pipeline.createVoiceMemo('swing-8');
      expect(memo.state).toBe('UNBOUND');

      // Simulate restart by reprocessing from current state
      memo = await pipeline.preprocessVoice(memo);
      expect(memo.state).toBe('PREPROCESSED');

      // Continue normal flow
      memo = await pipeline.linkToSwing(memo, 'target-8');
      memo = await pipeline.finalizeVoice(memo);

      expect(memo.state).toBe('FINALIZED');
    });

    it('should recover from PREPROCESSED state restart', async () => {
      // Create and preprocess
      let memo = await pipeline.createVoiceMemo('swing-9');
      memo = await pipeline.preprocessVoice(memo);

      // Simulate restart/redownload from PREPROCESSED
      const memoAfterRestart = {
        ...memo,
        updated_at: new Date().toISOString(),
      };

      expect(memoAfterRestart.state).toBe('PREPROCESSED');

      // Continue from PREPROCESSED
      memo = await pipeline.linkToSwing(memoAfterRestart, 'target-9');
      expect(memo.state).toBe('LINKED');

      memo = await pipeline.finalizeVoice(memo);
      expect(memo.state).toBe('FINALIZED');
    });

    it('should recover from LINKED state restart', async () => {
      // Build up to LINKED
      let memo = await pipeline.createVoiceMemo('swing-10');
      memo = await pipeline.preprocessVoice(memo);
      memo = await pipeline.linkToSwing(memo, 'target-10');

      expect(memo.state).toBe('LINKED');

      // Simulate restart at LINKED
      const memoAfterRestart = {
        ...memo,
        updated_at: new Date().toISOString(),
      };

      // Continue from LINKED
      memo = await pipeline.finalizeVoice(memoAfterRestart);
      expect(memo.state).toBe('FINALIZED');
    });

    it('should not allow recovery from FINALIZED state', async () => {
      // Complete happy path
      let memo = await pipeline.createVoiceMemo('swing-11');
      memo = await pipeline.preprocessVoice(memo);
      memo = await pipeline.linkToSwing(memo, 'target-11');
      memo = await pipeline.finalizeVoice(memo);

      expect(memo.state).toBe('FINALIZED');

      // Try to transition from FINALIZED (should fail)
      const result = await pipeline.attemptInvalidTransition(memo, 'PREPROCESSED');

      expect(result.success).toBe(false);
      expect(result.error).toContain('DC-5');
    });
  });

  describe('DC-5 Violation: Attempt Invalid State Skips', () => {
    // ─── DC-5 위반: 유효하지 않은 상태 스킵 ───
    it('should reject UNBOUND → LINKED skip (DC-5)', async () => {
      const memo = await pipeline.createVoiceMemo('swing-12');

      const result = await pipeline.attemptInvalidTransition(memo, 'LINKED');

      expect(result.success).toBe(false);
      expect(result.error).toContain('DC-5');
      expect(result.error).toContain('UNBOUND');
      expect(result.error).toContain('LINKED');
    });

    it('should reject UNBOUND → FINALIZED skip (DC-5)', async () => {
      const memo = await pipeline.createVoiceMemo('swing-13');

      const result = await pipeline.attemptInvalidTransition(memo, 'FINALIZED');

      expect(result.success).toBe(false);
      expect(result.error).toContain('DC-5');
    });

    it('should reject PREPROCESSED → FINALIZED skip (DC-5)', async () => {
      let memo = await pipeline.createVoiceMemo('swing-14');
      memo = await pipeline.preprocessVoice(memo);

      const result = await pipeline.attemptInvalidTransition(memo, 'FINALIZED');

      expect(result.success).toBe(false);
      expect(result.error).toContain('DC-5');
    });

    it('should reject transition from FINALIZED state (DC-5)', async () => {
      let memo = await pipeline.createVoiceMemo('swing-15');
      memo = await pipeline.preprocessVoice(memo);
      memo = await pipeline.linkToSwing(memo, 'target-15');
      memo = await pipeline.finalizeVoice(memo);

      const result = await pipeline.attemptInvalidTransition(memo, 'PREPROCESSED');

      expect(result.success).toBe(false);
      expect(result.error).toContain('DC-5');
    });

    it('should reject backward transition LINKED → PREPROCESSED (DC-5)', async () => {
      let memo = await pipeline.createVoiceMemo('swing-16');
      memo = await pipeline.preprocessVoice(memo);
      memo = await pipeline.linkToSwing(memo, 'target-16');

      const result = await pipeline.attemptInvalidTransition(memo, 'PREPROCESSED');

      expect(result.success).toBe(false);
      expect(result.error).toContain('DC-5');
    });

    it('should log failed transition attempts', async () => {
      let memo = await pipeline.createVoiceMemo('swing-17');

      // Attempt invalid transition
      const result = await pipeline.attemptInvalidTransition(memo, 'LINKED');

      expect(result.success).toBe(false);

      // Check if logged
      const logs = pipeline.getTransitionLogs();
      const failedLog = logs.find(
        (log) =>
          log.fromState === 'UNBOUND' &&
          log.toState === 'LINKED' &&
          !log.success
      );

      expect(failedLog).toBeDefined();
      expect(failedLog?.error).toContain('DC-5');
    });
  });

  describe('Edge Cases and Error Conditions', () => {
    // ─── 엣지 케이스 ───
    it('should throw error on invalid state transition attempt', async () => {
      let memo = await pipeline.createVoiceMemo('swing-18');
      memo = await pipeline.preprocessVoice(memo);

      // Try to preprocess again
      await expect(pipeline.preprocessVoice(memo)).rejects.toThrow();
    });

    it('should require target_id before finalization', async () => {
      let memo = await pipeline.createVoiceMemo('swing-19');
      memo = await pipeline.preprocessVoice(memo);

      // Skip linking and try to finalize
      memo.state = 'LINKED';
      memo.target_id = null; // Missing target_id

      await expect(pipeline.finalizeVoice(memo)).rejects.toThrow(
        /target_id/i
      );
    });

    it('should preserve memo properties through state transitions', async () => {
      let memo = await pipeline.createVoiceMemo('swing-20');
      const originalId = memo.id;
      const originalSwingId = memo.swing_id;

      memo = await pipeline.preprocessVoice(memo);
      memo = await pipeline.linkToSwing(memo, 'target-20');
      memo = await pipeline.finalizeVoice(memo);

      expect(memo.id).toBe(originalId);
      expect(memo.swing_id).toBe(originalSwingId);
    });
  });

  describe('Multiple Memo Handling', () => {
    // ─── 복수 메모 처리 ───
    it('should handle multiple memos independently', async () => {
      // Create two memos
      let memo1 = await pipeline.createVoiceMemo('swing-21');
      let memo2 = await pipeline.createVoiceMemo('swing-22');

      expect(memo1.id).not.toBe(memo2.id);

      // Process memo1 through happy path
      memo1 = await pipeline.preprocessVoice(memo1);
      memo1 = await pipeline.linkToSwing(memo1, 'target-21');
      memo1 = await pipeline.finalizeVoice(memo1);

      // Process memo2 differently
      memo2 = await pipeline.preprocessVoice(memo2);

      // Verify final states
      expect(memo1.state).toBe('FINALIZED');
      expect(memo2.state).toBe('PREPROCESSED');
    });

    it('should log transitions for multiple memos', async () => {
      let memo1 = await pipeline.createVoiceMemo('swing-23');
      let memo2 = await pipeline.createVoiceMemo('swing-24');

      memo1 = await pipeline.preprocessVoice(memo1);
      memo2 = await pipeline.preprocessVoice(memo2);

      const logs = pipeline.getTransitionLogs();

      expect(logs.length).toBe(2);
      expect(logs.filter((l) => l.success).length).toBe(2);
    });
  });
});
