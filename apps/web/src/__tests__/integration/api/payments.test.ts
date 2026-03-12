/**
 * Integration Tests: Payments API
 *
 * Tests full request/response cycle for payment endpoints.
 * Mocks Supabase & Toss at boundary, validates auth + flow.
 *
 * @feature F-008
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// ─── Mock Toss Payments ─────────────────────────────
vi.mock('@/lib/payments/toss', () => ({
  confirmPayment: vi.fn().mockResolvedValue({
    paymentKey: 'pk_test',
    orderId: 'order_test',
    totalAmount: 50000,
    status: 'DONE',
    method: '카드',
    approvedAt: '2026-03-10T12:00:00+09:00',
    receipt: { url: 'https://receipt.test' },
  }),
  issueBillingKey: vi.fn().mockResolvedValue({
    billingKey: 'billing_123',
    customerKey: 'cust_abc',
    card: { issuerCode: '11', number: '4242****1234' },
  }),
  cancelPayment: vi.fn().mockResolvedValue({
    paymentKey: 'pk_test',
    status: 'CANCELED',
  }),
  TossPaymentError: class TossPaymentError extends Error {
    code: string;
    constructor(message: string, code: string) {
      super(message);
      this.code = code;
    }
  },
  COUPON_BUNDLES: [],
  SUBSCRIPTION_PLANS: [],
}));

describe('POST /api/payments', () => {
  it('should reject unauthenticated requests', async () => {
    const { createClient } = await import('@/lib/supabase/server');
    vi.mocked(createClient).mockResolvedValueOnce({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: 'Unauthorized' }) },
      from: vi.fn(),
      functions: { invoke: vi.fn() },
    } as any);

    const { POST } = await import('@/app/api/payments/route');
    const req = new NextRequest('http://localhost/api/payments', {
      method: 'POST',
      body: JSON.stringify({
        paymentKey: 'pk_1',
        orderId: 'o_1',
        amount: 50000,
        type: 'coupon_bundle',
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it('should validate request body with Zod', async () => {
    const { POST } = await import('@/app/api/payments/route');
    const req = new NextRequest('http://localhost/api/payments', {
      method: 'POST',
      body: JSON.stringify({ paymentKey: '' }), // Missing required fields
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain('Validation');
  });
});

describe('POST /api/payments/webhook', () => {
  it('should return 500 when TOSS_WEBHOOK_SECRET is not configured', async () => {
    // Remove webhook secret to test misconfiguration handling
    delete process.env.TOSS_WEBHOOK_SECRET;

    const { POST } = await import('@/app/api/payments/webhook/route');
    const req = new NextRequest('http://localhost/api/payments/webhook', {
      method: 'POST',
      body: JSON.stringify({
        eventType: 'PAYMENT_STATUS_CHANGED',
        data: { paymentKey: 'nonexistent', orderId: 'o1', status: 'CANCELED' },
      }),
    });

    const res = await POST(req);
    // Without webhook secret, should return 500 (misconfiguration)
    expect(res.status).toBe(500);
  });

  it('should return 401 when signature is missing', async () => {
    process.env.TOSS_WEBHOOK_SECRET = 'test_webhook_secret';

    const { POST } = await import('@/app/api/payments/webhook/route');
    const req = new NextRequest('http://localhost/api/payments/webhook', {
      method: 'POST',
      body: JSON.stringify({
        eventType: 'PAYMENT_STATUS_CHANGED',
        data: { paymentKey: 'pk1', orderId: 'o1', status: 'CANCELED' },
      }),
    });

    const res = await POST(req);
    // Missing toss-signature header → 401
    expect(res.status).toBe(401);
  });
});
