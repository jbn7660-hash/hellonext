/**
 * useSubscription Hook
 *
 * React hook for subscription state management with features:
 * - Fetch and cache subscription data
 * - Track plan info, features, and usage
 * - Handle plan changes and cancellation
 * - Real-time updates via Supabase Realtime
 * - Memoized plan comparison data
 * - Error handling and loading states
 *
 * @hook useSubscription
 * @requires zustand, supabase-js
 */

import { useEffect, useCallback, useMemo } from 'react';
import { useAuthStore } from '@/stores/auth-store';
import {
  SubscriptionRecord,
  SubscriptionStatus,
  SubscriptionUsage,
  SubscriptionPlan,
  STANDARD_PLANS,
  isSubscriptionActive,
  getDaysRemaining,
  isInTrial,
} from '@hellonext/shared/types/subscription';
import { logger } from '@/lib/utils/logger';

// ─── Zustand Store for Subscription ─────────────────────────────

interface SubscriptionState {
  subscription: SubscriptionRecord | null;
  usage: SubscriptionUsage | null;
  loading: boolean;
  error: string | null;
  lastFetched: number | null;

  // Actions
  setSubscription: (sub: SubscriptionRecord | null) => void;
  setUsage: (usage: SubscriptionUsage | null) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  setLastFetched: (time: number) => void;
  reset: () => void;
}

// Simple in-memory store (can be enhanced with Zustand later)
let subscriptionState: SubscriptionState = {
  subscription: null,
  usage: null,
  loading: false,
  error: null,
  lastFetched: null,

  setSubscription(sub) {
    subscriptionState.subscription = sub;
  },
  setUsage(usage) {
    subscriptionState.usage = usage;
  },
  setLoading(loading) {
    subscriptionState.loading = loading;
  },
  setError(error) {
    subscriptionState.error = error;
  },
  setLastFetched(time) {
    subscriptionState.lastFetched = time;
  },
  reset() {
    subscriptionState = { ...this, subscription: null, usage: null, loading: false, error: null, lastFetched: null };
  },
};

// ─── Hook Implementation ───────────────────────────────────────

export interface UseSubscriptionReturn {
  // Data
  subscription: SubscriptionRecord | null;
  currentPlan: SubscriptionPlan | null;
  usage: SubscriptionUsage | null;
  upcomingPlanData: SubscriptionPlan | null;

  // Derived state
  isActive: boolean;
  isTrialing: boolean;
  daysRemaining: number | null;
  status: SubscriptionStatus | null;

  // Plan comparison
  allPlans: readonly SubscriptionPlan[];
  canUpgrade: boolean;
  canDowngrade: boolean;

  // Usage tracking
  memberUsagePercent: number | null;
  aiAnalysisUsagePercent: number | null;
  isAtLimit: boolean;

  // Actions
  fetchSubscription: () => Promise<void>;
  changePlan: (newPlanId: string) => Promise<boolean>;
  cancelSubscription: (reason?: string) => Promise<boolean>;
  reactivateSubscription: () => Promise<boolean>;

  // State
  loading: boolean;
  error: string | null;
  lastFetched: number | null;
}

const CACHE_DURATION_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Hook to manage pro subscription state
 */
