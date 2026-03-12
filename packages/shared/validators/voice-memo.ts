/**
 * Voice Memo Validators
 *
 * Input validation for voice memo recording and processing.
 *
 * @module validators/voice-memo
 */

/** Maximum voice memo duration in seconds */
export const MAX_MEMO_DURATION_SEC = 120;

/** Minimum voice memo duration in seconds */
export const MIN_MEMO_DURATION_SEC = 1;

/** Maximum audio file size in bytes (10MB) */
export const MAX_AUDIO_FILE_SIZE = 10 * 1024 * 1024;

/** Allowed audio MIME types */
export const ALLOWED_AUDIO_TYPES = [
  'audio/webm',
  'audio/mp4',
  'audio/mpeg',
  'audio/ogg',
  'audio/wav',
] as const;

export interface VoiceMemoValidationResult {
  readonly valid: boolean;
  readonly errors: readonly string[];
}

/**
 * Validates voice memo duration.
 */
export function validateMemoDuration(durationSec: number): VoiceMemoValidationResult {
  const errors: string[] = [];

  if (!Number.isFinite(durationSec) || durationSec < MIN_MEMO_DURATION_SEC) {
    errors.push(`녹음 시간은 최소 ${MIN_MEMO_DURATION_SEC}초 이상이어야 합니다.`);
  }

  if (durationSec > MAX_MEMO_DURATION_SEC) {
    errors.push(`녹음 시간은 최대 ${MAX_MEMO_DURATION_SEC}초(2분)까지 가능합니다.`);
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Validates audio file before upload.
 */
export function validateAudioFile(
  file: { size: number; type: string }
): VoiceMemoValidationResult {
  const errors: string[] = [];

  if (file.size > MAX_AUDIO_FILE_SIZE) {
    errors.push('오디오 파일 크기는 10MB를 초과할 수 없습니다.');
  }

  if (!ALLOWED_AUDIO_TYPES.includes(file.type as typeof ALLOWED_AUDIO_TYPES[number])) {
    errors.push(`지원하지 않는 오디오 형식입니다. 지원 형식: ${ALLOWED_AUDIO_TYPES.join(', ')}`);
  }

  return { valid: errors.length === 0, errors };
}
