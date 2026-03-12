/**
 * Unit Tests: Edit Delta Computation
 *
 * 편집 델타(변경 사항) 계산 검증
 * - 단순 필드 변경
 * - 복수 필드 변경
 * - 변경 없음
 * - 중첩된 객체 변경
 * - data_quality_tier 결정 로직
 *
 * @feature F-018
 * @patent Patent 1
 * @requirement Patent 1 Claim 3
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// ─── Type Definitions ────────────────────────────────────────────

type DataQualityTier = 'tier_1' | 'tier_2' | 'tier_3';

interface EditDelta {
  changedFields: string[];
  oldValues: Record<string, unknown>;
  newValues: Record<string, unknown>;
  dataQualityTier: DataQualityTier;
  hasChanges: boolean;
}

interface MeasurementRecord {
  id: string;
  swing_id: string;
  distance_m?: number;
  carry_m?: number;
  launch_angle?: number;
  club_head_speed?: number;
  ball_speed?: number;
  spin_rate?: number;
  meta_data?: Record<string, unknown>;
  confidence_score?: number;
  state?: string;
  created_at?: string;
  updated_at?: string;
  [key: string]: unknown;
}

// ─── Edit Delta Computer Implementation (mock) ──────────────────

class EditDeltaComputer {
  /**
   * 원본과 수정본 간의 델타를 계산합니다.
   * Patent 1 Claim 3의 변경 사항 추적
   */
  computeDelta(
    original: MeasurementRecord,
    edited: MeasurementRecord
  ): EditDelta {
    const changedFields: string[] = [];
    const oldValues: Record<string, unknown> = {};
    const newValues: Record<string, unknown> = {};

    // 모든 필드 비교
    const allKeys = new Set([...Object.keys(original), ...Object.keys(edited)]);

    for (const key of allKeys) {
      const originalValue = original[key];
      const editedValue = edited[key];

      // 깊은 비교 (nested objects)
      if (!this.deepEqual(originalValue, editedValue)) {
        changedFields.push(key);
        oldValues[key] = originalValue;
        newValues[key] = editedValue;
      }
    }

    const hasChanges = changedFields.length > 0;

    // data_quality_tier 결정
    const dataQualityTier = this.determineDataQualityTier(
      changedFields,
      original,
      edited
    );

    return {
      changedFields,
      oldValues,
      newValues,
      dataQualityTier,
      hasChanges,
    };
  }

  /**
   * 변경된 필드 목록을 기반으로 data_quality_tier를 결정합니다.
   *
   * tier_1: 핵심 측정값 변경 (distance_m, carry_m, launch_angle, club_head_speed 등)
   * tier_2: 신뢰도 또는 메타데이터 변경
   * tier_3: 상태 또는 타임스탬프만 변경
   */
  private determineDataQualityTier(
    changedFields: string[],
    original: MeasurementRecord,
    edited: MeasurementRecord
  ): DataQualityTier {
    if (changedFields.length === 0) {
      return 'tier_3'; // No changes
    }

    const coreFields = [
      'distance_m',
      'carry_m',
      'launch_angle',
      'club_head_speed',
      'ball_speed',
      'spin_rate',
    ];

    const hasCoreFieldChange = changedFields.some((field) =>
      coreFields.includes(field)
    );

    if (hasCoreFieldChange) {
      return 'tier_1'; // Core measurement changed
    }

    const confidenceRelatedFields = ['confidence_score', 'meta_data'];
    const hasConfidenceChange = changedFields.some((field) =>
      confidenceRelatedFields.includes(field)
    );

    if (hasConfidenceChange) {
      return 'tier_2'; // Confidence or metadata changed
    }

    return 'tier_3'; // Only state or timestamps changed
  }

  /**
   * 깊은 동등성 비교 (nested objects 지원).
   */
  private deepEqual(a: unknown, b: unknown): boolean {
    if (a === b) return true;

    if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) {
      return false;
    }

    const keysA = Object.keys(a);
    const keysB = Object.keys(b);

    if (keysA.length !== keysB.length) {
      return false;
    }

    for (const key of keysA) {
      const objA = a as Record<string, unknown>;
      const objB = b as Record<string, unknown>;

      if (!this.deepEqual(objA[key], objB[key])) {
        return false;
      }
    }

    return true;
  }

  /**
   * 델타가 비어 있는지 확인합니다.
   */
  isEmpty(delta: EditDelta): boolean {
    return !delta.hasChanges && delta.changedFields.length === 0;
  }

  /**
   * 특정 필드가 변경되었는지 확인합니다.
   */
  isFieldChanged(delta: EditDelta, fieldName: string): boolean {
    return delta.changedFields.includes(fieldName);
  }
}

