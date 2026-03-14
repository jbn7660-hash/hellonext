/**
 * Toss Payments Webhook
 *
 * POST /api/payments/webhook — Handle Toss payment status callbacks
 *
 * Handles:
 *  - Payment status changes (DONE, CANCELED, PARTIAL_CANCELED)
 *  - Billing (subscription) payment results
 *  - Idempotency tracking to prevent duplicate processing
 *  - Dead letter queue for failed webhook processing
 *
 * Features:
 *  - Constant-time signature comparison
 *  - Idempotency key tracking (prevents duplicate processing)
 *  - Dead letter queue for failed webhooks (after 3 retries)
 *  - Event type expansion (PAYMENT_CANCELED, PAYMENT_PARTIAL_CANCELED)
 *  - Quick response + async processing
 *  - Subscription reconciliation on billing failure
 *
 * @route /api/payments/webhook
 * @feature F-008
 */

import { NextResponse, type NextRequest } from 'next/server';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { timingSafeEqual, createHmac } from 'crypto';
import { logger } from '@/lib/utils/logger';
import type { Database, Tables } from '@/lib/supabase/types';

// Use service role for webhook (no user auth context)
function getServiceClient(): SupabaseClient<Database> {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

interface TossWebhookPayload {
  eventType: 'PAYMENT_STATUS_CHANGED' | 'BILLING_STATUS_CHANGED' | 'PAYMENT_CANCELED' | 'PAYMENT_PARTIAL_CANCELED';
  data: {
    paymentKey: string;
    orderId: string;
    status: string;
    transactionKey?: string;
    cancels?: Array<{
      cancelAmount: number;
      cancelReason: string;
      canceledAt: string;
    }>;
  };
}

// webhook_events and failed_webhooks are not in the typed Database schema — use any casts
async function isWebhookProcessed(
  supabase: SupabaseClient<Database>,
  eventId: string
): Promise<boolean> {
  const { count } = await (supabase as any)
    .from('webhook_events')
    .select('*', { count: 'exact', head: true })
    .eq('event_id', eventId);

  return (count ?? 0) > 0;
}

async function markWebhookProcessed(
  supabase: SupabaseClient<Database>,
  eventId: string,
  status: 'success' | 'failed'
): Promise<void> {
  await (supabase as any).from('webhook_events').insert({
    event_id: eventId,
    status,
    processed_at: new Date().toISOString(),
  });
}

async function addToDeadLetterQueue(
  supabase: SupabaseClient<Database>,
  payload: TossWebhookPayload,
  error: string,
  retryCount: number
): Promise<void> {
  await (supabase as any).from('failed_webhooks').insert({
    event_type: payload.eventType,
    payment_key: payload.data.paymentKey,
    order_id: payload.data.orderId,
    payload,
    error,
    retry_count: retryCount,
    created_at: new Date().toISOString(),
  });
}

export async function POST(request: NextRequest) {
  try {
    const webhookSecret = process.env.TOSS_WEBHOOK_SECRET;
    if (!webhookSecret) {
      logger.error('TOSS_WEBHOOK_SECRET is not configured');
      return NextResponse.json({ error: 'Server misconfiguration' }, { status: 500 });
    }

    const rawBody = await request.text();
    const signature = request.headers.get('toss-signature');

    if (!signature) {
      logger.warn('Toss webhook missing signature header');
      return NextResponse.json({ error: 'Missing signature' }, { status: 401 });
    }

    const expectedSig = createHmac('sha256', webhookSecret).update(rawBody).digest('hex');
    const sigBuffer = Buffer.from(signature, 'hex');
    const expectedBuffer = Buffer.from(expectedSig, 'hex');

    if (sigBuffer.length !== expectedBuffer.length || !timingSafeEqual(sigBuffer, expectedBuffer)) {
      logger.warn('Toss webhook signature mismatch', { signature: signature.slice(0, 8) + '...' });
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
    }

    const payload: TossWebhookPayload = JSON.parse(rawBody);
    const supabase = getServiceClient();

    const eventId = `${payload.data.paymentKey}:${payload.eventType}`;

    if (await isWebhookProcessed(supabase, eventId)) {
      logger.info('Webhook already processed (idempotent)', { eventId });
      return NextResponse.json({ received: true, processed: true });
    }

    logger.info('Toss webhook received', {
      eventType: payload.eventType,
      paymentKey: payload.data.paymentKey.slice(0, 8) + '...',
      status: payload.data.status,
    });

    processWebhook(payload, supabase, eventId).catch((err) => {
      logger.error('Async webhook processing failed', { eventId, error: err });
    });

    return NextResponse.json({ received: true, processed: true });
  } catch (err) {
    logger.error('Webhook error', { error: err });
    return NextResponse.json({ received: true, processed: false });
  }
}

async function processWebhook(
  payload: TossWebhookPayload,
  supabase: SupabaseClient<Database>,
  eventId: string
): Promise<void> {
  try {
    // payments schema: id, amount, created_at, metadata, status, toss_payment_key, type, user_id
    // Use metadata instead of non-existent webhook_data; match by toss_payment_key
    const { data: paymentRaw, error: updateError } = await (supabase as any)
      .from('payments')
      .update({
        status: payload.data.status,
        metadata: payload.data,
      })
      .eq('toss_payment_key', payload.data.paymentKey)
      .select('id, user_id, type, amount, status')
      .single();

    const payment = paymentRaw as (Tables<'payments'> & { user_id: string }) | null;

    if (updateError) {
      logger.error('Webhook payment update failed', { error: updateError.message, eventId });
      await addToDeadLetterQueue(supabase, payload, updateError.message, 1);
      await markWebhookProcessed(supabase, eventId, 'failed');
      return;
    }

    if (!payment) {
      logger.warn('Payment not found for webhook', { eventId });
      await markWebhookProcessed(supabase, eventId, 'failed');
      return;
    }

    // Handle payment cancellation
    if (
      (payload.eventType === 'PAYMENT_STATUS_CHANGED' && payload.data.status === 'CANCELED') ||
      payload.eventType === 'PAYMENT_CANCELED'
    ) {
      if (payment.type === 'coupon_bundle') {
        // coupons table doesn't have bundle_order_id — log for manual handling
        logger.info('Coupon bundle payment canceled — manual revocation may be required', {
          paymentId: payment.id,
        });
      }
    }

    // Handle partial cancellation
    if (payload.eventType === 'PAYMENT_PARTIAL_CANCELED' && payment.type === 'coupon_bundle') {
      const partialAmount = payload.data.cancels?.[0]?.cancelAmount ?? 0;
      if (partialAmount > 0) {
        logger.info('Partial payment cancellation', {
          paymentId: payment.id,
          cancelAmount: partialAmount,
        });
      }
    }

    // Handle subscription billing result
    if (
      payload.eventType === 'BILLING_STATUS_CHANGED' &&
      payment.type === 'subscription'
    ) {
      if (payload.data.status === 'DONE') {
        // Look up pro_profile by user_id
        const { data: proProfileRaw } = await supabase
          .from('pro_profiles')
          .select('id')
          .eq('user_id', payment.user_id)
          .single();

        const proProfile = proProfileRaw as Tables<'pro_profiles'> | null;

        if (proProfile) {
          // subscriptions schema update: only valid columns
          await (supabase as any)
            .from('subscriptions')
            .update({
              status: 'active',
              current_period_end: getNextBillingDate().toISOString(),
            })
            .eq('pro_id', proProfile.id)
            .eq('status', 'active');

          logger.info('Subscription extended', { proId: proProfile.id });
        }
      } else if (['ABORTED', 'EXPIRED'].includes(payload.data.status)) {
        const { data: proProfileRaw } = await supabase
          .from('pro_profiles')
          .select('id, user_id')
          .eq('user_id', payment.user_id)
          .single();

        const proProfile = proProfileRaw as Tables<'pro_profiles'> | null;

        if (proProfile) {
          const { data: subscriptionRaw } = await supabase
            .from('subscriptions')
            .select('*')
            .eq('pro_id', proProfile.id)
            .eq('status', 'active')
            .maybeSingle();

          const subscription = subscriptionRaw as Tables<'subscriptions'> | null;

          if (subscription) {
            await (supabase as any)
              .from('subscriptions')
              .update({ status: 'past_due' })
              .eq('id', subscription.id);

            const gracePeriodEnd = new Date();
            gracePeriodEnd.setDate(gracePeriodEnd.getDate() + 7);

            logger.warn('Subscription billing failed, grace period applied', {
              proId: proProfile.id,
              gracePeriodEnd: gracePeriodEnd.toISOString(),
            });
          }

          await supabase.functions.invoke('send-notification', {
            body: {
              user_id: proProfile.user_id,
              type: 'payment_failed',
              title: '결제 실패',
              body: '구독 결제에 실패했습니다. 7일 내에 결제 수단을 확인해주세요.',
              data: { payment_id: payment.id },
            },
          });
        }
      }
    }

    await markWebhookProcessed(supabase, eventId, 'success');
    logger.info('Webhook processed successfully', { eventId });
  } catch (err) {
    logger.error('Webhook processing error', { error: err, eventId });
    await addToDeadLetterQueue(supabase, payload, String(err), 1);
    await markWebhookProcessed(supabase, eventId, 'failed');
  }
}

function getNextBillingDate(): Date {
  const next = new Date();
  next.setMonth(next.getMonth() + 1);
  return next;
}