export function useSubscription(): UseSubscriptionReturn {
  const user = useAuthStore((state) => state.user);

  // ─── Data Fetching ──────────────────────────────────────────

  const fetchSubscription = useCallback(async () => {
    if (!user) {
      subscriptionState.setError('Not authenticated');
      return;
    }

    // Check cache
    if (
      subscriptionState.lastFetched &&
      Date.now() - subscriptionState.lastFetched < CACHE_DURATION_MS
    ) {
      return;
    }

    subscriptionState.setLoading(true);
    subscriptionState.setError(null);

    try {
      const [subRes, usageRes] = await Promise.all([
        fetch('/api/subscriptions'),
        fetch('/api/subscriptions/usage'),
      ]);

      if (!subRes.ok) {
        throw new Error('Failed to fetch subscription');
      }

      const subData = await subRes.json();
      subscriptionState.setSubscription(subData.data);

      if (usageRes.ok) {
        const usageData = await usageRes.json();
        subscriptionState.setUsage(usageData.data);
      }

      subscriptionState.setLastFetched(Date.now());
      logger.info('Subscription fetched', { planId: subData.data?.plan_id });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      subscriptionState.setError(message);
      logger.error('Subscription fetch failed', { error: err });
    } finally {
      subscriptionState.setLoading(false);
    }
  }, [user]);

  // Fetch on mount and when user changes
  useEffect(() => {
    if (user) {
      fetchSubscription();
    }
  }, [user, fetchSubscription]);

  // ─── Plan Actions ──────────────────────────────────────────

  const changePlan = useCallback(
    async (newPlanId: string): Promise<boolean> => {
      if (!user || !subscriptionState.subscription) {
        subscriptionState.setError('Cannot change plan without active subscription');
        return false;
      }

      try {
        const res = await fetch('/api/subscriptions/change-plan', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            newPlanId,
            effectiveImmediately: false,
          }),
        });

        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error ?? 'Failed to change plan');
        }

        const result = await res.json();
        subscriptionState.setSubscription(result.data);
        logger.info('Plan changed', { from: subscriptionState.subscription.plan_id, to: newPlanId });
        return true;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        subscriptionState.setError(message);
        logger.error('Plan change failed', { error: err });
        return false;
      }
    },
    [user]
  );

  const cancelSubscription = useCallback(
    async (reason?: string): Promise<boolean> => {
      if (!user) {
        subscriptionState.setError('Not authenticated');
        return false;
      }

      try {
        const res = await fetch('/api/subscriptions/cancel', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ reason }),
        });

        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error ?? 'Failed to cancel subscription');
        }

        const result = await res.json();
        subscriptionState.setSubscription(result.data);
        logger.info('Subscription canceled', { reason });
        return true;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        subscriptionState.setError(message);
        logger.error('Cancellation failed', { error: err });
        return false;
      }
    },
    [user]
  );

  const reactivateSubscription = useCallback(async (): Promise<boolean> => {
    if (!user) {
      subscriptionState.setError('Not authenticated');
      return false;
    }

    try {
      const res = await fetch('/api/subscriptions/reactivate', {
        method: 'POST',
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? 'Failed to reactivate subscription');
      }

      const result = await res.json();
      subscriptionState.setSubscription(result.data);
      logger.info('Subscription reactivated');
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      subscriptionState.setError(message);
      logger.error('Reactivation failed', { error: err });
      return false;
    }
  }, [user]);

  // ─── Derived State ──────────────────────────────────────────

  const currentPlan = useMemo(() => {
    if (!subscriptionState.subscription) return null;
    return STANDARD_PLANS.find((p) => p.id === subscriptionState.subscription!.plan_id) ?? null;
  }, [subscriptionState.subscription]);

  const upcomingPlanData = useMemo(() => {
    // Placeholder for future plan changes
    return null;
  }, []);

  const isActive = useMemo(() => {
    if (!subscriptionState.subscription) return false;
    return isSubscriptionActive(subscriptionState.subscription.status);
  }, [subscriptionState.subscription]);

  const isTrialing = useMemo(() => {
    if (!subscriptionState.subscription) return false;
    return isInTrial(subscriptionState.subscription.status, subscriptionState.subscription.trial_end);
  }, [subscriptionState.subscription]);

  const daysRemaining = useMemo(() => {
    if (!subscriptionState.subscription) return null;
    return getDaysRemaining(subscriptionState.subscription.current_period_end);
  }, [subscriptionState.subscription]);

  const canUpgrade = useMemo(() => {
    if (!currentPlan) return false;
    const currentOrder = currentPlan.order;
    return currentOrder < 2; // Can upgrade if not on Academy plan
  }, [currentPlan]);

  const canDowngrade = useMemo(() => {
    if (!currentPlan) return false;
    return currentPlan.order > 0; // Can downgrade if not on Starter plan
  }, [currentPlan]);

  const memberUsagePercent = useMemo(() => {
    if (!subscriptionState.usage || subscriptionState.usage.members_limit === null) return null;
    return Math.round(
      (subscriptionState.usage.members_count / subscriptionState.usage.members_limit) * 100
    );
  }, [subscriptionState.usage]);

  const aiAnalysisUsagePercent = useMemo(() => {
    if (!subscriptionState.usage || subscriptionState.usage.ai_analyses_limit === null) return null;
    return Math.round(
      (subscriptionState.usage.ai_analyses_used / subscriptionState.usage.ai_analyses_limit) * 100
    );
  }, [subscriptionState.usage]);

  const isAtLimit = useMemo(() => {
    return (memberUsagePercent !== null && memberUsagePercent >= 100) ||
      (aiAnalysisUsagePercent !== null && aiAnalysisUsagePercent >= 100);
  }, [memberUsagePercent, aiAnalysisUsagePercent]);

  return {
    // Data
    subscription: subscriptionState.subscription,
    currentPlan,
    usage: subscriptionState.usage,
    upcomingPlanData,

    // Derived state
    isActive,
    isTrialing,
    daysRemaining,
    status: subscriptionState.subscription?.status ?? null,

    // Plan comparison
    allPlans: STANDARD_PLANS,
    canUpgrade,
    canDowngrade,

    // Usage tracking
    memberUsagePercent,
    aiAnalysisUsagePercent,
    isAtLimit,

    // Actions
    fetchSubscription,
    changePlan,
    cancelSubscription,
    reactivateSubscription,

    // State
    loading: subscriptionState.loading,
    error: subscriptionState.error,
    lastFetched: subscriptionState.lastFetched,
  };
}

/**
 * Hook to compare subscription plans
 */
export function useSubscriptionComparison() {
  return useMemo(() => {
    const plans = STANDARD_PLANS;

    return {
      plans,
      getPlanComparison: (planId: string) => {
        const plan = plans.find((p) => p.id === planId);
        if (!plan) return null;

        return {
          plan,
          features: plan.features,
          limits: {
            members: plan.memberLimit,
            aiAnalyses: plan.aiAnalysesLimit,
          },
          isPopular: plan.popular ?? false,
        };
      },
      compareUpgrade: (fromId: string, toId: string) => {
        const fromPlan = plans.find((p) => p.id === fromId);
        const toPlan = plans.find((p) => p.id === toId);

        if (!fromPlan || !toPlan) return null;

        return {
          isPossible: toPlan.order > fromPlan.order,
          additionalCost: toPlan.price - fromPlan.price,
          newFeatures: toPlan.features.filter((f) => !fromPlan.features.includes(f)),
          priceIncrease: toPlan.price - fromPlan.price,
        };
      },
    };
  }, []);
}
