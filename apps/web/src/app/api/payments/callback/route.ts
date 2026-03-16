/**
 * Toss Payments Callback Route
 *
 * GET /api/payments/callback — Handle Toss redirect after payment/billing key auth
 *
 * Two flows:
 *  1. Coupon bundle: paymentKey + orderId + amount → confirmPayment → record → redirect /coupons
 *  2. Subscription: authKey + customerKey → issueBillingKey → create subscription → redirect /subscription
 *
 * Toss SDK redirects here with query params on success.
 * On failure, Toss redirects to the failUrl set in the frontend.
 *
 * @route /api/payments/callback
 * @feature F-008
 */

import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import {
  confirmPayment,
  issueBillingKey,
  executeBillingPayment,
  TossPaymentError,
  COUPON_BUNDLES,
} from '@/lib/payments/toss';
import { logger } from '@/lib/utils/logger';
import type { Tables } from '@/lib/supabase/types';

const PLAN_PRICES: Record<string, number> = {
  pro: 19000,
  academy: 149000,
};

function redirectWithError(baseUrl: string, path: string, error: string): NextResponse {
  const url = new URL(path, baseUrl);
  url.searchParams.set('error', error);
  return NextResponse.redirect(url);
}

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const type = searchParams.get('type');

  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return redirectWithError(origin, '/login', 'unauthorized');
    }

    // ─── Coupon Bundle Payment ────────────────────────────────────
    if (type === 'coupon_bundle') {
      const paymentKey = searchParams.get('paymentKey');
      const orderId = searchParams.get('orderId');
      const amountStr = searchParams.get('amount');
      const quantityStr = searchParams.get('quantity');

      if (!paymentKey || !orderId || !amountStr) {
        return redirectWithError(origin, '/coupons', 'missing_params');
      }

      const amount = parseInt(amountStr, 10);
      const quantity = quantityStr ? parseInt(quantityStr, 10) : null;

      if (isNaN(amount) || amount <= 0) {
        return redirectWithError(origin, '/coupons', 'invalid_amount');
      }

      // Validate amount against known bundle prices
      if (quantity) {
        const bundle = COUPON_BUNDLES.find((b) => b.quantity === quantity);
        if (bundle && bundle.price !== amount) {
          logger.error('Coupon bundle amount mismatch', {
            userId: user.id,
            expected: bundle.price,
            received: amount,
            quantity,
          });
          return redirectWithError(origin, '/coupons', 'amount_mismatch');
        }
      }

      // Confirm payment with Toss
      let tossResult;
      try {
        tossResult = await confirmPayment({ paymentKey, orderId, amount });
      } catch (err) {
        if (err instanceof TossPaymentError) {
          logger.error('Callback: Toss confirm failed', {
            code: err.code,
            message: err.message,
            userId: user.id,
            orderId,
          });
          return redirectWithError(
            origin,
            '/coupons',
            err.isRetryable ? 'payment_temporary_error' : 'payment_failed'
          );
        }
        throw err;
      }

      // Record payment
      const { data: paymentRaw, error: insertError } = await (supabase as any)
        .from('payments')
        .insert({
          user_id: user.id,
          toss_payment_key: tossResult.paymentKey,
          amount: tossResult.totalAmount,
          status: tossResult.status,
          type: 'coupon_bundle',
          metadata: {
            bundle_quantity: quantity,
            order_id: tossResult.orderId,
            approved_at: tossResult.approvedAt,
            method: tossResult.method,
            receipt_url: tossResult.receipt?.url ?? null,
          },
        })
        .select()
        .single();

      const payment = paymentRaw as Tables<'payments'> | null;

      if (insertError || !payment) {
        logger.error('Callback: payment insert failed', {
          error: insertError?.message,
          orderId,
          userId: user.id,
        });
        // Payment is confirmed with Toss but DB insert failed — log for reconciliation
        await (supabase as any).from('payment_reconciliation').insert({
          order_id: orderId,
          payment_key: tossResult.paymentKey,
          toss_status: tossResult.status,
          db_error: insertError?.message ?? 'insert returned null',
          metadata: { amount, quantity, callback_flow: true },
          created_at: new Date().toISOString(),
        });
        return redirectWithError(origin, '/coupons', 'record_failed');
      }

      // Generate coupons via Edge Function
      if (quantity) {
        const { error: couponError } = await supabase.functions.invoke('coupon-activate', {
          body: {
            action: 'generate',
            quantity,
            type: 'purchased',
            bundle_payment_id: payment.id,
          },
        });

        if (couponError) {
          logger.error('Callback: coupon generation failed', {
            paymentId: payment.id,
            error: couponError,
          });
          // Don't fail the redirect — coupons can be generated manually
        }
      }

      logger.info('Callback: coupon bundle payment complete', {
        paymentId: payment.id,
        amount: tossResult.totalAmount,
        quantity,
        userId: user.id,
      });

      const successUrl = new URL('/coupons', origin);
      successUrl.searchParams.set('payment', 'success');
      successUrl.searchParams.set('amount', String(tossResult.totalAmount));
      if (quantity) successUrl.searchParams.set('quantity', String(quantity));
      return NextResponse.redirect(successUrl);
    }

    // ─── Subscription (Billing Key Auth) ──────────────────────────
    if (type === 'subscription') {
      const authKey = searchParams.get('authKey');
      const customerKey = searchParams.get('customerKey');
      const planId = searchParams.get('plan');

      if (!authKey || !customerKey || !planId) {
        return redirectWithError(origin, '/subscription', 'missing_params');
      }

      if (!PLAN_PRICES[planId]) {
        return redirectWithError(origin, '/subscription', 'invalid_plan');
      }

      // Get pro profile
      const { data: proProfileRaw } = await supabase
        .from('pro_profiles')
        .select('id, tier')
        .eq('user_id', user.id)
        .single();

      const proProfile = proProfileRaw as Tables<'pro_profiles'> | null;

      if (!proProfile) {
        return redirectWithError(origin, '/subscription', 'no_pro_profile');
      }

      // Issue billing key
      let billingResult;
      try {
        billingResult = await issueBillingKey(authKey, customerKey);
      } catch (err) {
        if (err instanceof TossPaymentError) {
          logger.error('Callback: billing key issue failed', {
            code: err.code,
            message: err.message,
            userId: user.id,
          });
          return redirectWithError(origin, '/subscription', 'billing_failed');
        }
        throw err;
      }

      // Execute first billing payment
      const planPrice = PLAN_PRICES[planId]!;
      const orderId = `sub-${planId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

      let billingPayment;
      try {
        billingPayment = await executeBillingPayment({
          billingKey: billingResult.billingKey,
          customerKey,
          amount: planPrice,
          orderId,
          orderName: `HelloNext ${planId === 'pro' ? 'Pro' : 'Academy'} 구독`,
        });
      } catch (err) {
        if (err instanceof TossPaymentError) {
          logger.error('Callback: first billing payment failed', {
            code: err.code,
            message: err.message,
            userId: user.id,
            planId,
          });
          return redirectWithError(origin, '/subscription', 'first_payment_failed');
        }
        throw err;
      }

      // Record payment
      await (supabase as any).from('payments').insert({
        user_id: user.id,
        toss_payment_key: billingPayment.paymentKey,
        amount: billingPayment.totalAmount,
        status: billingPayment.status,
        type: 'subscription',
        metadata: {
          plan_id: planId,
          order_id: billingPayment.orderId,
          approved_at: billingPayment.approvedAt,
          billing_key: billingResult.billingKey,
          customer_key: customerKey,
          card_info: billingResult.card ?? null,
        },
      });

      // Create/update subscription
      const now = new Date();
      const periodEnd = new Date();
      periodEnd.setMonth(periodEnd.getMonth() + 1);

      await (supabase as any)
        .from('subscriptions')
        .upsert(
          {
            pro_id: proProfile.id,
            tier: planId,
            status: 'active',
            toss_billing_key: billingResult.billingKey,
            current_period_start: now.toISOString(),
            current_period_end: periodEnd.toISOString(),
          },
          { onConflict: 'pro_id' }
        );

      // Update pro profile tier
      await (supabase as any)
        .from('pro_profiles')
        .update({ tier: planId })
        .eq('id', proProfile.id);

      logger.info('Callback: subscription created', {
        proId: proProfile.id,
        planId,
        amount: billingPayment.totalAmount,
        userId: user.id,
      });

      const successUrl = new URL('/subscription', origin);
      successUrl.searchParams.set('payment', 'success');
      successUrl.searchParams.set('plan', planId);
      return NextResponse.redirect(successUrl);
    }

    // Unknown type
    return redirectWithError(origin, '/', 'unknown_payment_type');
  } catch (err) {
    logger.error('Payments callback error', { error: err, type });
    const fallbackPath = type === 'coupon_bundle' ? '/coupons' : '/subscription';
    return redirectWithError(origin, fallbackPath, 'internal_error');
  }
}
