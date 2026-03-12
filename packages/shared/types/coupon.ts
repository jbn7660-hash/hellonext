/**
 * Coupon Types
 *
 * Type definitions for coupon and premium subscription management.
 *
 * @module types/coupon
 */

export type CouponType = 'plg' | 'purchased';
export type CouponStatus = 'unused' | 'assigned' | 'redeemed' | 'expired';

/** Coupon display info for UI */
export interface CouponDisplayInfo {
  readonly code: string;
  readonly type: CouponType;
  readonly status: CouponStatus;
  readonly assignedMemberName: string | null;
  readonly expiresAt: string;
  readonly daysUntilExpiry: number;
  readonly isExpiringSoon: boolean;
}

/** Coupon bundle purchase options */
export interface CouponBundle {
  readonly quantity: number;
  readonly pricePerCoupon: number;
  readonly totalPrice: number;
  readonly premiumDays: number;
}

/** Standard coupon bundles available for purchase */
export const COUPON_BUNDLES: readonly CouponBundle[] = [
  { quantity: 5, pricePerCoupon: 6000, totalPrice: 30000, premiumDays: 90 },
  { quantity: 10, pricePerCoupon: 5000, totalPrice: 50000, premiumDays: 90 },
  { quantity: 20, pricePerCoupon: 4500, totalPrice: 90000, premiumDays: 90 },
] as const;

/** PLG coupon constants */
export const PLG_COUPON_COUNT = 3;
export const PLG_PREMIUM_DAYS = 90;
export const COUPON_CODE_LENGTH = 8;
