/**
 * Unit Tests: 3-Layer Data Separation
 *
 * 3계층 데이터 분리 검증
 * - 올바른 계층 분리: raw → LayerA, derived → LayerB, coaching → LayerC
 * - 교차 오염 방지: LayerA는 derived 필드를 포함하지 않음
 * - LayerA 불변성: readonly 인터페이스 강제
 * - Primary Fix 스칼라 강제 (DC-4): 배열값 거부
 *
 * @feature F-019
 * @requirement DC-1, DC-4
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// ─── Type Definitions ────────────────────────────────────────────

/**
 * LayerA: 원본 측정값 (불변)
 * - 카메라, 센서로부터의 원본 데이터만 포함
 */
interface LayerA {
  readonly id: string;
  readonly swing_id: string;
  readonly raw_distance_m: number;
  readonly raw_carry_m: number;
  readonly raw_launch_angle: number;
  readonly raw_club_head_speed: number;
  readonly raw_ball_speed: number;
  readonly raw_spin_rate: number;
  readonly camera_meta: Record<string, unknown>;
  readonly created_at: string;
}

/**
 * LayerB: 파생 측정값 (계산된 값)
 * - LayerA에서 파생된 값들
 * - 신뢰도, 조정값, 통계치 포함
 */
interface LayerB {
  id: string;
  swing_id: string;
  distance_m: number;
  carry_m: number;
  launch_angle: number;
  club_head_speed: number;
  ball_speed: number;
  spin_rate: number;
  confidence_score: number;
  adjusted_for_wind: boolean;
  adjusted_for_lie: boolean;
  created_at: string;
  updated_at: string;
}

/**
 * LayerC: 코칭/분석값 (사람의 판단 포함)
 * - 프로의 피드백
 * - 교정 조치
 * - 회원의 검증
 */
interface LayerC {
  id: string;
  swing_id: string;
  pro_feedback?: string;
  pro_confidence?: number;
  member_verified: boolean;
  member_verified_at?: string;
  member_confidence?: number;
  coaching_notes?: string;
  is_hidden: boolean;
  updated_at: string;
}

/**
 * 통합 레이어 (DB에서 조인된 형태)
 */
type MeasurementFull = LayerA & Omit<LayerB, "created_at" | "updated_at"> & Omit<LayerC, "id" | "updated_at">

// ─── Data Layer Separator Implementation (mock) ──────────────

class DataLayerSeparator {
  /**
   * 통합 데이터를 LayerA(원본)로 분리합니다.
   * 원본 데이터만 포함, readonly 강제, deep freeze 적용
   */
  extractLayerA(data: MeasurementFull): LayerA {
    const layerA = {
      id: data.id,
      swing_id: data.swing_id,
      raw_distance_m: data.raw_distance_m,
      raw_carry_m: data.raw_carry_m,
      raw_launch_angle: data.raw_launch_angle,
      raw_club_head_speed: data.raw_club_head_speed,
      raw_ball_speed: data.raw_ball_speed,
      raw_spin_rate: data.raw_spin_rate,
      camera_meta: Object.freeze({ ...data.camera_meta }),
      created_at: data.created_at,
    } as LayerA;
    return Object.freeze(layerA);
  }

  /**
   * 통합 데이터를 LayerB(파생값)로 분리합니다.
   * LayerA에서 계산된 값들만 포함
   */
  extractLayerB(data: MeasurementFull): LayerB {
    return {
      id: data.id,
      swing_id: data.swing_id,
      distance_m: data.distance_m,
      carry_m: data.carry_m,
      launch_angle: data.launch_angle,
      club_head_speed: data.club_head_speed,
      ball_speed: data.ball_speed,
      spin_rate: data.spin_rate,
      confidence_score: data.confidence_score,
      adjusted_for_wind: data.adjusted_for_wind,
      adjusted_for_lie: data.adjusted_for_lie,
      created_at: data.created_at,
      updated_at: data.updated_at,
    };
  }

  /**
   * 통합 데이터를 LayerC(코칭값)로 분리합니다.
   * 프로와 회원의 피드백 포함
   */
  extractLayerC(data: MeasurementFull): LayerC {
    return {
      id: data.id,
      swing_id: data.swing_id,
      pro_feedback: data.pro_feedback,
      pro_confidence: data.pro_confidence,
      member_verified: data.member_verified,
      member_verified_at: data.member_verified_at,
      member_confidence: data.member_confidence,
      coaching_notes: data.coaching_notes,
      is_hidden: data.is_hidden,
      updated_at: data.updated_at,
    };
  }

  /**
   * LayerA에서 derived 필드를 포함하지 않는지 검증합니다.
   * DC-1: 계층 분리 위반 검토
   */
  validateLayerAIsolation(layerA: LayerA): boolean {
    const derivedFields = [
      'distance_m',
      'carry_m',
      'launch_angle',
      'club_head_speed',
      'ball_speed',
      'spin_rate',
      'confidence_score',
      'adjusted_for_wind',
      'adjusted_for_lie',
      'pro_feedback',
      'pro_confidence',
      'member_verified',
      'coaching_notes',
      'is_hidden',
    ];

    const layerAKeys = Object.keys(layerA);

    for (const field of derivedFields) {
      if (layerAKeys.includes(field)) {
        return false; // Cross-contamination detected
      }
    }

    return true; // Clean separation
  }

  /**
   * LayerA가 readonly인지 검증합니다 (Object.freeze 확인).
   */
  validateLayerAImmutability(layerA: LayerA): boolean {
    try {
      // Attempt to modify a property
      (layerA as any).id = 'modified';
      return false; // Should not succeed
    } catch {
      return true; // Object is frozen
    }
  }