// ─── Tests ──────────────────────────────────────────────────────

describe('Edit Delta Computation (Patent 1 Claim 3)', () => {
  let computer: EditDeltaComputer;

  beforeEach(() => {
    computer = new EditDeltaComputer();
  });

  describe('Simple Field Change', () => {
    // ─── 단순 필드 변경 ───
    it('should detect single field change: distance_m', () => {
      const original: MeasurementRecord = {
        id: 'measure-1',
        swing_id: 'swing-1',
        distance_m: 200,
      };

      const edited: MeasurementRecord = {
        id: 'measure-1',
        swing_id: 'swing-1',
        distance_m: 215,
      };

      const delta = computer.computeDelta(original, edited);

      expect(delta.hasChanges).toBe(true);
      expect(delta.changedFields).toEqual(['distance_m']);
      expect(delta.oldValues.distance_m).toBe(200);
      expect(delta.newValues.distance_m).toBe(215);
    });

    it('should detect single field change: carry_m', () => {
      const original: MeasurementRecord = {
        id: 'measure-2',
        swing_id: 'swing-2',
        carry_m: 180,
      };

      const edited: MeasurementRecord = {
        id: 'measure-2',
        swing_id: 'swing-2',
        carry_m: 185,
      };

      const delta = computer.computeDelta(original, edited);

      expect(delta.hasChanges).toBe(true);
      expect(delta.changedFields).toContain('carry_m');
    });

    it('should detect single field change: launch_angle', () => {
      const original: MeasurementRecord = {
        id: 'measure-3',
        swing_id: 'swing-3',
        launch_angle: 15,
      };

      const edited: MeasurementRecord = {
        id: 'measure-3',
        swing_id: 'swing-3',
        launch_angle: 16.5,
      };

      const delta = computer.computeDelta(original, edited);

      expect(delta.hasChanges).toBe(true);
      expect(delta.changedFields).toContain('launch_angle');
    });

    it('should detect single field change: confidence_score', () => {
      const original: MeasurementRecord = {
        id: 'measure-4',
        swing_id: 'swing-4',
        confidence_score: 0.65,
      };

      const edited: MeasurementRecord = {
        id: 'measure-4',
        swing_id: 'swing-4',
        confidence_score: 0.75,
      };

      const delta = computer.computeDelta(original, edited);

      expect(delta.hasChanges).toBe(true);
      expect(delta.changedFields).toContain('confidence_score');
    });
  });

  describe('Multiple Field Changes', () => {
    // ─── 복수 필드 변경 ───
    it('should detect 2 field changes', () => {
      const original: MeasurementRecord = {
        id: 'measure-5',
        swing_id: 'swing-5',
        distance_m: 200,
        carry_m: 180,
      };

      const edited: MeasurementRecord = {
        id: 'measure-5',
        swing_id: 'swing-5',
        distance_m: 210,
        carry_m: 190,
      };

      const delta = computer.computeDelta(original, edited);

      expect(delta.hasChanges).toBe(true);
      expect(delta.changedFields.length).toBe(2);
      expect(delta.changedFields).toContain('distance_m');
      expect(delta.changedFields).toContain('carry_m');
    });

    it('should detect 3+ field changes', () => {
      const original: MeasurementRecord = {
        id: 'measure-6',
        swing_id: 'swing-6',
        distance_m: 200,
        carry_m: 180,
        launch_angle: 15,
        club_head_speed: 90,
      };

      const edited: MeasurementRecord = {
        id: 'measure-6',
        swing_id: 'swing-6',
        distance_m: 210,
        carry_m: 190,
        launch_angle: 16,
        club_head_speed: 92,
      };

      const delta = computer.computeDelta(original, edited);

      expect(delta.hasChanges).toBe(true);
      expect(delta.changedFields.length).toBe(4);
      expect(delta.changedFields).toContain('distance_m');
      expect(delta.changedFields).toContain('carry_m');
      expect(delta.changedFields).toContain('launch_angle');
      expect(delta.changedFields).toContain('club_head_speed');
    });

    it('should track old and new values for all changed fields', () => {
      const original: MeasurementRecord = {
        id: 'measure-7',
        swing_id: 'swing-7',
        distance_m: 200,
        carry_m: 180,
        launch_angle: 15,
      };

      const edited: MeasurementRecord = {
        id: 'measure-7',
        swing_id: 'swing-7',
        distance_m: 215,
        carry_m: 195,
        launch_angle: 17,
      };

      const delta = computer.computeDelta(original, edited);

      expect(delta.oldValues).toEqual({
        distance_m: 200,
        carry_m: 180,
        launch_angle: 15,
      });

      expect(delta.newValues).toEqual({
        distance_m: 215,
        carry_m: 195,
        launch_angle: 17,
      });
    });
  });

  describe('No Changes', () => {
    // ─── 변경 없음 ───
    it('should return empty delta when original = edited', () => {
      const original: MeasurementRecord = {
        id: 'measure-8',
        swing_id: 'swing-8',
        distance_m: 200,
        carry_m: 180,
        launch_angle: 15,
      };

      const edited: MeasurementRecord = {
        id: 'measure-8',
        swing_id: 'swing-8',
        distance_m: 200,
        carry_m: 180,
        launch_angle: 15,
      };

      const delta = computer.computeDelta(original, edited);

      expect(delta.hasChanges).toBe(false);
      expect(delta.changedFields.length).toBe(0);
      expect(computer.isEmpty(delta)).toBe(true);
    });

    it('should handle identical complex records', () => {
      const original: MeasurementRecord = {
        id: 'measure-9',
        swing_id: 'swing-9',
        distance_m: 200,
        carry_m: 180,
        meta_data: {
          camera_id: 'cam-1',
          timestamp: 1234567890,
        },
      };

      const edited: MeasurementRecord = {
        id: 'measure-9',
        swing_id: 'swing-9',
        distance_m: 200,
        carry_m: 180,
        meta_data: {
          camera_id: 'cam-1',
          timestamp: 1234567890,
        },
      };

      const delta = computer.computeDelta(original, edited);

      expect(delta.hasChanges).toBe(false);
      expect(delta.changedFields.length).toBe(0);
    });
  });

  describe('Nested Object Changes', () => {
    // ─── 중첩된 객체 변경 ───
    it('should detect nested object change in meta_data', () => {
      const original: MeasurementRecord = {
        id: 'measure-10',
        swing_id: 'swing-10',
        meta_data: {
          camera_id: 'cam-1',
          angle: 45,
        },
      };

      const edited: MeasurementRecord = {
        id: 'measure-10',
        swing_id: 'swing-10',
        meta_data: {
          camera_id: 'cam-1',
          angle: 50,
        },
      };

      const delta = computer.computeDelta(original, edited);

      expect(delta.hasChanges).toBe(true);
      expect(delta.changedFields).toContain('meta_data');
    });

    it('should detect nested object field addition', () => {
      const original: MeasurementRecord = {
        id: 'measure-11',
        swing_id: 'swing-11',
        meta_data: {
          camera_id: 'cam-1',
        },
      };

      const edited: MeasurementRecord = {
        id: 'measure-11',
        swing_id: 'swing-11',
        meta_data: {
          camera_id: 'cam-1',
          angle: 45,
        },
      };

      const delta = computer.computeDelta(original, edited);

      expect(delta.hasChanges).toBe(true);
      expect(delta.changedFields).toContain('meta_data');
    });

    it('should detect nested object field removal', () => {
      const original: MeasurementRecord = {
        id: 'measure-12',
        swing_id: 'swing-12',
        meta_data: {
          camera_id: 'cam-1',
          angle: 45,
          frame_rate: 240,
        },
      };

      const edited: MeasurementRecord = {
        id: 'measure-12',
        swing_id: 'swing-12',
        meta_data: {
          camera_id: 'cam-1',
          angle: 45,
        },
      };

      const delta = computer.computeDelta(original, edited);

      expect(delta.hasChanges).toBe(true);
      expect(delta.changedFields).toContain('meta_data');
    });

    it('should detect deeply nested changes', () => {
      const original: MeasurementRecord = {
        id: 'measure-13',
        swing_id: 'swing-13',
        meta_data: {
          sensor: {
            calibration: {
              offset: 0.1,
            },
          },
        },
      };

      const edited: MeasurementRecord = {
        id: 'measure-13',
        swing_id: 'swing-13',
        meta_data: {
          sensor: {
            calibration: {
              offset: 0.15,
            },
          },
        },
      };

      const delta = computer.computeDelta(original, edited);

      expect(delta.hasChanges).toBe(true);
      expect(delta.changedFields).toContain('meta_data');
    });
  });

  describe('data_quality_tier Determination', () => {
    // ─── data_quality_tier 결정 로직 ───
    it('should assign tier_1 when core measurement fields change', () => {
      const original: MeasurementRecord = {
        id: 'measure-14',
        swing_id: 'swing-14',
        distance_m: 200,
      };

      const edited: MeasurementRecord = {
        id: 'measure-14',
        swing_id: 'swing-14',
        distance_m: 215,
      };

      const delta = computer.computeDelta(original, edited);

      expect(delta.dataQualityTier).toBe('tier_1');
    });

    it('should assign tier_1 for carry_m change', () => {
      const original: MeasurementRecord = {
        id: 'measure-15',
        swing_id: 'swing-15',
        carry_m: 180,
      };

      const edited: MeasurementRecord = {
        id: 'measure-15',
        swing_id: 'swing-15',
        carry_m: 195,
      };

      const delta = computer.computeDelta(original, edited);

      expect(delta.dataQualityTier).toBe('tier_1');
    });

    it('should assign tier_1 for launch_angle change', () => {
      const original: MeasurementRecord = {
        id: 'measure-16',
        swing_id: 'swing-16',
        launch_angle: 15,
      };

      const edited: MeasurementRecord = {
        id: 'measure-16',
        swing_id: 'swing-16',
        launch_angle: 16.5,
      };

      const delta = computer.computeDelta(original, edited);

      expect(delta.dataQualityTier).toBe('tier_1');
    });

    it('should assign tier_1 for club_head_speed change', () => {
      const original: MeasurementRecord = {
        id: 'measure-17',
        swing_id: 'swing-17',
        club_head_speed: 90,
      };

      const edited: MeasurementRecord = {
        id: 'measure-17',
        swing_id: 'swing-17',
        club_head_speed: 95,
      };

      const delta = computer.computeDelta(original, edited);

      expect(delta.dataQualityTier).toBe('tier_1');
    });

    it('should assign tier_2 when confidence_score changes', () => {
      const original: MeasurementRecord = {
        id: 'measure-18',
        swing_id: 'swing-18',
        confidence_score: 0.65,
      };

      const edited: MeasurementRecord = {
        id: 'measure-18',
        swing_id: 'swing-18',
        confidence_score: 0.80,
      };

      const delta = computer.computeDelta(original, edited);

      expect(delta.dataQualityTier).toBe('tier_2');
    });

    it('should assign tier_2 when meta_data changes', () => {
      const original: MeasurementRecord = {
        id: 'measure-19',
        swing_id: 'swing-19',
        meta_data: { camera_id: 'cam-1' },
      };

      const edited: MeasurementRecord = {
        id: 'measure-19',
        swing_id: 'swing-19',
        meta_data: { camera_id: 'cam-2' },
      };

      const delta = computer.computeDelta(original, edited);

      expect(delta.dataQualityTier).toBe('tier_2');
    });

    it('should assign tier_3 when only state changes', () => {
      const original: MeasurementRecord = {
        id: 'measure-20',
        swing_id: 'swing-20',
        state: 'pending',
      };

      const edited: MeasurementRecord = {
        id: 'measure-20',
        swing_id: 'swing-20',
        state: 'confirmed',
      };

      const delta = computer.computeDelta(original, edited);

      expect(delta.dataQualityTier).toBe('tier_3');
    });

    it('should assign tier_3 when only timestamps change', () => {
      const original: MeasurementRecord = {
        id: 'measure-21',
        swing_id: 'swing-21',
        created_at: '2026-03-10T10:00:00Z',
        updated_at: '2026-03-10T10:00:00Z',
      };

      const edited: MeasurementRecord = {
        id: 'measure-21',
        swing_id: 'swing-21',
        created_at: '2026-03-10T10:00:00Z',
        updated_at: '2026-03-11T15:30:00Z',
      };

      const delta = computer.computeDelta(original, edited);

      expect(delta.dataQualityTier).toBe('tier_3');
    });

    it('should assign tier_1 when core field changes (overrides tier_2 or tier_3)', () => {
      const original: MeasurementRecord = {
        id: 'measure-22',
        swing_id: 'swing-22',
        distance_m: 200,
        confidence_score: 0.65,
        state: 'pending',
      };

      const edited: MeasurementRecord = {
        id: 'measure-22',
        swing_id: 'swing-22',
        distance_m: 215, // Core field changed
        confidence_score: 0.75,
        state: 'confirmed',
      };

      const delta = computer.computeDelta(original, edited);

      expect(delta.dataQualityTier).toBe('tier_1');
    });

    it('should assign tier_2 when confidence changes but no core field change', () => {
      const original: MeasurementRecord = {
        id: 'measure-23',
        swing_id: 'swing-23',
        distance_m: 200,
        confidence_score: 0.65,
        state: 'pending',
      };

      const edited: MeasurementRecord = {
        id: 'measure-23',
        swing_id: 'swing-23',
        distance_m: 200, // No core field change
        confidence_score: 0.75, // Confidence changed
        state: 'confirmed',
      };

      const delta = computer.computeDelta(original, edited);

      expect(delta.dataQualityTier).toBe('tier_2');
    });

    it('should assign tier_3 when no changes', () => {
      const original: MeasurementRecord = {
        id: 'measure-24',
        swing_id: 'swing-24',
        distance_m: 200,
      };

      const edited: MeasurementRecord = {
        id: 'measure-24',
        swing_id: 'swing-24',
        distance_m: 200,
      };

      const delta = computer.computeDelta(original, edited);

      expect(delta.dataQualityTier).toBe('tier_3');
    });
  });

  describe('Helper Methods', () => {
    // ─── 헬퍼 메서드 ───
    it('should correctly identify if field changed', () => {
      const original: MeasurementRecord = {
        id: 'measure-25',
        swing_id: 'swing-25',
        distance_m: 200,
        carry_m: 180,
      };

      const edited: MeasurementRecord = {
        id: 'measure-25',
        swing_id: 'swing-25',
        distance_m: 215,
        carry_m: 180,
      };

      const delta = computer.computeDelta(original, edited);

      expect(computer.isFieldChanged(delta, 'distance_m')).toBe(true);
      expect(computer.isFieldChanged(delta, 'carry_m')).toBe(false);
    });

    it('should correctly identify empty delta', () => {
      const original: MeasurementRecord = {
        id: 'measure-26',
        swing_id: 'swing-26',
        distance_m: 200,
      };

      const edited: MeasurementRecord = {
        id: 'measure-26',
        swing_id: 'swing-26',
        distance_m: 200,
      };

      const delta = computer.computeDelta(original, edited);

      expect(computer.isEmpty(delta)).toBe(true);
    });
  });

  describe('Deeply Nested Changes (3+ levels)', () => {
    // ─── 3단계 이상 중첩된 변경 ───
    it('should detect changes in 3-level nested objects', () => {
      const original: MeasurementRecord = {
        id: 'measure-27',
        swing_id: 'swing-27',
        meta_data: {
          camera: {
            sensor: {
              calibration: 0.1,
            },
          },
        },
      };

      const edited: MeasurementRecord = {
        id: 'measure-27',
        swing_id: 'swing-27',
        meta_data: {
          camera: {
            sensor: {
              calibration: 0.15,
            },
          },
        },
      };

      const delta = computer.computeDelta(original, edited);

      expect(delta.hasChanges).toBe(true);
      expect(delta.changedFields).toContain('meta_data');
    });

    it('should detect changes in deeply nested arrays within objects', () => {
      const original: MeasurementRecord = {
        id: 'measure-28',
        swing_id: 'swing-28',
        meta_data: {
          measurements: {
            values: [1, 2, 3],
          },
        },
      };

      const edited: MeasurementRecord = {
        id: 'measure-28',
        swing_id: 'swing-28',
        meta_data: {
          measurements: {
            values: [1, 2, 4],
          },
        },
      };

      const delta = computer.computeDelta(original, edited);

      expect(delta.hasChanges).toBe(true);
      expect(delta.changedFields).toContain('meta_data');
    });

    it('should detect addition of new nested field at 3+ levels', () => {
      const original: MeasurementRecord = {
        id: 'measure-29',
        swing_id: 'swing-29',
        meta_data: {
          camera: {
            sensor: {
              calibration: 0.1,
            },
          },
        },
      };

      const edited: MeasurementRecord = {
        id: 'measure-29',
        swing_id: 'swing-29',
        meta_data: {
          camera: {
            sensor: {
              calibration: 0.1,
              offset: 0.05,
            },
          },
        },
      };

      const delta = computer.computeDelta(original, edited);

      expect(delta.hasChanges).toBe(true);
      expect(delta.changedFields).toContain('meta_data');
    });
  });

  describe('Array Value Changes', () => {
    // ─── 배열 값 변경: 추가, 제거, 재정렬 ───
    it('should detect array element addition', () => {
      const original: MeasurementRecord = {
        id: 'measure-30',
        swing_id: 'swing-30',
        meta_data: {
          values: [1, 2, 3],
        },
      };

      const edited: MeasurementRecord = {
        id: 'measure-30',
        swing_id: 'swing-30',
        meta_data: {
          values: [1, 2, 3, 4],
        },
      };

      const delta = computer.computeDelta(original, edited);

      expect(delta.hasChanges).toBe(true);
      expect(delta.changedFields).toContain('meta_data');
    });

    it('should detect array element removal', () => {
      const original: MeasurementRecord = {
        id: 'measure-31',
        swing_id: 'swing-31',
        meta_data: {
          values: [1, 2, 3, 4],
        },
      };

      const edited: MeasurementRecord = {
        id: 'measure-31',
        swing_id: 'swing-31',
        meta_data: {
          values: [1, 2, 3],
        },
      };

      const delta = computer.computeDelta(original, edited);

      expect(delta.hasChanges).toBe(true);
      expect(delta.changedFields).toContain('meta_data');
    });

    it('should detect array element reordering', () => {
      const original: MeasurementRecord = {
        id: 'measure-32',
        swing_id: 'swing-32',
        meta_data: {
          values: [1, 2, 3],
        },
      };

      const edited: MeasurementRecord = {
        id: 'measure-32',
        swing_id: 'swing-32',
        meta_data: {
          values: [3, 2, 1],
        },
      };

      const delta = computer.computeDelta(original, edited);

      expect(delta.hasChanges).toBe(true);
      expect(delta.changedFields).toContain('meta_data');
    });

    it('should detect array of objects changes', () => {
      const original: MeasurementRecord = {
        id: 'measure-33',
        swing_id: 'swing-33',
        meta_data: {
          poses: [
            { position: 'P1', angle: 45 },
            { position: 'P2', angle: 50 },
          ],
        },
      };

      const edited: MeasurementRecord = {
        id: 'measure-33',
        swing_id: 'swing-33',
        meta_data: {
          poses: [
            { position: 'P1', angle: 48 },
            { position: 'P2', angle: 50 },
          ],
        },
      };

      const delta = computer.computeDelta(original, edited);

      expect(delta.hasChanges).toBe(true);
      expect(delta.changedFields).toContain('meta_data');
    });
  });

  describe('Tier Determination Accuracy (Boundary Cases)', () => {
    // ─── 계층 결정의 정확성 (경계 케이스) ───
    it('should correctly identify tier_1 when only core field changes among multiple', () => {
      const original: MeasurementRecord = {
        id: 'measure-34',
        swing_id: 'swing-34',
        distance_m: 200,
        confidence_score: 0.85,
        state: 'pending',
        created_at: '2026-03-10T10:00:00Z',
      };

      const edited: MeasurementRecord = {
        id: 'measure-34',
        swing_id: 'swing-34',
        distance_m: 210, // Core field changed
        confidence_score: 0.85, // No change
        state: 'confirmed', // No change
        created_at: '2026-03-10T10:00:00Z', // No change
      };

      const delta = computer.computeDelta(original, edited);

      expect(delta.dataQualityTier).toBe('tier_1');
    });

    it('should correctly identify tier_2 with confidence change but no core field', () => {
      const original: MeasurementRecord = {
        id: 'measure-35',
        swing_id: 'swing-35',
        distance_m: 200,
        confidence_score: 0.85,
        state: 'pending',
      };

      const edited: MeasurementRecord = {
        id: 'measure-35',
        swing_id: 'swing-35',
        distance_m: 200, // No core field change
        confidence_score: 0.90, // Confidence changed
        state: 'confirmed',
      };

      const delta = computer.computeDelta(original, edited);

      expect(delta.dataQualityTier).toBe('tier_2');
    });

    it('should correctly identify tier_3 with only state/timestamp changes', () => {
      const original: MeasurementRecord = {
        id: 'measure-36',
        swing_id: 'swing-36',
        distance_m: 200,
        confidence_score: 0.85,
        state: 'pending',
        updated_at: '2026-03-10T10:00:00Z',
      };

      const edited: MeasurementRecord = {
        id: 'measure-36',
        swing_id: 'swing-36',
        distance_m: 200,
        confidence_score: 0.85,
        state: 'confirmed', // Only state changed
        updated_at: '2026-03-10T11:00:00Z', // Timestamp changed
      };

      const delta = computer.computeDelta(original, edited);

      expect(delta.dataQualityTier).toBe('tier_3');
    });
  });

  describe('Idempotency Tests', () => {
    // ─── 멱등성: 같은 편집을 두 번 적용하면 같은 결과 ───
    it('should produce identical delta when applying same edit twice', () => {
      const original: MeasurementRecord = {
        id: 'measure-37',
        swing_id: 'swing-37',
        distance_m: 200,
        carry_m: 180,
      };

      const edited: MeasurementRecord = {
        id: 'measure-37',
        swing_id: 'swing-37',
        distance_m: 210,
        carry_m: 190,
      };

      const delta1 = computer.computeDelta(original, edited);
      const delta2 = computer.computeDelta(original, edited);

      expect(delta1.changedFields).toEqual(delta2.changedFields);
      expect(delta1.oldValues).toEqual(delta2.oldValues);
      expect(delta1.newValues).toEqual(delta2.newValues);
      expect(delta1.dataQualityTier).toEqual(delta2.dataQualityTier);
    });

    it('should be idempotent across 100 iterations', () => {
      const original: MeasurementRecord = {
        id: 'measure-38',
        swing_id: 'swing-38',
        distance_m: 200,
        confidence_score: 0.5,
      };

      const edited: MeasurementRecord = {
        id: 'measure-38',
        swing_id: 'swing-38',
        distance_m: 215,
        confidence_score: 0.75,
      };

      const firstDelta = computer.computeDelta(original, edited);

      for (let i = 0; i < 100; i++) {
        const delta = computer.computeDelta(original, edited);
        expect(delta.changedFields).toEqual(firstDelta.changedFields);
        expect(delta.dataQualityTier).toEqual(firstDelta.dataQualityTier);
      }
    });
  });

  describe('Round-Trip Consistency (original + delta = edited)', () => {
    // ─── 라운드트립 일관성: original + delta = edited ───
    it('should verify mathematical consistency: original + delta = edited', () => {
      const original: MeasurementRecord = {
        id: 'measure-39',
        swing_id: 'swing-39',
        distance_m: 200,
        carry_m: 180,
        launch_angle: 15,
      };

      const edited: MeasurementRecord = {
        id: 'measure-39',
        swing_id: 'swing-39',
        distance_m: 210,
        carry_m: 190,
        launch_angle: 16,
      };

      const delta = computer.computeDelta(original, edited);

      // Reconstruct: original + delta should equal edited
      const reconstructed: MeasurementRecord = {
        ...original,
      };

      delta.changedFields.forEach((field) => {
        reconstructed[field] = delta.newValues[field];
      });

      // Verify consistency
      delta.changedFields.forEach((field) => {
        expect(reconstructed[field]).toEqual(edited[field]);
      });
    });

    it('should verify reverse consistency: edited - delta = original', () => {
      const original: MeasurementRecord = {
        id: 'measure-40',
        swing_id: 'swing-40',
        distance_m: 200,
        confidence_score: 0.65,
      };

      const edited: MeasurementRecord = {
        id: 'measure-40',
        swing_id: 'swing-40',
        distance_m: 215,
        confidence_score: 0.80,
      };

      const delta = computer.computeDelta(original, edited);

      // Reverse: edited - delta should equal original
      const reversed: MeasurementRecord = {
        ...edited,
      };

      delta.changedFields.forEach((field) => {
        reversed[field] = delta.oldValues[field];
      });

      // Verify consistency
      delta.changedFields.forEach((field) => {
        expect(reversed[field]).toEqual(original[field]);
      });
    });
  });

  describe('Large Edit Sets (50+ field changes)', () => {
    // ─── 대규모 편집: 50개 이상 필드 변경 ───
    it('should handle 50+ field changes', () => {
      const original: MeasurementRecord = {
        id: 'measure-41',
        swing_id: 'swing-41',
      };

      const edited: MeasurementRecord = {
        id: 'measure-41',
        swing_id: 'swing-41',
      };

      // Add 60 fields
      for (let i = 0; i < 60; i++) {
        original[`field_${i}`] = i;
        edited[`field_${i}`] = i + 100;
      }

      const delta = computer.computeDelta(original, edited);

      expect(delta.changedFields.length).toBe(60);
      expect(delta.hasChanges).toBe(true);
    });

    it('should correctly tier large edit sets', () => {
      const original: MeasurementRecord = {
        id: 'measure-42',
        swing_id: 'swing-42',
        distance_m: 200,
      };

      const edited: MeasurementRecord = {
        id: 'measure-42',
        swing_id: 'swing-42',
        distance_m: 210, // Core field: tier_1
      };

      // Add 50+ non-core fields
      for (let i = 0; i < 50; i++) {
        original[`meta_${i}`] = i;
        edited[`meta_${i}`] = i + 1;
      }

      const delta = computer.computeDelta(original, edited);

      // Should still be tier_1 because core field changed
      expect(delta.dataQualityTier).toBe('tier_1');
    });
  });
});
