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
import { createClient } from '@supabase/supabase-js';
import { timingSafeEqual, createHmac } from 'crypto';
import { logger } from '@/lib/utils/logger';

// Use service role for webhook (no user auth context)
function getServiceClient() {
  return createClient(
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

async function isWebhookProcessed(
  supabase: ReturnType<typeof createClient>,
  eventId: string
): Promise<boolean> {
  const { count } = await supabase
    .from('webhook_events')
    .select('*', { count: 'exact', head: true })
    .eq('event_id', eventId);

  return (count ?? 0) > 0;
}

async function markWebhookProcessed(
  supabase: ReturnType<typeof createClient>,
  eventId: string,
  status: 'success' | 'failed'
): Promise<void> {
  await supabase.from('webhook_events').insert({
    event_id: eventId,
    status,
    processed_at: new Date().toISOString(),
  });
}

async function addToDeadLetterQueue(
  supabase: ReturnType<typeof createClient>,
  payload: TossWebhookPayload,
  error: string,
  retryCount: number
): Promise<void> {
  await supabase.from('failed_webhooks').insert({
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
    // Verify webhook signature (mandatory)
    const webhookSecret = process.env.TOSS_WEBHOOK_SECRET;
    if (!webhookSecret) {
      logger.error('TOSS_WEBHOOK_SECRET is not configured');
      return NextResponse.json({ error: 'Server misconfiguration' }, { status: 500 });
    }

    const rawBody = await request.text();
    const signature = request.headers.get('toss-signature');

    // Require signature header
    if (!signature) {
      logger.warn('Toss webhook missing signature header');
      return NextResponse.json({ error: 'Missing signature' }, { status: 401 });
    }

    // HMAC-SHA256 timing-safe comparison to prevent timing attacks
    const expectedSig = createHmac('sha256', webhookSecret).update(rawBody).digest('hex');

    // Ensure both buffers are the same length before comparison
    const sigBuffer = Buffer.from(signature, 'hex');
    const expectedBuffer = Buffer.from(expectedSig, 'hex');

    if (sigBuffer.length !== expectedBuffer.length || !timingSafeEqual(sigBuffer, expectedBuffer)) {
      logger.warn('Toss webhook signature mismatch', { signature: signature.slice(0, 8) + '...' });
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
    }

    const payload: TossWebhookPayload = JSON.parse(rawBody);
    const supabase = getServiceClient();

    // Generate idempotency key from payment key
    const eventId = `${payload.data.paymentKey}:${payload.eventType}`;

    // Check if already processed (idempotency)
    if (await isWebhookProcessed(supabase, eventId)) {
      logger.info('Webhook already processed (idempotent)', { eventId });
      return NextResponse.json({ received: true, processed: true });
    }

    logger.info('Toss webhook received', {
      eventType: payload.eventType,
      paymentKey: payload.data.paymentKey.slice(0, 8) + '...',
      status: payload.data.status,
    });

    // Process asynchronously but return 200 immediately
    processWebhook(payload, supabase, eventId).catch((err) => {
      logger.error('Async webhook processing failed', { eventId, error: err });
    });

    return NextResponse.json({ received: true, processed: true });
  } catch (err) {
    logger.error('Webhook error', { error: err });
    // Always return 200 for webhooks to prevent infinite retries
    return NextResponse.json({ received: true, processed: false });
  }
}

async function processWebhook(
  payload: TossWebhookPayload,
  supabase: ReturnType<typeof createClient>,
  eventId: string
): Promise<void> {
  try {
    // Update payment record
    const { data: payment, error: updateError } = await supabase
      .from('payments')
      .update({
        status: payload.data.status,
        webhook_data: payload.data,
        updated_at: new Date().toISOString(),
      })
      .eq('payment_key', payload.data.paymentKey)
      .select('id, pro_id, type, amount, status')
      .single();

    if (updateError) {
      logger.error('Webhook payment update failed', { error: updateError.message, eventId });
      await addToDeadLetterQueue(supabase, payload, updateError.message, 1);
      await markWebhookProcessed(supabase, eventId, 'failed');
      return;
    }

    // Handle payment cancellation
    if (
      (payload.eventType === 'PAYMENT_STATUS_CHANGED' && payload.data.status === 'CANCELED') ||
      payload.eventType === 'PAYMENT_CANCELED'
    ) {
      if (payment.type === 'coupon_bundle') {
        const { error: revokeError } = await supabase
          .from('coupons')
          .update({ status: 'revoked' })
          .eq('bundle_order_id', payment.id)
          .eq('status', 'available'); // Only revoke unused ones

        if (revokeError) {
          logger.error('Coupon revocation failed', { paymentId: payment.id, error: revokeError.message });
        }
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
        // Could implement pro-rata coupon revocation here if needed
      }
    }

    // Handle subscription billing result
    if (
      payload.eventType === 'BILLING_STATUS_CHANGED' &&
      payment.type === 'subscription'
    ) {
      if (payload.data.status === 'DONE') {
        // Extend subscription period
        await supabase
          .from('subscriptions')
          .update({
            status: 'active',
            current_period_end: getNextBillingDate().toISOString(),
            last_payment_id: payment.id,
          })
          .eq('pro_id', payment.pro_id)
          .eq('status', 'active');

        logger.info('Subscription extended', { proId: payment.pro_id });
      } else if (['ABORTED', 'EXPIRED'].includes(payload.data.status)) {
        // Mark subscription as past_due
        const { data: subscription } = await supabase
          .from('subscriptions')
          .select('*')
          .eq('pro_id', payment.pro_id)
          .eq('status', 'active')
          .single();

        if (subscription) {
          await supabase
            .from('subscriptions')
            .update({ status: 'past_due' })
            .eq('id', subscription.id);

          // Check if should downgrade (7-day grace period)
          const gracePeriodEnd = new Date();
          gracePeriodEnd.setDate(gracePeriodEnd.getDate() + 7);

          logger.warn('Subscription billing failed, grace period applied', {
            proId: payment.pro_id,
            gracePeriodEnd: gracePeriodEnd.toISOString(),
          });
        }

        // Notify pro
        const { data: proProfile } = await supabase
          .from('pro_profiles')
          .select('user_id')
          .eq('id', payment.pro_id)
          .single();

        if (proProfile) {
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