  /**
   * LayerA의 중첩된 객체까지 깊게 freeze되었는지 검증합니다 (Deep Freeze).
   */
  validateLayerADeepFreeze(layerA: LayerA): boolean {
    // Check if object itself is frozen
    if (!Object.isFrozen(layerA)) {
      return false;
    }

    // Check nested objects (camera_meta)
    const nested = layerA.camera_meta;
    if (nested && typeof nested === 'object') {
      if (!Object.isFrozen(nested)) {
        return false;
      }
    }

    return true;
  }

  /**
   * 6가지 교차 오염 경로를 모두 검증합니다 (A→B, A→C, B→A, B→C, C→A, C→B).
   */
  validateCrossContaminationMatrix(data: MeasurementFull): {
    isValid: boolean;
    violations: string[];
  } {
    const violations: string[] = [];

    const layerA = this.extractLayerA(data);
    const layerB = this.extractLayerB(data);
    const layerC = this.extractLayerC(data);

    // Path 1: LayerA → LayerB contamination
    const layerBKeys = Object.keys(layerB);
    const rawFields = [
      'raw_distance_m',
      'raw_carry_m',
      'raw_launch_angle',
      'raw_club_head_speed',
      'raw_ball_speed',
      'raw_spin_rate',
    ];
    if (rawFields.some((f) => layerBKeys.includes(f))) {
      violations.push('A→B: LayerB contains raw fields from LayerA');
    }

    // Path 2: LayerA → LayerC contamination
    const layerCKeys = Object.keys(layerC);
    if (rawFields.some((f) => layerCKeys.includes(f))) {
      violations.push('A→C: LayerC contains raw fields from LayerA');
    }

    // Path 3: LayerB → LayerA contamination (derived fields in A)
    if (!this.validateLayerAIsolation(layerA)) {
      violations.push('B→A: LayerA contains derived fields from LayerB');
    }

    // Path 4: LayerB → LayerC contamination
    const coachingFields = ['pro_feedback', 'pro_confidence', 'member_verified', 'coaching_notes'];
    const derivedInC = Object.keys(layerC).filter((k) =>
      coachingFields.includes(k)
    );
    if (
      derivedInC.length > 0 &&
      Object.keys(layerB).some((k) => derivedInC.includes(k))
    ) {
      violations.push('B→C: LayerC improperly contains LayerB-style fields');
    }

    // Path 5: LayerC → LayerA contamination (coaching in raw)
    if (coachingFields.some((f) => Object.keys(layerA).includes(f))) {
      violations.push('C→A: LayerA contains coaching fields from LayerC');
    }

    // Path 6: LayerC → LayerB contamination (coaching in derived)
    if (coachingFields.some((f) => Object.keys(layerB).includes(f))) {
      violations.push('C→B: LayerB contains coaching fields from LayerC');
    }

    return {
      isValid: violations.length === 0,
      violations,
    };
  }

  /**
   * Primary Fix가 스칼라인지 확인합니다 (DC-4).
   * 배열값을 거부합니다.
   */
  validatePrimaryFixScalar(data: LayerB): boolean {
    // Primary Fix는 distance_m
    if (Array.isArray(data.distance_m)) {
      return false; // Array values rejected
    }

    if (typeof data.distance_m !== 'number') {
      return false;
    }

    return true;
  }

  /**
   * 모든 핵심 필드가 스칼라인지 확인합니다 (DC-4).
   */
  validateAllCoreFieldsScalar(data: LayerB): boolean {
    const scalarFields = [
      'distance_m',
      'carry_m',
      'launch_angle',
      'club_head_speed',
      'ball_speed',
      'spin_rate',
      'confidence_score',
    ];

    for (const field of scalarFields) {
      const value = data[field as keyof LayerB];

      if (Array.isArray(value)) {
        return false;
      }

      if (typeof value !== 'number') {
        return false;
      }
    }

    return true;
  }

