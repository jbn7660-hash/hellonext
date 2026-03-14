/**
 * Unit Tests: TossPayments Library
 *
 * Tests confirmPayment, issueBillingKey, cancelPayment,
 * COUPON_BUNDLES, SUBSCRIPTION_PLANS constants.
 *
 * @feature F-008
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  confirmPayment,
  issueBillingKey,
  executeBillingPayment,
  cancelPayment,
  TossPaymentError,
  COUPON_BUNDLES,
  SUBSCRIPTION_PLANS,
  TOSS_CLIENT_KEY,
} from '@/lib/payments/toss';

// Mock global fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('TossPayments Library', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.TOSS_PAYMENTS_SECRET_KEY = 'test_sk_123456';
  });

  // ─── confirmPayment ─────────────────────────────────

  describe('confirmPayment', () => {
    it('should confirm payment with correct Toss API call', async () => {
      const mockResponse = {
        paymentKey: 'pk_123',
        orderId: 'order_abc',
        totalAmount: 50000,
        status: 'DONE',
        method: '카드',
        approvedAt: '2026-03-10T12:00:00+09:00',
        receipt: { url: 'https://receipt.url' },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const result = await confirmPayment({
        paymentKey: 'pk_123',
        orderId: 'order_abc',
        amount: 50000,
      });

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.tosspayments.com/v1/payments/confirm',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
          }),
          body: JSON.stringify({
            paymentKey: 'pk_123',
            orderId: 'order_abc',
            amount: 50000,
          }),
        })
      );
      expect(result.totalAmount).toBe(50000);
      expect(result.status).toBe('DONE');
    });

    it('should throw TossPaymentError on API failure', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: () => Promise.resolve({
          code: 'INVALID_PAYMENT_KEY',
          message: '유효하지 않은 결제 키입니다.',
        }),
        headers: new Headers(),
      });

      await expect(
        confirmPayment({ paymentKey: 'bad_key', orderId: 'o1', amount: 100 })
      ).rejects.toThrow(TossPaymentError);

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: () => Promise.resolve({
          code: 'INVALID_PAYMENT_KEY',
          message: '유효하지 않은 결제 키입니다.',
        }),
        headers: new Headers(),
      });

      try {
        await confirmPayment({ paymentKey: 'bad_key', orderId: 'o1', amount: 100 });
      } catch (err) {
        expect(err).toBeInstanceOf(TossPaymentError);
        expect((err as TossPaymentError).code).toBe('INVALID_PAYMENT_KEY');
      }
    });

    it('should include correct Authorization header (Basic base64)', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ paymentKey: 'pk', status: 'DONE' }),
      });

      await confirmPayment({ paymentKey: 'pk', orderId: 'o', amount: 1000 });

      const callArgs = mockFetch.mock.calls[0]!;
      const headers = callArgs[1]!.headers;
      const authHeader = headers['Authorization'] || headers['authorization'];

      expect(authHeader).toContain('Basic ');
      // Base64 of "test_sk_123456:"
      const decoded = atob(authHeader.replace('Basic ', ''));
      expect(decoded).toBe('test_sk_123456:');
    });
  });

  // ─── issueBillingKey ────────────────────────────────

  describe('issueBillingKey', () => {
    it('should issue billing key with authKey and customerKey', async () => {
      const mockResponse = {
        billingKey: 'billing_key_123',
        customerKey: 'cust_abc',
        card: { issuerCode: '11', number: '4242****1234' },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const result = await issueBillingKey('auth_key_xyz', 'cust_abc');

      expect(result.billingKey).toBe('billing_key_123');
      expect(result.customerKey).toBe('cust_abc');
      expect(result.card).toBeDefined();
    });
  });

  // ─── cancelPayment ──────────────────────────────────

  describe('cancelPayment', () => {
    it('should cancel payment with reason', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          paymentKey: 'pk_123',
          status: 'CANCELED',
          cancels: [{ cancelAmount: 50000, cancelReason: '고객 요청' }],
        }),
      });

      const result = await cancelPayment('pk_123', '고객 요청');
      expect(result.status).toBe('CANCELED');
    });

    it('should support partial cancellation', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          paymentKey: 'pk_123',
          status: 'PARTIAL_CANCELED',
          cancels: [{ cancelAmount: 20000 }],
        }),
      });

      const result = await cancelPayment('pk_123', '부분 취소', 20000);
      expect(result.status).toBe('PARTIAL_CANCELED');
    });
  });

  // ─── Constants ──────────────────────────────────────

  describe('COUPON_BUNDLES', () => {
    it('should have 3 bundle options', () => {
      expect(COUPON_BUNDLES).toHaveLength(3);
    });

    it('should have correct quantities', () => {
      expect(COUPON_BUNDLES.map((b) => b.quantity)).toEqual([5, 10, 30]);
    });

    it('should have exactly one popular bundle', () => {
      const popular = COUPON_BUNDLES.filter((b) => 'popular' in b && b.popular);
      expect(popular).toHaveLength(1);
      expect(popular[0]!.quantity).toBe(10);
    });

    it('should have decreasing per-unit price for larger bundles', () => {
      const perUnit = COUPON_BUNDLES.map((b) => b.price / b.quantity);
      for (let i = 1; i < perUnit.length; i++) {
        expect(perUnit[i]!).toBeLessThan(perUnit[i - 1]!);
      }
    });
  });

  describe('SUBSCRIPTION_PLANS', () => {
    it('should have 3 plans', () => {
      expect(SUBSCRIPTION_PLANS).toHaveLength(3);
    });

    it('should include a free starter plan', () => {
      const starter = SUBSCRIPTION_PLANS.find((p) => p.id === 'starter');
      expect(starter).toBeDefined();
      expect(starter!.price).toBe(0);
    });

    it('should have increasing prices', () => {
      const prices = SUBSCRIPTION_PLANS.map((p) => p.price);
      for (let i = 1; i < prices.length; i++) {
        expect(prices[i]!).toBeGreaterThan(prices[i - 1]!);
      }
    });

    it('should have memberLimit: -1 for unlimited plans', () => {
      const pro = SUBSCRIPTION_PLANS.find((p) => p.id === 'pro');
      expect(pro!.memberLimit).toBe(-1);
    });
  });

  describe('TossPaymentError', () => {
    it('should preserve error code and message', () => {
      const error = new TossPaymentError('TEST_CODE', 'Test error');
      expect(error.message).toBe('Test error');
      expect(error.code).toBe('TEST_CODE');
      expect(error).toBeInstanceOf(Error);
    });
  });
});
