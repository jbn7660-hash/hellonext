/**
 * Payments API
 *
 * POST /api/payments — Confirm a one-time payment (coupon bundle purchase)
 * GET  /api/payments — List payment history with filtering
 *
 * Features:
 *  - Duplicate prevention (toss_payment_key uniqueness check)
 *  - Amount verification against expected bundle/plan price
 *  - Metadata enrichment (user agent, IP, timestamp)
 *  - Rate limiting (max 5 attempts per user per hour)
 *  - Error recovery logging for manual reconciliation
 *  - GET: date range filtering, total summary
 *
 * @route /api/payments
 * @feature F-008
 */

import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { confirmPayment, TossPaymentError, COUPON_BUNDLES, SUBSCRIPTION_PLANS } from '@/lib/payments/toss';
import { z } from 'zod';
import { logger } from '@/lib/utils/logger';
import type { Tables } from '@/lib/supabase/types';

// payments schema: id, amount, created_at, metadata, status, toss_payment_key, type, user_id

const BUNDLE_PRICES: Record<number, number> = {
  5: 30000,
  10: 50000,
  30: 120000,
};

const PLAN_PRICES: Record<string, number> = {
  'pro': 19000,
  'academy': 149000,
};

const ConfirmPaymentSchema = z.object({
  paymentKey: z.string().min(1),
  orderId: z.string().min(1),
  amount: z.number().positive(),
  type: z.enum(['coupon_bundle', 'subscription']),
  metadata: z.object({
    bundle_quantity: z.number().int().min(1).optional(),
    plan_id: z.string().optional(),
  }).optional(),
});

