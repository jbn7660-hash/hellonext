/**
 * Golf Swing Error Patterns
 *
 * 22 standard error pattern definitions mapped to swing positions P1-P8.
 * These are the master reference data used by AI observation engine
 * and pro scope settings.
 *
 * @module constants/error-patterns
 */

export interface ErrorPattern {
  readonly code: string;
  readonly nameKo: string;
  readonly nameEn: string;
  readonly description: string;
  readonly position: SwingPosition;
  readonly causalityParents: readonly string[];
}

export type SwingPosition = 'P1' | 'P2' | 'P3' | 'P4' | 'P5' | 'P6' | 'P7' | 'P8';

export const ERROR_PATTERNS: readonly ErrorPattern[] = [
  { code: 'EP-001', nameKo: '그립 압력 과다', nameEn: 'Excessive Grip Pressure', description: '그립을 너무 세게 잡아 손목 유연성이 감소하는 패턴', position: 'P1', causalityParents: [] },
  { code: 'EP-002', nameKo: '얼라인먼트 미스', nameEn: 'Alignment Error', description: '타겟 라인 대비 어깨/발/힙 정렬 오류', position: 'P1', causalityParents: [] },
  { code: 'EP-003', nameKo: '과도한 어드레스 전경', nameEn: 'Excessive Forward Tilt', description: '어드레스 시 상체가 너무 앞으로 기울어진 상태', position: 'P1', causalityParents: [] },
  { code: 'EP-004', nameKo: '테이크어웨이 인사이드', nameEn: 'Inside Takeaway', description: '백스윙 시작 시 클럽이 과도하게 안쪽으로 빠지는 패턴', position: 'P2', causalityParents: ['EP-001'] },
  { code: 'EP-005', nameKo: '테이크어웨이 아웃사이드', nameEn: 'Outside Takeaway', description: '백스윙 시작 시 클럽이 과도하게 바깥으로 나가는 패턴', position: 'P2', causalityParents: ['EP-001'] },
  { code: 'EP-006', nameKo: '얼리 힌지', nameEn: 'Early Wrist Hinge', description: '테이크어웨이 초기에 손목이 너무 일찍 꺾이는 패턴', position: 'P2', causalityParents: ['EP-001'] },
  { code: 'EP-007', nameKo: '오버 로테이션', nameEn: 'Over Rotation', description: '백스윙 탑에서 어깨 회전이 과도한 패턴', position: 'P3', causalityParents: ['EP-004'] },
  { code: 'EP-008', nameKo: '리버스 피봇', nameEn: 'Reverse Pivot', description: '백스윙 시 체중이 왼발에 남는 패턴', position: 'P3', causalityParents: ['EP-003'] },
  { code: 'EP-009', nameKo: '크로싱 라인', nameEn: 'Crossing the Line', description: '백스윙 탑에서 클럽이 타겟 라인을 넘어가는 패턴', position: 'P3', causalityParents: ['EP-004', 'EP-007'] },
  { code: 'EP-010', nameKo: '플라잉 엘보', nameEn: 'Flying Elbow', description: '백스윙 탑에서 오른팔꿈치가 과도하게 벌어지는 패턴', position: 'P3', causalityParents: [] },
  { code: 'EP-011', nameKo: '캐스팅', nameEn: 'Casting', description: '다운스윙 초기에 손목 각도가 풀리는 패턴', position: 'P4', causalityParents: ['EP-006', 'EP-010'] },
  { code: 'EP-012', nameKo: '오버 더 탑', nameEn: 'Over The Top', description: '다운스윙 시 클럽이 아웃→인 궤도로 내려오는 패턴', position: 'P4', causalityParents: ['EP-005', 'EP-009'] },
  { code: 'EP-013', nameKo: '힙 슬라이드', nameEn: 'Hip Slide', description: '다운스윙 시 힙이 회전하지 않고 옆으로 밀리는 패턴', position: 'P4', causalityParents: ['EP-008'] },
  { code: 'EP-014', nameKo: '행잉 백', nameEn: 'Hanging Back', description: '임팩트 시 체중이 뒷발에 남는 패턴', position: 'P5', causalityParents: ['EP-008', 'EP-013'] },
  { code: 'EP-015', nameKo: '얼리 익스텐션', nameEn: 'Early Extension', description: '임팩트 시 골반이 볼 쪽으로 밀리는 패턴', position: 'P5', causalityParents: ['EP-003'] },
  { code: 'EP-016', nameKo: '치킨 윙', nameEn: 'Chicken Wing', description: '임팩트/팔로스루에서 왼팔이 접히는 패턴', position: 'P6', causalityParents: ['EP-015'] },
  { code: 'EP-017', nameKo: '플립', nameEn: 'Flip', description: '임팩트 직후 손목이 뒤집히는 패턴', position: 'P6', causalityParents: ['EP-011', 'EP-014'] },
  { code: 'EP-018', nameKo: '불완전 팔로스루', nameEn: 'Incomplete Follow Through', description: '팔로스루가 축소되어 에너지 전달이 부족한 패턴', position: 'P7', causalityParents: ['EP-016'] },
  { code: 'EP-019', nameKo: '리버스 C 피니시', nameEn: 'Reverse C Finish', description: '피니시에서 허리가 과도하게 꺾이는 패턴', position: 'P8', causalityParents: ['EP-015'] },
  { code: 'EP-020', nameKo: '불균형 피니시', nameEn: 'Unbalanced Finish', description: '피니시에서 균형을 잃는 패턴', position: 'P8', causalityParents: ['EP-013', 'EP-014'] },
  { code: 'EP-021', nameKo: '템포 불균형', nameEn: 'Tempo Imbalance', description: '백스윙:다운스윙 비율이 적정 범위(3:1)를 벗어난 패턴', position: 'P4', causalityParents: [] },
  { code: 'EP-022', nameKo: '그립 전환 오류', nameEn: 'Grip Transition Error', description: '스윙 중 그립 위치가 변하는 패턴', position: 'P4', causalityParents: ['EP-001'] },
] as const;

/** Lookup error pattern by code */
export function getErrorPattern(code: string): ErrorPattern | undefined {
  return ERROR_PATTERNS.find((ep) => ep.code === code);
}

/** Get all error patterns for a specific swing position */
export function getPatternsByPosition(position: SwingPosition): readonly ErrorPattern[] {
  return ERROR_PATTERNS.filter((ep) => ep.position === position);
}

/** Total count of error patterns */
export const ERROR_PATTERN_COUNT = 22;
