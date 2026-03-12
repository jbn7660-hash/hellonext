/**
 * Coupon Code Validators
 *
 * Validation and generation utilities for 8-character alphanumeric coupon codes.
 *
 * @module validators/coupon-code
 */

import { COUPON_CODE_LENGTH } from '../types/coupon';

/** Valid characters for coupon codes (uppercase alphanumeric, no confusing chars) */
const COUPON_CHARSET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

const COUPON_CODE_REGEX = /^[A-Z0-9]{8}$/;

export interface CouponCodeValidationResult {
  readonly valid: boolean;
  readonly errors: readonly string[];
}

/**
 * Validates a coupon code format.
 */
export function validateCouponCode(code: string): CouponCodeValidationResult {
  const errors: string[] = [];

  if (!code || typeof code !== 'string') {
    errors.push('쿠폰 코드를 입력해주세요.');
    return { valid: false, errors };
  }

  const normalized = code.toUpperCase().trim();

  if (normalized.length !== COUPON_CODE_LENGTH) {
    errors.push(`쿠폰 코드는 ${COUPON_CODE_LENGTH}자리여야 합니다.`);
  }

  if (!COUPON_CODE_REGEX.test(normalized)) {
    errors.push('쿠폰 코드는 영문 대문자와 숫자로만 구성되어야 합니다.');
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Generates a random coupon code.
 * Uses crypto API when available for better randomness.
 */
export function generateCouponCode(): string {
  const chars: string[] = [];

  for (let i = 0; i < COUPON_CODE_LENGTH; i++) {
    const randomIndex = Math.floor(Math.random() * COUPON_CHARSET.length);
    const char = COUPON_CHARSET[randomIndex];
    if (char) {
      chars.push(char);
    }
  }

  return chars.join('');
}

/**
 * Normalizes user input for coupon code (uppercase, trim, remove spaces/dashes).
 */
export function normalizeCouponCode(input: string): string {
  return input.toUpperCase().replace(/[\s-]/g, '').trim();
}
