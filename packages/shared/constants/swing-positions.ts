/**
 * Swing Position Definitions
 *
 * P1-P8 swing positions used for error pattern classification
 * and pose analysis mapping.
 *
 * @module constants/swing-positions
 */

export interface SwingPositionDef {
  readonly id: string;
  readonly nameKo: string;
  readonly nameEn: string;
  readonly description: string;
  readonly frameRange: readonly [number, number]; // approximate % of swing duration
}

export const SWING_POSITIONS: readonly SwingPositionDef[] = [
  { id: 'P1', nameKo: '어드레스', nameEn: 'Address', description: '셋업 자세', frameRange: [0, 5] },
  { id: 'P2', nameKo: '테이크어웨이', nameEn: 'Takeaway', description: '백스윙 시작 ~ 클럽 수평', frameRange: [5, 20] },
  { id: 'P3', nameKo: '백스윙 탑', nameEn: 'Top of Backswing', description: '백스윙 최고점', frameRange: [20, 40] },
  { id: 'P4', nameKo: '다운스윙', nameEn: 'Downswing', description: '탑 ~ 임팩트 직전', frameRange: [40, 55] },
  { id: 'P5', nameKo: '임팩트', nameEn: 'Impact', description: '볼 타격 순간', frameRange: [55, 60] },
  { id: 'P6', nameKo: '팔로스루', nameEn: 'Follow Through', description: '임팩트 ~ 클럽 수평', frameRange: [60, 75] },
  { id: 'P7', nameKo: '익스텐션', nameEn: 'Extension', description: '팔로스루 ~ 양팔 완전 펴짐', frameRange: [75, 90] },
  { id: 'P8', nameKo: '피니시', nameEn: 'Finish', description: '최종 자세', frameRange: [90, 100] },
] as const;

/** Get swing position by ID */
export function getSwingPosition(id: string): SwingPositionDef | undefined {
  return SWING_POSITIONS.find((p) => p.id === id);
}