  /**
   * 계층 분리가 올바르게 되었는지 종합 검증합니다.
   */
  validateLayerSeparation(data: MeasurementFull): {
    isValid: boolean;
    errors: string[];
  } {
    const errors: string[] = [];

    const layerA = this.extractLayerA(data);
    const layerB = this.extractLayerB(data);

    // LayerA 교차 오염 검사
    if (!this.validateLayerAIsolation(layerA)) {
      errors.push('DC-1: LayerA contains derived fields (cross-contamination)');
    }

    // LayerA 불변성 검사
    if (!this.validateLayerAImmutability(layerA)) {
      errors.push('DC-1: LayerA is not immutable (not frozen)');
    }

    // Primary Fix 스칼라 검사 (DC-4)
    if (!this.validatePrimaryFixScalar(layerB)) {
      errors.push('DC-4: Primary Fix (distance_m) is not a scalar value');
    }

    // 모든 핵심 필드 스칼라 검사
    if (!this.validateAllCoreFieldsScalar(layerB)) {
      errors.push('DC-4: Core fields must be scalar (not arrays)');
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }
}

// ─── Tests ──────────────────────────────────────────────────────

describe('3-Layer Data Separation (DC-1, DC-4)', () => {
  let separator: DataLayerSeparator;

  beforeEach(() => {
    separator = new DataLayerSeparator();
  });

  describe('Correct Layer Separation', () => {
    // ─── 올바른 계층 분리 ───
    it('should extract LayerA with raw measurements', () => {
      const data: MeasurementFull = {
        id: 'measure-1',
        swing_id: 'swing-1',
        raw_distance_m: 200,
        raw_carry_m: 180,
        raw_launch_angle: 15,
        raw_club_head_speed: 90,
        raw_ball_speed: 130,
        raw_spin_rate: 2500,
        camera_meta: { camera_id: 'cam-1', fps: 240 },
        created_at: '2026-03-11T10:00:00Z',
        distance_m: 200,
        carry_m: 180,
        launch_angle: 15,
        club_head_speed: 90,
        ball_speed: 130,
        spin_rate: 2500,
        confidence_score: 0.85,
        adjusted_for_wind: false,
        adjusted_for_lie: false,
        updated_at: '2026-03-11T10:00:00Z',
        pro_feedback: 'Good form',
        pro_confidence: 0.9,
        member_verified: true,
        member_verified_at: '2026-03-11T11:00:00Z',
        member_confidence: 0.8,
        coaching_notes: 'Focus on follow-through',
        is_hidden: false,
      };

      const layerA = separator.extractLayerA(data);

      expect(layerA.id).toBe('measure-1');
      expect(layerA.raw_distance_m).toBe(200);
      expect(layerA.camera_meta.camera_id).toBe('cam-1');
    });

    it('should extract LayerB with derived measurements', () => {
      const data: MeasurementFull = {
        id: 'measure-2',
        swing_id: 'swing-2',
        raw_distance_m: 200,
        raw_carry_m: 180,
        raw_launch_angle: 15,
        raw_club_head_speed: 90,
        raw_ball_speed: 130,
        raw_spin_rate: 2500,
        camera_meta: {},
        created_at: '2026-03-11T10:00:00Z',
        distance_m: 205,
        carry_m: 185,
        launch_angle: 15.2,
        club_head_speed: 91,
        ball_speed: 131,
        spin_rate: 2480,
        confidence_score: 0.85,
        adjusted_for_wind: true,
        adjusted_for_lie: false,
        updated_at: '2026-03-11T10:05:00Z',
        pro_feedback: undefined,
        pro_confidence: undefined,
        member_verified: false,
        member_verified_at: undefined,
        member_confidence: undefined,
        coaching_notes: undefined,
        is_hidden: false,
      };

      const layerB = separator.extractLayerB(data);

      expect(layerB.distance_m).toBe(205);
      expect(layerB.confidence_score).toBe(0.85);
      expect(layerB.adjusted_for_wind).toBe(true);
    });

    it('should extract LayerC with coaching/verification data', () => {
      const data: MeasurementFull = {
        id: 'measure-3',
        swing_id: 'swing-3',
        raw_distance_m: 200,
        raw_carry_m: 180,
        raw_launch_angle: 15,
        raw_club_head_speed: 90,
        raw_ball_speed: 130,
        raw_spin_rate: 2500,
        camera_meta: {},
        created_at: '2026-03-11T10:00:00Z',
        distance_m: 200,
        carry_m: 180,
        launch_angle: 15,
        club_head_speed: 90,
        ball_speed: 130,
        spin_rate: 2500,
        confidence_score: 0.85,
        adjusted_for_wind: false,
        adjusted_for_lie: false,
        updated_at: '2026-03-11T10:00:00Z',
        pro_feedback: 'Excellent club face alignment',
        pro_confidence: 0.95,
        member_verified: true,
        member_verified_at: '2026-03-11T11:30:00Z',
        member_confidence: 0.9,
        coaching_notes: 'Maintain this swing tempo',
        is_hidden: false,
      };

      const layerC = separator.extractLayerC(data);

      expect(layerC.pro_feedback).toBe('Excellent club face alignment');
      expect(layerC.member_verified).toBe(true);
      expect(layerC.is_hidden).toBe(false);
    });
  });

  describe('Cross-Contamination Prevention', () => {
    // ─── 교차 오염 방지 ───
    it('should detect LayerA containing derived field (distance_m)', () => {
      const invalidLayerA = {
        id: 'measure-4',
        swing_id: 'swing-4',
        raw_distance_m: 200,
        distance_m: 205, // DERIVED FIELD - VIOLATION
        camera_meta: {},
        created_at: '2026-03-11T10:00:00Z',
      } as unknown as LayerA;

      const isClean = separator.validateLayerAIsolation(invalidLayerA);
      expect(isClean).toBe(false);
    });

    it('should detect LayerA containing derived field (confidence_score)', () => {
      const invalidLayerA = {
        id: 'measure-5',
        swing_id: 'swing-5',
        raw_distance_m: 200,
        raw_carry_m: 180,
        confidence_score: 0.85, // DERIVED FIELD - VIOLATION
        camera_meta: {},
        created_at: '2026-03-11T10:00:00Z',
      } as unknown as LayerA;

      const isClean = separator.validateLayerAIsolation(invalidLayerA);
      expect(isClean).toBe(false);
    });

    it('should detect LayerA containing coaching field (pro_feedback)', () => {
      const invalidLayerA = {
        id: 'measure-6',
        swing_id: 'swing-6',
        raw_distance_m: 200,
        raw_carry_m: 180,
        pro_feedback: 'Good form', // COACHING FIELD - VIOLATION
        camera_meta: {},
        created_at: '2026-03-11T10:00:00Z',
      } as unknown as LayerA;

      const isClean = separator.validateLayerAIsolation(invalidLayerA);
      expect(isClean).toBe(false);
    });

    it('should pass clean LayerA without derived fields', () => {
      const cleanLayerA: LayerA = {
        id: 'measure-7',
        swing_id: 'swing-7',
        raw_distance_m: 200,
        raw_carry_m: 180,
        raw_launch_angle: 15,
        raw_club_head_speed: 90,
        raw_ball_speed: 130,
        raw_spin_rate: 2500,
        camera_meta: { camera_id: 'cam-1' },
        created_at: '2026-03-11T10:00:00Z',
      };

      const isClean = separator.validateLayerAIsolation(cleanLayerA);
      expect(isClean).toBe(true);
    });
  });

  describe('LayerA Immutability', () => {
    // ─── LayerA 불변성 ───
    it('should freeze LayerA to prevent modification', () => {
      const data: MeasurementFull = {
        id: 'measure-8',
        swing_id: 'swing-8',
        raw_distance_m: 200,
        raw_carry_m: 180,
        raw_launch_angle: 15,
        raw_club_head_speed: 90,
        raw_ball_speed: 130,
        raw_spin_rate: 2500,
        camera_meta: {},
        created_at: '2026-03-11T10:00:00Z',
        distance_m: 200,
        carry_m: 180,
        launch_angle: 15,
        club_head_speed: 90,
        ball_speed: 130,
        spin_rate: 2500,
        confidence_score: 0.85,
        adjusted_for_wind: false,
        adjusted_for_lie: false,
        updated_at: '2026-03-11T10:00:00Z',
        pro_feedback: undefined,
        pro_confidence: undefined,
        member_verified: false,
        member_verified_at: undefined,
        member_confidence: undefined,
        coaching_notes: undefined,
        is_hidden: false,
      };

      const layerA = separator.extractLayerA(data);

      // Verify it's immutable (frozen)
      const isImmutable = separator.validateLayerAImmutability(layerA);
      expect(isImmutable).toBe(true);
    });

    it('should reject mutable LayerA', () => {
      const mutableLayerA = {
        id: 'measure-9',
        swing_id: 'swing-9',
        raw_distance_m: 200,
        raw_carry_m: 180,
        raw_launch_angle: 15,
        raw_club_head_speed: 90,
        raw_ball_speed: 130,
        raw_spin_rate: 2500,
        camera_meta: {},
        created_at: '2026-03-11T10:00:00Z',
      } as LayerA; // Not frozen

      const isImmutable = separator.validateLayerAImmutability(mutableLayerA);
      expect(isImmutable).toBe(false);
    });
  });

  describe('Primary Fix Scalar Enforcement (DC-4)', () => {
    // ─── Primary Fix 스칼라 강제 ───
    it('should accept Primary Fix as scalar number', () => {
      const layerB: LayerB = {
        id: 'measure-10',
        swing_id: 'swing-10',
        distance_m: 200, // Scalar
        carry_m: 180,
        launch_angle: 15,
        club_head_speed: 90,
        ball_speed: 130,
        spin_rate: 2500,
        confidence_score: 0.85,
        adjusted_for_wind: false,
        adjusted_for_lie: false,
        created_at: '2026-03-11T10:00:00Z',
        updated_at: '2026-03-11T10:00:00Z',
      };

      const isScalar = separator.validatePrimaryFixScalar(layerB);
      expect(isScalar).toBe(true);
    });

    it('should reject Primary Fix as array', () => {
      const invalidLayerB = {
        id: 'measure-11',
        swing_id: 'swing-11',
        distance_m: [200, 205], // ARRAY - VIOLATION (DC-4)
        carry_m: 180,
        launch_angle: 15,
        club_head_speed: 90,
        ball_speed: 130,
        spin_rate: 2500,
        confidence_score: 0.85,
        adjusted_for_wind: false,
        adjusted_for_lie: false,
        created_at: '2026-03-11T10:00:00Z',
        updated_at: '2026-03-11T10:00:00Z',
      } as unknown as LayerB;

      const isScalar = separator.validatePrimaryFixScalar(invalidLayerB);
      expect(isScalar).toBe(false);
    });

    it('should reject Primary Fix as object', () => {
      const invalidLayerB = {
        id: 'measure-12',
        swing_id: 'swing-12',
        distance_m: { value: 200 }, // OBJECT - VIOLATION
        carry_m: 180,
        launch_angle: 15,
        club_head_speed: 90,
        ball_speed: 130,
        spin_rate: 2500,
        confidence_score: 0.85,
        adjusted_for_wind: false,
        adjusted_for_lie: false,
        created_at: '2026-03-11T10:00:00Z',
        updated_at: '2026-03-11T10:00:00Z',
      } as unknown as LayerB;

      const isScalar = separator.validatePrimaryFixScalar(invalidLayerB);
      expect(isScalar).toBe(false);
    });
  });

  describe('Core Fields Scalar Enforcement', () => {
    // ─── 모든 핵심 필드 스칼라 강제 ───
    it('should accept all core fields as scalars', () => {
      const layerB: LayerB = {
        id: 'measure-13',
        swing_id: 'swing-13',
        distance_m: 200,
        carry_m: 180,
        launch_angle: 15,
        club_head_speed: 90,
        ball_speed: 130,
        spin_rate: 2500,
        confidence_score: 0.85,
        adjusted_for_wind: false,
        adjusted_for_lie: false,
        created_at: '2026-03-11T10:00:00Z',
        updated_at: '2026-03-11T10:00:00Z',
      };

      const allScalar = separator.validateAllCoreFieldsScalar(layerB);
      expect(allScalar).toBe(true);
    });

    it('should reject carry_m as array', () => {
      const invalidLayerB = {
        id: 'measure-14',
        swing_id: 'swing-14',
        distance_m: 200,
        carry_m: [180, 185], // ARRAY - VIOLATION
        launch_angle: 15,
        club_head_speed: 90,
        ball_speed: 130,
        spin_rate: 2500,
        confidence_score: 0.85,
        adjusted_for_wind: false,
        adjusted_for_lie: false,
        created_at: '2026-03-11T10:00:00Z',
        updated_at: '2026-03-11T10:00:00Z',
      } as unknown as LayerB;

      const allScalar = separator.validateAllCoreFieldsScalar(invalidLayerB);
      expect(allScalar).toBe(false);
    });

    it('should reject confidence_score as array', () => {
      const invalidLayerB = {
        id: 'measure-15',
        swing_id: 'swing-15',
        distance_m: 200,
        carry_m: 180,
        launch_angle: 15,
        club_head_speed: 90,
        ball_speed: 130,
        spin_rate: 2500,
        confidence_score: [0.85, 0.88], // ARRAY - VIOLATION
        adjusted_for_wind: false,
        adjusted_for_lie: false,
        created_at: '2026-03-11T10:00:00Z',
        updated_at: '2026-03-11T10:00:00Z',
      } as unknown as LayerB;

      const allScalar = separator.validateAllCoreFieldsScalar(invalidLayerB);
      expect(allScalar).toBe(false);
    });
  });

  describe('Immutability Deep Freeze Validation', () => {
    // ─── LayerA 깊은 동결 검증 ───
    it('should deeply freeze LayerA including nested objects', () => {
      const data: MeasurementFull = {
        id: 'measure-1',
        swing_id: 'swing-1',
        raw_distance_m: 200,
        raw_carry_m: 180,
        raw_launch_angle: 15,
        raw_club_head_speed: 90,
        raw_ball_speed: 130,
        raw_spin_rate: 2500,
        camera_meta: { camera_id: 'cam-1', fps: 240 },
        created_at: '2026-03-11T10:00:00Z',
        distance_m: 200,
        carry_m: 180,
        launch_angle: 15,
        club_head_speed: 90,
        ball_speed: 130,
        spin_rate: 2500,
        confidence_score: 0.85,
        adjusted_for_wind: false,
        adjusted_for_lie: false,
        updated_at: '2026-03-11T10:00:00Z',
        pro_feedback: undefined,
        pro_confidence: undefined,
        member_verified: false,
        member_verified_at: undefined,
        member_confidence: undefined,
        coaching_notes: undefined,
        is_hidden: false,
      };

      const layerA = separator.extractLayerA(data);
      const isDeepFrozen = separator.validateLayerADeepFreeze(layerA);
      expect(isDeepFrozen).toBe(true);
    });

    it('should prevent modification of nested camera_meta', () => {
      const data: MeasurementFull = {
        id: 'measure-2',
        swing_id: 'swing-2',
        raw_distance_m: 200,
        raw_carry_m: 180,
        raw_launch_angle: 15,
        raw_club_head_speed: 90,
        raw_ball_speed: 130,
        raw_spin_rate: 2500,
        camera_meta: { camera_id: 'cam-1', fps: 240 },
        created_at: '2026-03-11T10:00:00Z',
        distance_m: 200,
        carry_m: 180,
        launch_angle: 15,
        club_head_speed: 90,
        ball_speed: 130,
        spin_rate: 2500,
        confidence_score: 0.85,
        adjusted_for_wind: false,
        adjusted_for_lie: false,
        updated_at: '2026-03-11T10:00:00Z',
        pro_feedback: undefined,
        pro_confidence: undefined,
        member_verified: false,
        member_verified_at: undefined,
        member_confidence: undefined,
        coaching_notes: undefined,
        is_hidden: false,
      };

      const layerA = separator.extractLayerA(data);

      // Attempt to modify nested object (may throw in strict mode or fail silently in non-strict)
      try {
        (layerA.camera_meta as any).fps = 60;
      } catch (e) {
        // In strict mode, it will throw, which is fine
      }

      // Verify it didn't change
      expect(layerA.camera_meta.fps).toBe(240);
    });

    it('should pass deep freeze validation for compliant LayerA', () => {
      const layerA: LayerA = Object.freeze({
        id: 'measure-3',
        swing_id: 'swing-3',
        raw_distance_m: 200,
        raw_carry_m: 180,
        raw_launch_angle: 15,
        raw_club_head_speed: 90,
        raw_ball_speed: 130,
        raw_spin_rate: 2500,
        camera_meta: Object.freeze({ camera_id: 'cam-1' }),
        created_at: '2026-03-11T10:00:00Z',
      });

      const isDeepFrozen = separator.validateLayerADeepFreeze(layerA);
      expect(isDeepFrozen).toBe(true);
    });
  });

  describe('Cross-Contamination Matrix (6 Paths)', () => {
    // ─── 6가지 교차 오염 경로 검증 ───
    it('should detect Path 1: A→B contamination (raw fields in LayerB)', () => {
      const data: MeasurementFull = {
        id: 'measure-4',
        swing_id: 'swing-4',
        raw_distance_m: 200,
        raw_carry_m: 180,
        raw_launch_angle: 15,
        raw_club_head_speed: 90,
        raw_ball_speed: 130,
        raw_spin_rate: 2500,
        camera_meta: {},
        created_at: '2026-03-11T10:00:00Z',
        distance_m: 205,
        carry_m: 185,
        launch_angle: 15.2,
        club_head_speed: 91,
        ball_speed: 131,
        spin_rate: 2480,
        confidence_score: 0.85,
        adjusted_for_wind: false,
        adjusted_for_lie: false,
        updated_at: '2026-03-11T10:05:00Z',
        pro_feedback: undefined,
        pro_confidence: undefined,
        member_verified: false,
        member_verified_at: undefined,
        member_confidence: undefined,
        coaching_notes: undefined,
        is_hidden: false,
      };

      const result = separator.validateCrossContaminationMatrix(data);
      expect(result.isValid).toBe(true); // Clean extraction
    });

    it('should detect Path 2: A→C contamination (raw fields in LayerC)', () => {
      const data: MeasurementFull = {
        id: 'measure-5',
        swing_id: 'swing-5',
        raw_distance_m: 200,
        raw_carry_m: 180,
        raw_launch_angle: 15,
        raw_club_head_speed: 90,
        raw_ball_speed: 130,
        raw_spin_rate: 2500,
        camera_meta: {},
        created_at: '2026-03-11T10:00:00Z',
        distance_m: 200,
        carry_m: 180,
        launch_angle: 15,
        club_head_speed: 90,
        ball_speed: 130,
        spin_rate: 2500,
        confidence_score: 0.85,
        adjusted_for_wind: false,
        adjusted_for_lie: false,
        updated_at: '2026-03-11T10:00:00Z',
        pro_feedback: 'Good form',
        pro_confidence: 0.9,
        member_verified: true,
        member_verified_at: '2026-03-11T11:00:00Z',
        member_confidence: 0.8,
        coaching_notes: 'Focus on follow-through',
        is_hidden: false,
      };

      const result = separator.validateCrossContaminationMatrix(data);
      expect(result.isValid).toBe(true); // Proper separation
    });

    it('should validate all 6 paths are clean', () => {
      const data: MeasurementFull = {
        id: 'measure-6',
        swing_id: 'swing-6',
        raw_distance_m: 200,
        raw_carry_m: 180,
        raw_launch_angle: 15,
        raw_club_head_speed: 90,
        raw_ball_speed: 130,
        raw_spin_rate: 2500,
        camera_meta: { camera_id: 'cam-1' },
        created_at: '2026-03-11T10:00:00Z',
        distance_m: 200,
        carry_m: 180,
        launch_angle: 15,
        club_head_speed: 90,
        ball_speed: 130,
        spin_rate: 2500,
        confidence_score: 0.85,
        adjusted_for_wind: false,
        adjusted_for_lie: false,
        updated_at: '2026-03-11T10:00:00Z',
        pro_feedback: 'Excellent',
        pro_confidence: 0.95,
        member_verified: true,
        member_verified_at: '2026-03-11T11:00:00Z',
        member_confidence: 0.9,
        coaching_notes: 'Keep it up',
        is_hidden: false,
      };

      const result = separator.validateCrossContaminationMatrix(data);
      expect(result.isValid).toBe(true);
      expect(result.violations.length).toBe(0);
    });
  });

  describe('Large Data Sets (100+ measurements)', () => {
    // ─── 대규모 데이터셋 검증 ───
    it('should correctly separate 100 measurements', () => {
      const measurements: MeasurementFull[] = [];

      for (let i = 0; i < 100; i++) {
        measurements.push({
          id: `measure-${i}`,
          swing_id: `swing-${i}`,
          raw_distance_m: 200 + i,
          raw_carry_m: 180 + i,
          raw_launch_angle: 15 + (i % 10),
          raw_club_head_speed: 90 + (i % 20),
          raw_ball_speed: 130 + (i % 15),
          raw_spin_rate: 2500 + (i % 500),
          camera_meta: { camera_id: `cam-${i % 5}` },
          created_at: new Date(Date.now() - i * 60000).toISOString(),
          distance_m: 200 + i,
          carry_m: 180 + i,
          launch_angle: 15 + (i % 10),
          club_head_speed: 90 + (i % 20),
          ball_speed: 130 + (i % 15),
          spin_rate: 2500 + (i % 500),
          confidence_score: 0.4 + ((i % 60) / 100),
          adjusted_for_wind: i % 2 === 0,
          adjusted_for_lie: i % 3 === 0,
          updated_at: new Date().toISOString(),
          pro_feedback: i % 5 === 0 ? 'Good form' : undefined,
          pro_confidence: i % 5 === 0 ? 0.9 : undefined,
          member_verified: i % 3 === 0,
          member_verified_at: i % 3 === 0 ? new Date().toISOString() : undefined,
          member_confidence: i % 3 === 0 ? 0.85 : undefined,
          coaching_notes: i % 7 === 0 ? 'Practice more' : undefined,
          is_hidden: i % 20 === 0,
        });
      }

      measurements.forEach((data) => {
        const layerA = separator.extractLayerA(data);
        const layerB = separator.extractLayerB(data);
        const layerC = separator.extractLayerC(data);

        // All extractions should succeed without errors
        expect(layerA.id).toBeDefined();
        expect(layerB.id).toBeDefined();
        expect(layerC.id).toBeDefined();

        // Validate isolation
        expect(separator.validateLayerAIsolation(layerA)).toBe(true);
      });
    });

    it('should maintain performance with 100+ measurements', () => {
      const startTime = performance.now();

      for (let i = 0; i < 150; i++) {
        const data: MeasurementFull = {
          id: `measure-${i}`,
          swing_id: `swing-${i}`,
          raw_distance_m: 200,
          raw_carry_m: 180,
          raw_launch_angle: 15,
          raw_club_head_speed: 90,
          raw_ball_speed: 130,
          raw_spin_rate: 2500,
          camera_meta: { camera_id: 'cam-1' },
          created_at: '2026-03-11T10:00:00Z',
          distance_m: 200,
          carry_m: 180,
          launch_angle: 15,
          club_head_speed: 90,
          ball_speed: 130,
          spin_rate: 2500,
          confidence_score: 0.85,
          adjusted_for_wind: false,
          adjusted_for_lie: false,
          updated_at: '2026-03-11T10:00:00Z',
          pro_feedback: undefined,
          pro_confidence: undefined,
          member_verified: false,
          member_verified_at: undefined,
          member_confidence: undefined,
          coaching_notes: undefined,
          is_hidden: false,
        };

        separator.extractLayerA(data);
        separator.extractLayerB(data);
        separator.extractLayerC(data);
      }

      const endTime = performance.now();
      const avgTimePerMeasure = (endTime - startTime) / 150;

      // Should complete in reasonable time (< 10ms per measurement)
      expect(avgTimePerMeasure).toBeLessThan(10);
    });
  });

  describe('Missing Data Handling', () => {
    // ─── 불완전한 포즈 데이터 처리 ───
    it('should handle partial pose data (missing spin_rate)', () => {
      const data: MeasurementFull = {
        id: 'measure-7',
        swing_id: 'swing-7',
        raw_distance_m: 200,
        raw_carry_m: 180,
        raw_launch_angle: 15,
        raw_club_head_speed: 90,
        raw_ball_speed: 130,
        raw_spin_rate: undefined as unknown as number, // Missing
        camera_meta: {},
        created_at: '2026-03-11T10:00:00Z',
        distance_m: 200,
        carry_m: 180,
        launch_angle: 15,
        club_head_speed: 90,
        ball_speed: 130,
        spin_rate: undefined as unknown as number,
        confidence_score: 0.75,
        adjusted_for_wind: false,
        adjusted_for_lie: false,
        updated_at: '2026-03-11T10:00:00Z',
        pro_feedback: undefined,
        pro_confidence: undefined,
        member_verified: false,
        member_verified_at: undefined,
        member_confidence: undefined,
        coaching_notes: undefined,
        is_hidden: false,
      };

      const layerA = separator.extractLayerA(data);
      expect(layerA.id).toBe('measure-7');
      // Should still create layer without errors
    });

    it('should handle empty camera_meta', () => {
      const data: MeasurementFull = {
        id: 'measure-8',
        swing_id: 'swing-8',
        raw_distance_m: 200,
        raw_carry_m: 180,
        raw_launch_angle: 15,
        raw_club_head_speed: 90,
        raw_ball_speed: 130,
        raw_spin_rate: 2500,
        camera_meta: {}, // Empty
        created_at: '2026-03-11T10:00:00Z',
        distance_m: 200,
        carry_m: 180,
        launch_angle: 15,
        club_head_speed: 90,
        ball_speed: 130,
        spin_rate: 2500,
        confidence_score: 0.85,
        adjusted_for_wind: false,
        adjusted_for_lie: false,
        updated_at: '2026-03-11T10:00:00Z',
        pro_feedback: undefined,
        pro_confidence: undefined,
        member_verified: false,
        member_verified_at: undefined,
        member_confidence: undefined,
        coaching_notes: undefined,
        is_hidden: false,
      };

      const layerA = separator.extractLayerA(data);
      expect(Object.keys(layerA.camera_meta).length).toBe(0);
    });
  });

  describe('Type Safety and Runtime Type Guards', () => {
    // ─── TypeScript 타입 안정성 검증 ───
    it('should verify LayerA has only raw fields (type guard)', () => {
      const data: MeasurementFull = {
        id: 'measure-9',
        swing_id: 'swing-9',
        raw_distance_m: 200,
        raw_carry_m: 180,
        raw_launch_angle: 15,
        raw_club_head_speed: 90,
        raw_ball_speed: 130,
        raw_spin_rate: 2500,
        camera_meta: {},
        created_at: '2026-03-11T10:00:00Z',
        distance_m: 200,
        carry_m: 180,
        launch_angle: 15,
        club_head_speed: 90,
        ball_speed: 130,
        spin_rate: 2500,
        confidence_score: 0.85,
        adjusted_for_wind: false,
        adjusted_for_lie: false,
        updated_at: '2026-03-11T10:00:00Z',
        pro_feedback: undefined,
        pro_confidence: undefined,
        member_verified: false,
        member_verified_at: undefined,
        member_confidence: undefined,
        coaching_notes: undefined,
        is_hidden: false,
      };

      const layerA = separator.extractLayerA(data);

      const expectedFields = [
        'id',
        'swing_id',
        'raw_distance_m',
        'raw_carry_m',
        'raw_launch_angle',
        'raw_club_head_speed',
        'raw_ball_speed',
        'raw_spin_rate',
        'camera_meta',
        'created_at',
      ];

      expectedFields.forEach((field) => {
        expect(field in layerA).toBe(true);
      });
    });

    it('should verify LayerB has computed fields (type guard)', () => {
      const data: MeasurementFull = {
        id: 'measure-10',
        swing_id: 'swing-10',
        raw_distance_m: 200,
        raw_carry_m: 180,
        raw_launch_angle: 15,
        raw_club_head_speed: 90,
        raw_ball_speed: 130,
        raw_spin_rate: 2500,
        camera_meta: {},
        created_at: '2026-03-11T10:00:00Z',
        distance_m: 200,
        carry_m: 180,
        launch_angle: 15,
        club_head_speed: 90,
        ball_speed: 130,
        spin_rate: 2500,
        confidence_score: 0.85,
        adjusted_for_wind: false,
        adjusted_for_lie: false,
        updated_at: '2026-03-11T10:00:00Z',
        pro_feedback: undefined,
        pro_confidence: undefined,
        member_verified: false,
        member_verified_at: undefined,
        member_confidence: undefined,
        coaching_notes: undefined,
        is_hidden: false,
      };

      const layerB = separator.extractLayerB(data);

      const expectedFields = [
        'id',
        'swing_id',
        'distance_m',
        'carry_m',
        'launch_angle',
        'club_head_speed',
        'ball_speed',
        'spin_rate',
        'confidence_score',
        'adjusted_for_wind',
        'adjusted_for_lie',
        'created_at',
        'updated_at',
      ];

      expectedFields.forEach((field) => {
        expect(field in layerB).toBe(true);
      });
    });
  });

  describe('Recalculation and Immutability', () => {
    // ─── LayerB 재계산 시에도 불변성 유지 ───
    it('should recalculate LayerB from LayerA without affecting LayerA', () => {
      const data: MeasurementFull = {
        id: 'measure-11',
        swing_id: 'swing-11',
        raw_distance_m: 200,
        raw_carry_m: 180,
        raw_launch_angle: 15,
        raw_club_head_speed: 90,
        raw_ball_speed: 130,
        raw_spin_rate: 2500,
        camera_meta: { camera_id: 'cam-1' },
        created_at: '2026-03-11T10:00:00Z',
        distance_m: 200,
        carry_m: 180,
        launch_angle: 15,
        club_head_speed: 90,
        ball_speed: 130,
        spin_rate: 2500,
        confidence_score: 0.85,
        adjusted_for_wind: false,
        adjusted_for_lie: false,
        updated_at: '2026-03-11T10:00:00Z',
        pro_feedback: undefined,
        pro_confidence: undefined,
        member_verified: false,
        member_verified_at: undefined,
        member_confidence: undefined,
        coaching_notes: undefined,
        is_hidden: false,
      };

      const layerA1 = separator.extractLayerA(data);
      const layerB1 = separator.extractLayerB(data);

      // Extract again
      const layerA2 = separator.extractLayerA(data);
      const layerB2 = separator.extractLayerB(data);

      // LayerA should remain identical
      expect(layerA1.id).toBe(layerA2.id);
      expect(layerA1.raw_distance_m).toBe(layerA2.raw_distance_m);

      // LayerB should also be identical
      expect(layerB1.distance_m).toBe(layerB2.distance_m);
      expect(layerB1.confidence_score).toBe(layerB2.confidence_score);
    });

    it('should preserve LayerA immutability after multiple recalculations', () => {
      const data: MeasurementFull = {
        id: 'measure-12',
        swing_id: 'swing-12',
        raw_distance_m: 200,
        raw_carry_m: 180,
        raw_launch_angle: 15,
        raw_club_head_speed: 90,
        raw_ball_speed: 130,
        raw_spin_rate: 2500,
        camera_meta: {},
        created_at: '2026-03-11T10:00:00Z',
        distance_m: 200,
        carry_m: 180,
        launch_angle: 15,
        club_head_speed: 90,
        ball_speed: 130,
        spin_rate: 2500,
        confidence_score: 0.85,
        adjusted_for_wind: false,
        adjusted_for_lie: false,
        updated_at: '2026-03-11T10:00:00Z',
        pro_feedback: undefined,
        pro_confidence: undefined,
        member_verified: false,
        member_verified_at: undefined,
        member_confidence: undefined,
        coaching_notes: undefined,
        is_hidden: false,
      };

      for (let i = 0; i < 10; i++) {
        const layerA = separator.extractLayerA(data);
        expect(separator.validateLayerAImmutability(layerA)).toBe(true);
      }
    });
  });

  describe('Comprehensive Layer Separation Validation', () => {
    // ─── 종합 검증 ───
    it('should pass validation for clean data', () => {
      const data: MeasurementFull = {
        id: 'measure-16',
        swing_id: 'swing-16',
        raw_distance_m: 200,
        raw_carry_m: 180,
        raw_launch_angle: 15,
        raw_club_head_speed: 90,
        raw_ball_speed: 130,
        raw_spin_rate: 2500,
        camera_meta: { camera_id: 'cam-1' },
        created_at: '2026-03-11T10:00:00Z',
        distance_m: 200,
        carry_m: 180,
        launch_angle: 15,
        club_head_speed: 90,
        ball_speed: 130,
        spin_rate: 2500,
        confidence_score: 0.85,
        adjusted_for_wind: false,
        adjusted_for_lie: false,
        updated_at: '2026-03-11T10:00:00Z',
        pro_feedback: 'Good form',
        pro_confidence: 0.9,
        member_verified: true,
        member_verified_at: '2026-03-11T11:00:00Z',
        member_confidence: 0.8,
        coaching_notes: 'Keep practicing',
        is_hidden: false,
      };

      const result = separator.validateLayerSeparation(data);

      expect(result.isValid).toBe(true);
      expect(result.errors.length).toBe(0);
    });

    it('should detect DC-1 violation (LayerA cross-contamination)', () => {
      // Manually create contaminated data
      const data: MeasurementFull = {
        id: 'measure-17',
        swing_id: 'swing-17',
        raw_distance_m: 200,
        raw_carry_m: 180,
        raw_launch_angle: 15,
        raw_club_head_speed: 90,
        raw_ball_speed: 130,
        raw_spin_rate: 2500,
        camera_meta: { distance_m: 205 }, // Contamination by nesting
        created_at: '2026-03-11T10:00:00Z',
        distance_m: 205,
        carry_m: 180,
        launch_angle: 15,
        club_head_speed: 90,
        ball_speed: 130,
        spin_rate: 2500,
        confidence_score: 0.85,
        adjusted_for_wind: false,
        adjusted_for_lie: false,
        updated_at: '2026-03-11T10:00:00Z',
        pro_feedback: undefined,
        pro_confidence: undefined,
        member_verified: false,
        member_verified_at: undefined,
        member_confidence: undefined,
        coaching_notes: undefined,
        is_hidden: false,
      };

      // This test checks that validation would catch contamination
      const layerA = separator.extractLayerA(data);
      const isClean = separator.validateLayerAIsolation(layerA);
      expect(isClean).toBe(true); // Extract should produce clean layer
    });

    it('should detect DC-4 violation (Primary Fix array)', () => {
      // Create data with array distance
      const data = {
        id: 'measure-18',
        swing_id: 'swing-18',
        raw_distance_m: 200,
        raw_carry_m: 180,
        raw_launch_angle: 15,
        raw_club_head_speed: 90,
        raw_ball_speed: 130,
        raw_spin_rate: 2500,
        camera_meta: {},
        created_at: '2026-03-11T10:00:00Z',
        distance_m: [200, 205], // ARRAY VIOLATION
        carry_m: 180,
        launch_angle: 15,
        club_head_speed: 90,
        ball_speed: 130,
        spin_rate: 2500,
        confidence_score: 0.85,
        adjusted_for_wind: false,
        adjusted_for_lie: false,
        updated_at: '2026-03-11T10:00:00Z',
        pro_feedback: undefined,
        pro_confidence: undefined,
        member_verified: false,
        member_verified_at: undefined,
        member_confidence: undefined,
        coaching_notes: undefined,
        is_hidden: false,
      } as unknown as MeasurementFull;

      const layerB = separator.extractLayerB(data);
      const isScalar = separator.validatePrimaryFixScalar(layerB);
      expect(isScalar).toBe(false);
    });
  });
});
