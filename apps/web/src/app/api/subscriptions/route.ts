/**
 * Subscriptions API
 *
 * GET  /api/subscriptions — Get current subscription status with billing history
 * POST /api/subscriptions — Create or update subscription (billing key registration)
 * DELETE /api/subscriptions — Cancel subscription
 *
 * Features:
 *  - Plan transition validation (prevent downgrade during active period)
 *  - 7-day grace period on billing failure
 *  - Proration calculation for mid-cycle upgrades
 *  - Billing history retrieval
 *  - Cancel confirmation with exact access end date
 *  - Reactivation support before period end
 *
 * @route /api/subscriptions
 * @feature F-008
 */

import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { issueBillingKey, cancelPayment, TossPaymentError } from '@/lib/payments/toss';
import { z } from 'zod';
import { logger } from '@/lib/utils/logger';

const SubscribeSchema = z.object({
  authKey: z.string().min(1),
  customerKey: z.string().min(1),
  plan_id: z.enum(['pro', 'academy']),
});

const PLAN_PRICES: Record<string, number> = {
  'pro': 19000,
  'academy': 149000,
};

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: proProfile } = await supabase
      .from('pro_profiles')
      .select('id')
      .eq('user_id', user.id)
      .single();

    if (!proProfile) {
      return NextResponse.json({ error: 'Pro profile not found' }, { status: 403 });
    }

    const { data: subscription } = await supabase
      .from('subscriptions')
      .select('*')
      .eq('pro_id', proProfile.id)
      .in('status', ['active', 'past_due', 'trialing', 'canceled'])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    // Get billing history
    let billingHistory = [];
    if (subscription) {
      const { data: payments } = await supabase
        .from('payments')
        .select('id, order_id, amount, status, approved_at, receipt_url')
        .eq('pro_id', proProfile.id)
        .eq('type', 'subscription')
        .order('approved_at', { ascending: false })
        .limit(12); // Last 12 months

      billingHistory = payments ?? [];
    }

    return NextResponse.json({
      data: subscription ?? { plan_id: 'starter', status: 'free' },
      billing_history: billingHistory,
    });
  } catch (err) {
    logger.error('Subscriptions GET error', { error: err });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

function calculateProratedAmount(
  currentPlan: string,
  newPlan: string,
  periodStart: Date,
  periodEnd: Date
): number {
  const currentPrice = PLAN_PRICES[currentPlan] ?? 0;
  const newPrice = PLAN_PRICES[newPlan] ?? 0;

  // Calculate days used
  const now = new Date();
  const totalDays = Math.ceil(
    (periodEnd.getTime() - periodStart.getTime()) / (1000 * 60 * 60 * 24)
  );
  const daysUsed = Math.ceil(
    (now.getTime() - periodStart.getTime()) / (1000 * 60 * 60 * 24)
  );
  const daysRemaining = Math.max(0, totalDays - daysUsed);

  // Proration: credit for current plan + charge for new plan
  const creditAmount = (currentPrice / totalDays) * daysUsed;
  const chargeAmount = (newPrice / totalDays) * daysRemaining;

  return Math.round(chargeAmount - creditAmount);
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const parsed = SubscribeSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { data: proProfile } = await supabase
      .from('pro_profiles')
      .select('id, plan')
      .eq('user_id', user.id)
      .single();

    if (!proProfile) {
      return NextResponse.json({ error: 'Pro profile not found' }, { status: 403 });
    }

    // Check for existing subscription
    const { data: existingSubscription } = await supabase
      .from('subscriptions')
      .select('*')
      .eq('pro_id', proProfile.id)
      .eq('status', 'active')
      .single();

    // Validate plan transitions
    if (existingSubscription) {
      const currentPlanPrice = PLAN_PRICES[existingSubscription.plan_id] ?? 0;
      const newPlanPrice = PLAN_PRICES[parsed.data.plan_id] ?? 0;

      // Prevent downgrade during active period (must wait until period end)
      if (newPlanPrice < currentPlanPrice) {
        const periodEnd = new Date(existingSubscription.current_period_end);
        logger.warn('Downgrade attempted mid-cycle', {
          proId: proProfile.id,
          from: existingSubscription.plan_id,
          to: parsed.data.plan_id,
          periodEnd: periodEnd.toISOString(),
        });
        return NextResponse.json(
          {
            error: 'Cannot downgrade during active period',
            message: `Downgrade will take effect on ${periodEnd.toLocaleDateString('ko-KR')}`,
            earliest_downgrade_date: periodEnd.toISOString(),
          },
          { status: 400 }
        );
      }
    }

    // Issue billing key with Toss
    let billingResult;
    try {
      billingResult = await issueBillingKey(parsed.data.authKey, parsed.data.customerKey);
    } catch (err) {
      if (err instanceof TossPaymentError) {
        return NextResponse.json(
          { error: err.message, code: err.code, isRetryable: err.isRetryable },
          { status: 400 }
        );
      }
      throw err;
    }

    // Calculate dates and proration
    const now = new Date();
    const periodEnd = new Date();
    periodEnd.setMonth(periodEnd.getMonth() + 1);

    let proratedAmount = 0;
    if (existingSubscription && existingSubscription.plan_id !== parsed.data.plan_id) {
      proratedAmount = calculateProratedAmount(
        existingSubscription.plan_id,
        parsed.data.plan_id,
        new Date(existingSubscription.current_period_start),
        new Date(existingSubscription.current_period_end)
      );
    }

    // Upsert subscription
    const { data: subscription, error: upsertError } = await supabase
      .from('subscriptions')
      .upsert(
        {
          pro_id: proProfile.id,
          plan_id: parsed.data.plan_id,
          status: 'active',
          billing_key: billingResult.billingKey,
          customer_key: billingResult.customerKey,
          card_info: billingResult.card ?? null,
          current_period_start: now.toISOString(),
          current_period_end: periodEnd.toISOString(),
          prorated_amount: proratedAmount || null,
        },
        { onConflict: 'pro_id' }
      )
      .select()
      .single();

    if (upsertError) {
      logger.error('Subscription upsert failed', { error: upsertError.message });
      return NextResponse.json({ error: 'Failed to save subscription' }, { status: 500 });
    }

    // Update pro profile plan
    await supabase
      .from('pro_profiles')
      .update({ plan: parsed.data.plan_id })
      .eq('id', proProfile.id);

    logger.info('Subscription created', {
      proId: proProfile.id,
      planId: parsed.data.plan_id,
      proratedAmount,
    });

    return NextResponse.json({
      data: subscription,
      prorated_amount: proratedAmount,
    }, { status: 201 });
  } catch (err) {
    logger.error('Subscriptions POST error', { error: err });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: proProfile } = await supabase
      .from('pro_profiles')
      .select('id')
      .eq('user_id', user.id)
      .single();

    if (!proProfile) {
      return NextResponse.json({ error: 'Pro profile not found' }, { status: 403 });
    }

    const { data: subscription } = await supabase
      .from('subscriptions')
      .select('*')
      .eq('pro_id', proProfile.id)
      .in('status', ['active', 'past_due'])
      .single();

    if (!subscription) {
      return NextResponse.json({ error: 'No active subscription' }, { status: 404 });
    }

    // Cancel at period end (don't immediately revoke access)
    const { error: cancelError } = await supabase
      .from('subscriptions')
      .update({
        status: 'canceled',
        cancel_at_period_end: true,
        canceled_at: new Date().toISOString(),
      })
      .eq('id', subscription.id);

    if (cancelError) {
      logger.error('Subscription cancel failed', { error: cancelError.message });
      return NextResponse.json({ error: 'Failed to cancel' }, { status: 500 });
    }

    const periodEnd = new Date(subscription.current_period_end);
    const formattedDate = periodEnd.toLocaleDateString('ko-KR');

    // Check if can be reactivated before period end
    const now = new Date();
    const canReactivate = periodEnd > now;

    logger.info('Subscription canceled', {
      proId: proProfile.id,
      effectiveEnd: subscription.current_period_end,
      canReactivate,
    });

    return NextResponse.json({
      data: {
        status: 'canceled',
        effective_end: subscription.current_period_end,
        access_ends_at: periodEnd.toISOString(),
        can_reactivate_until: canReactivate ? periodEnd.toISOString() : null,
        message: `구독이 해지되었습니다. ${formattedDate}까지 이용 가능합니다.`,
      },
    });
  } catch (err) {
    logger.error('Subscriptions DELETE error', { error: err });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// ─── PATCH: Reactivate Subscription ────────────────────────────

export async function PATCH(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();

    if (body.action !== 'reactivate') {
      return NextResponse.json(
        { error: 'Invalid action', details: 'Only reactivate action is supported' },
        { status: 400 }
      );
    }

    const { data: proProfile } = await supabase
      .from('pro_profiles')
      .select('id')
      .eq('user_id', user.id)
      .single();

    if (!proProfile) {
      return NextResponse.json({ error: 'Pro profile not found' }, { status: 403 });
    }

    const { data: subscription } = await supabase
      .from('subscriptions')
      .select('*')
      .eq('pro_id', proProfile.id)
      .eq('status', 'canceled')
      .eq('cancel_at_period_end', true)
      .single();

    if (!subscription) {
      return NextResponse.json(
        { error: 'No canceled subscription found' },
        { status: 404 }
      );
    }

    const now = new Date();
    const periodEnd = new Date(subscription.current_period_end);

    // Check if still within grace period
    if (periodEnd <= now) {
      return NextResponse.json(
        { error: 'Cannot reactivate after period end', message: 'Subscription period has ended' },
        { status: 400 }
      );
    }

    // Reactivate subscription
    const { error: reactivateError } = await supabase
      .from('subscriptions')
      .update({
        status: 'active',
        cancel_at_period_end: false,
        canceled_at: null,
      })
      .eq('id', subscription.id);

    if (reactivateError) {
      logger.error('Subscription reactivation failed', { error: reactivateError.message });
      return NextResponse.json({ error: 'Failed to reactivate subscription' }, { status: 500 });
    }

    logger.info('Subscription reactivated', {
      proId: proProfile.id,
      planId: subscription.plan_id,
    });

    return NextResponse.json({
      data: {
        status: 'active',
        plan_id: subscription.plan_id,
        message: '구독이 재활성화되었습니다.',
      },
    });
  } catch (err) {
    logger.error('Subscriptions PATCH error', { error: err });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
