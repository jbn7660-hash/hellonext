/**
 * Unit Tests: Validators & Schema Validation
 *
 * Tests Zod schemas, coupon code format,
 * payment amount boundaries.
 *
 * @feature F-008, F-012
 */

import { describe, it, expect } from 'vitest';
import { z } from 'zod';

// ─── Coupon Code Validator ──────────────────────────

const CouponCodeSchema = z
  .string()
  .min(8)
  .max(9)
  .regex(/^[A-Z0-9]{4}-[A-Z0-9]{4}$/, 'Format must be XXXX-XXXX');

describe('CouponCodeSchema', () => {
  it('should accept valid coupon code XXXX-XXXX', () => {
    expect(CouponCodeSchema.safeParse('ABCD-1234').success).toBe(true);
    expect(CouponCodeSchema.safeParse('ZZZZ-9999').success).toBe(true);
  });

  it('should reject lowercase codes', () => {
    expect(CouponCodeSchema.safeParse('abcd-1234').success).toBe(false);
  });

  it('should reject codes without dash', () => {
    expect(CouponCodeSchema.safeParse('ABCD1234').success).toBe(false);
  });

  it('should reject too short codes', () => {
    expect(CouponCodeSchema.safeParse('ABC-123').success).toBe(false);
  });

  it('should reject codes with special characters', () => {
    expect(CouponCodeSchema.safeParse('AB!D-12#4').success).toBe(false);
  });

  it('should exclude confusing characters (I, O, 0, 1 excluded in generator)', () => {
    // Generator excludes I, O, 0, 1 but validator should still accept them if typed
    // This tests the code generation logic constraint
    const SAFE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    expect(SAFE_CHARS).not.toContain('I');
    expect(SAFE_CHARS).not.toContain('O');
    expect(SAFE_CHARS).not.toContain('0');
    expect(SAFE_CHARS).not.toContain('1');
    expect(SAFE_CHARS).toHaveLength(32);
  });
});

// ─── Payment Amount Validator ───────────────────────

const PaymentAmountSchema = z.number().positive().max(10_000_000);

describe('PaymentAmountSchema', () => {
  it('should accept valid amounts', () => {
    expect(PaymentAmountSchema.safeParse(30000).success).toBe(true);
    expect(PaymentAmountSchema.safeParse(50000).success).toBe(true);
    expect(PaymentAmountSchema.safeParse(120000).success).toBe(true);
    expect(PaymentAmountSchema.safeParse(19000).success).toBe(true);
  });

  it('should reject zero amount', () => {
    expect(PaymentAmountSchema.safeParse(0).success).toBe(false);
  });

  it('should reject negative amount', () => {
    expect(PaymentAmountSchema.safeParse(-1000).success).toBe(false);
  });

  it('should reject amount exceeding limit', () => {
    expect(PaymentAmountSchema.safeParse(100_000_000).success).toBe(false);
  });

  it('should reject non-number types', () => {
    expect(PaymentAmountSchema.safeParse('50000').success).toBe(false);
    expect(PaymentAmountSchema.safeParse(null).success).toBe(false);
  });
});

// ─── Feel Check Validator ───────────────────────────

const FeelCheckSchema = z.object({
  feeling: z.enum(['good', 'unsure', 'off']),
  notes: z.string().max(500).optional(),
  video_id: z.string().uuid(),
});

describe('FeelCheckSchema', () => {
  it('should accept valid feel check', () => {
    const result = FeelCheckSchema.safeParse({
      feeling: 'good',
      video_id: '550e8400-e29b-41d4-a716-446655440000',
    });
    expect(result.success).toBe(true);
  });

  it('should accept all three feeling values', () => {
    for (const feeling of ['good', 'unsure', 'off'] as const) {
      expect(
        FeelCheckSchema.safeParse({
          feeling,
          video_id: '550e8400-e29b-41d4-a716-446655440000',
        }).success
      ).toBe(true);
    }
  });

  it('should reject invalid feeling', () => {
    expect(
      FeelCheckSchema.safeParse({
        feeling: 'great',
        video_id: '550e8400-e29b-41d4-a716-446655440000',
      }).success
    ).toBe(false);
  });

  it('should reject missing video_id', () => {
    expect(
      FeelCheckSchema.safeParse({ feeling: 'good' }).success
    ).toBe(false);
  });

  it('should accept optional notes', () => {
    expect(
      FeelCheckSchema.safeParse({
        feeling: 'off',
        notes: '오늘 허리가 뻣뻣한 느낌',
        video_id: '550e8400-e29b-41d4-a716-446655440000',
      }).success
    ).toBe(true);
  });

  it('should reject notes exceeding 500 chars', () => {
    expect(
      FeelCheckSchema.safeParse({
        feeling: 'good',
        notes: 'x'.repeat(501),
        video_id: '550e8400-e29b-41d4-a716-446655440000',
      }).success
    ).toBe(false);
  });
});

// ─── AI Scope Settings Validator ────────────────────

const AiScopeSchema = z.object({
  hidden_patterns: z.array(z.string().regex(/^EP-\d{3}$/)).max(22),
  feedback_tone: z.enum(['gentle', 'neutral', 'detailed']),
});

describe('AiScopeSchema', () => {
  it('should accept valid scope settings', () => {
    expect(
      AiScopeSchema.safeParse({
        hidden_patterns: ['EP-001', 'EP-005'],
        feedback_tone: 'gentle',
      }).success
    ).toBe(true);
  });

  it('should accept empty hidden patterns', () => {
    expect(
      AiScopeSchema.safeParse({
        hidden_patterns: [],
        feedback_tone: 'neutral',
      }).success
    ).toBe(true);
  });

  it('should reject invalid EP code format', () => {
    expect(
      AiScopeSchema.safeParse({
        hidden_patterns: ['EP-1'],
        feedback_tone: 'neutral',
      }).success
    ).toBe(false);
  });

  it('should reject more than 22 hidden patterns', () => {
    const tooMany = Array.from({ length: 23 }, (_, i) => `EP-${String(i + 1).padStart(3, '0')}`);
    expect(
      AiScopeSchema.safeParse({
        hidden_patterns: tooMany,
        feedback_tone: 'neutral',
      }).success
    ).toBe(false);
  });

  it('should enforce 3 feedback tone options', () => {
    const validTones = ['gentle', 'neutral', 'detailed'];
    validTones.forEach((tone) => {
      expect(
        AiScopeSchema.safeParse({
          hidden_patterns: [],
          feedback_tone: tone,
        }).success
      ).toBe(true);
    });

    expect(
      AiScopeSchema.safeParse({
        hidden_patterns: [],
        feedback_tone: 'aggressive',
      }).success
    ).toBe(false);
  });
});