function getClientIp(request: NextRequest): string {
  return request.headers.get('x-forwarded-for')?.split(',')[0] ??
         request.headers.get('x-real-ip') ??
         request.ip ??
         'unknown';
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const parsed = ConfirmPaymentSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { paymentKey, orderId, amount, type, metadata } = parsed.data;

    // 1. Rate limiting: max 5 payment attempts per user per hour
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { count: recentAttempts } = await supabase
      .from('payments')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .gte('created_at', oneHourAgo);

    if ((recentAttempts ?? 0) >= 5) {
      logger.warn('Payment rate limit exceeded', { userId: user.id });
      return NextResponse.json(
        { error: 'Too many payment attempts. Please try again later.' },
        { status: 429 }
      );
    }

    // 2. Check for duplicate payment key
    const { count: existingPayment } = await supabase
      .from('payments')
      .select('*', { count: 'exact', head: true })
      .eq('toss_payment_key', paymentKey)
      .eq('status', 'DONE');

    if ((existingPayment ?? 0) > 0) {
      logger.warn('Duplicate payment key', { paymentKey, userId: user.id });
      return NextResponse.json(
        { error: 'This order has already been completed' },
        { status: 409 }
      );
    }

    // 3. Verify amount matches expected price
    let expectedAmount: number | null = null;
    if (type === 'coupon_bundle' && metadata?.bundle_quantity) {
      expectedAmount = BUNDLE_PRICES[metadata.bundle_quantity as keyof typeof BUNDLE_PRICES] ?? null;
    } else if (type === 'subscription' && metadata?.plan_id) {
      expectedAmount = PLAN_PRICES[metadata.plan_id as keyof typeof PLAN_PRICES] ?? null;
    }

    if (expectedAmount !== null && amount !== expectedAmount) {
      logger.error('Payment amount mismatch', {
        userId: user.id,
        orderId,
        expected: expectedAmount,
        received: amount,
        type,
      });
      return NextResponse.json(
        { error: 'Payment amount does not match expected price' },
        { status: 400 }
      );
    }

    // 4. Get pro profile
    const { data: proProfileRaw } = await supabase
      .from('pro_profiles')
      .select('id')
      .eq('user_id', user.id)
      .single();

    const proProfile = proProfileRaw as Tables<'pro_profiles'> | null;

    if (!proProfile) {
      return NextResponse.json({ error: 'Pro profile not found' }, { status: 403 });
    }

    // 5. Confirm payment with Toss
    let tossResult;
    try {
      tossResult = await confirmPayment({ paymentKey, orderId, amount });
    } catch (err) {
      if (err instanceof TossPaymentError) {
        logger.error('Toss payment confirmation failed', {
          code: err.code,
          message: err.message,
          userId: user.id,
          orderId,
          isRetryable: err.isRetryable,
        });
        const statusCode = err.isRetryable ? 503 : 400;
        return NextResponse.json(
          { error: err.message, code: err.code, isRetryable: err.isRetryable },
          { status: statusCode }
        );
      }
      throw err;
    }

    // 6. Enrich metadata
    const enrichedMetadata = {
      ...(metadata ?? {}),
      order_id: tossResult.orderId,
      user_agent: request.headers.get('user-agent') ?? '',
      ip: getClientIp(request),
      timestamp: new Date().toISOString(),
    };

    // 7. Record payment — only schema-valid columns: id, amount, created_at, metadata, status, toss_payment_key, type, user_id
    const { data: paymentRaw, error: insertError } = await (supabase as any)
      .from('payments')
      .insert({
        user_id: user.id,
        toss_payment_key: tossResult.paymentKey,
        amount: tossResult.totalAmount,
        status: tossResult.status,
        type,
        metadata: enrichedMetadata,
      })
      .select()
      .single();

    const payment = paymentRaw as Tables<'payments'> | null;

    if (insertError || !payment) {
      logger.error('Payment record insert failed', {
        error: insertError?.message,
        orderId,
        userId: user.id,
      });
      // payment_reconciliation is not in typed schema — use any cast
      await (supabase as any)
        .from('payment_reconciliation')
        .insert({
          order_id: orderId,
          payment_key: tossResult.paymentKey,
          toss_status: tossResult.status,
          db_error: insertError?.message,
          metadata: enrichedMetadata,
          created_at: new Date().toISOString(),
        });

      return NextResponse.json(
        { error: 'Payment confirmed but record failed. Contact support.' },
        { status: 500 }
      );
    }

    // 8. If coupon bundle purchase → generate coupons
    if (type === 'coupon_bundle' && metadata?.bundle_quantity) {
      const { error: couponError } = await supabase.functions.invoke('coupon-activate', {
        body: {
          action: 'generate',
          quantity: metadata.bundle_quantity,
          type: 'purchased',
          bundle_payment_id: payment.id,
        },
      });

      if (couponError) {
        logger.error('Post-payment coupon generation failed', {
          paymentId: payment.id,
          error: couponError,
        });
      }
    }

    logger.info('Payment confirmed', {
      paymentId: payment.id,
      amount: tossResult.totalAmount,
      type,
      userId: user.id,
    });

    return NextResponse.json({ data: payment }, { status: 201 });
  } catch (err) {
    logger.error('Payments POST error', { error: err });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: proProfileRaw } = await supabase
      .from('pro_profiles')
      .select('id')
      .eq('user_id', user.id)
      .single();

    const proProfile = proProfileRaw as Tables<'pro_profiles'> | null;

    if (!proProfile) {
      return NextResponse.json({ error: 'Pro profile not found' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') ?? '1', 10);
    const limit = parseInt(searchParams.get('limit') ?? '20', 10);
    const offset = (page - 1) * limit;
    const startDate = searchParams.get('start_date');
    const endDate = searchParams.get('end_date');
    const type = searchParams.get('type');

    // payments uses user_id, not pro_id
    let query = supabase
      .from('payments')
      .select('*', { count: 'exact' })
      .eq('user_id', user.id);

    if (type) {
      query = query.eq('type', type);
    }

    if (startDate) {
      query = query.gte('created_at', startDate);
    }
    if (endDate) {
      query = query.lte('created_at', endDate);
    }

    const { data: dataRaw, count, error } = await query
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    const data = dataRaw as Tables<'payments'>[] | null;

    if (error) {
      logger.error('Payments fetch failed', { error: error.message });
      return NextResponse.json({ error: 'Failed to fetch payments' }, { status: 500 });
    }

    // Summary statistics
    const { data: allPaymentsRaw } = await supabase
      .from('payments')
      .select('amount, status, type')
      .eq('user_id', user.id)
      .eq('status', 'DONE');

    const allPayments = (allPaymentsRaw as Tables<'payments'>[] | null) ?? [];
    const total = allPayments.reduce((sum, p) => sum + (p.amount || 0), 0);
    const summary = {
      total_amount: total,
      total_completed: allPayments.length,
      by_type: {
        coupon_bundle: allPayments.filter(p => p.type === 'coupon_bundle').length,
        subscription: allPayments.filter(p => p.type === 'subscription').length,
      },
    };

    return NextResponse.json({
      data,
      pagination: { page, limit, total: count ?? 0 },
      summary,
    });
  } catch (err) {
    logger.error('Payments GET error', { error: err });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
