/**
 * Subscription Types
 *
 * Type definitions for subscription plans, billing, and pro account management.
 *
 * @module types/subscription
 */

// ─── Status and Lifecycle ──────────────────────────────────────

export type SubscriptionStatus =
  | 'active'
  | 'trialing'
  | 'past_due'
  | 'canceled'
  | 'expired';

export type BillingCycle = 'monthly' | 'annual';

// ─── Plan Definition ────────────────────────────────────────────

/**
 * Subscription plan definition
 */
export interface SubscriptionPlan {
  readonly id: string;
  readonly name: string;
  readonly description?: string;
  readonly price: number; // in KRW (₩)
  readonly billingCycle: BillingCycle;
  readonly features: readonly string[];
  // Plan limits
  readonly memberLimit: number | null; // null = unlimited
  readonly aiAnalysesLimit: number | null; // null = unlimited
  readonly prioritySupport: boolean;
  readonly apiAccess: boolean;
  // Metadata
  readonly popular?: boolean;
  readonly order: number; // for sorting Starter(0) < Pro(1) < Academy(2)
}

// ─── Subscription Record ───────────────────────────────────────

/**
 * Complete subscription record in database
 */
export interface SubscriptionRecord {
  readonly id: string;
  readonly pro_user_id: string;
  readonly plan_id: string;
  readonly status: SubscriptionStatus;
  readonly billing_cycle: BillingCycle;
  // Period dates
  readonly current_period_start: string; // ISO 8601
  readonly current_period_end: string; // ISO 8601
  readonly trial_start?: string | null; // ISO 8601
  readonly trial_end?: string | null; // ISO 8601
  // Billing
  readonly billing_key?: string | null; // TossPayments billing key
  readonly card_info?: {
    readonly issuerCode: string;
    readonly issuerName: string;
    readonly number: string; // last 4 digits
  } | null;
  // Metadata
  readonly created_at: string; // ISO 8601
  readonly updated_at: string; // ISO 8601
  readonly canceled_at?: string | null; // ISO 8601
  readonly cancellation_reason?: string | null;
}

// ─── Usage and Limits ──────────────────────────────────────────

/**
 * Current usage within subscription plan
 */
export interface SubscriptionUsage {
  readonly pro_user_id: string;
  readonly members_count: number;
  readonly members_limit: number | null;
  readonly ai_analyses_used: number;
  readonly ai_analyses_limit: number | null;
  readonly api_calls_used?: number;
  readonly api_calls_limit?: number | null;
  readonly storage_used_mb?: number;
  readonly storage_limit_mb?: number | null;
}

/**
 * Check if plan limit is reached
 */
export interface PlanLimitStatus {
  readonly members: {
    readonly used: number;
    readonly limit: number | null;
    readonly percent: number; // 0-100
    readonly reached: boolean;
  };
  readonly aiAnalyses: {
    readonly used: number;
    readonly limit: number | null;
    readonly percent: number; // 0-100
    readonly reached: boolean;
  };
}

// ─── Plan Transitions ──────────────────────────────────────────

/**
 * Plan change (upgrade/downgrade)
 */
export interface PlanTransition {
  readonly fromPlanId: string;
  readonly toPlanId: string;
  readonly fromPrice: number;
  readonly toPrice: number;
  readonly proratedAmount: number; // can be positive (charge) or negative (credit)
  readonly effectiveDate: string; // ISO 8601
  readonly reason: 'upgrade' | 'downgrade' | 'admin_change';
}

// ─── API Request/Response ──────────────────────────────────────

/**
 * Request to change subscription plan
 */
export interface SubscriptionChangeRequest {
  readonly newPlanId: string;
  readonly effectiveImmediately?: boolean; // default: false (at end of period)
}

/**
 * Request to cancel subscription
 */
export interface SubscriptionCancelRequest {
  readonly reason?: string;
  readonly feedback?: string;
  readonly effectiveAt?: 'immediate' | 'period_end'; // default: period_end
}

/**
 * Subscription response for API
 */
export interface SubscriptionResponse {
  readonly id: string;
  readonly plan: SubscriptionPlan;
  readonly status: SubscriptionStatus;
  readonly currentPeriodStart: string;
  readonly currentPeriodEnd: string;
  readonly trialEnd?: string | null;
  readonly cardInfo?: {
    readonly issuerName: string;
    readonly number: string;
  } | null;
  readonly canceledAt?: string | null;
}

// ─── Billing Information ───────────────────────────────────────

/**
 * Upcoming invoice/billing info
 */
export interface UpcomingBilling {
  readonly pro_user_id: string;
  readonly plan_id: string;
  readonly amount: number;
  readonly currency: 'KRW';
  readonly billingDate: string; // ISO 8601
  readonly description: string;
  readonly autoRenewal: boolean;
}

// ─── Query/Filter Types ────────────────────────────────────────

/**
 * Filter options for subscription list
 */
export interface SubscriptionFilter {
  readonly status?: SubscriptionStatus;
  readonly planId?: string;
  readonly createdAfter?: string; // ISO 8601
  readonly createdBefore?: string; // ISO 8601
  readonly limit?: number;
  readonly offset?: number;
}

// ─── Error Types ───────────────────────────────────────────────

/**
 * Subscription-specific error
 */
export interface SubscriptionError {
  readonly code: string;
  readonly message: string;
  readonly type:
    | 'plan_not_found'
    | 'invalid_transition'
    | 'billing_failure'
    | 'usage_limit_exceeded'
    | 'unknown';
  readonly timestamp: string;
}

// ─── Helper Functions ──────────────────────────────────────────

/**
 * Check if subscription is active and payment methods valid
 */
export function isSubscriptionActive(status: SubscriptionStatus): boolean {
  return status === 'active' || status === 'trialing';
}

/**
 * Check if subscription requires intervention (past_due, etc.)
 */
export function isSubscriptionAtRisk(status: SubscriptionStatus): boolean {
  return status === 'past_due';
}

/**
 * Check if cancellation can be reversed
 */
export function canReactivateSubscription(status: SubscriptionStatus): boolean {
  return status === 'canceled';
}

/**
 * Calculate days remaining in current period
 */
export function getDaysRemaining(periodEnd: string): number {
  const end = new Date(periodEnd);
  const now = new Date();
  const diffMs = end.getTime() - now.getTime();
  return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
}

/**
 * Check if in trial period
 */
export function isInTrial(status: SubscriptionStatus, trialEnd?: string | null): boolean {
  if (status !== 'trialing' || !trialEnd) return false;
  return new Date(trialEnd) > new Date();
}

/**
 * Get human-readable subscription status label (Korean)
 */
export function getSubscriptionStatusLabel(status: SubscriptionStatus): string {
  const labels: Record<SubscriptionStatus, string> = {
    active: '활성',
    trialing: '트라이얼 중',
    past_due: '결제 대기중',
    canceled: '해지됨',
    expired: '만료됨',
  };
  return labels[status] ?? status;
}

/**
 * Get human-readable plan name with price
 */
export function getPlanDisplayName(plan: SubscriptionPlan): string {
  return `${plan.name} (${plan.price.toLocaleString()}원/월)`;
}

/**
 * Determine upgrade/downgrade
 */
export function getPlanTransitionType(fromOrder: number, toOrder: number): 'upgrade' | 'downgrade' | 'lateral' {
  if (toOrder > fromOrder) return 'upgrade';
  if (toOrder < fromOrder) return 'downgrade';
  return 'lateral';
}

// ─── Standard Plans ───────────────────────────────────────────

/**
 * Standard subscription plans available
 */
export const STANDARD_PLANS: readonly SubscriptionPlan[] = [
  {
    id: 'starter',
    name: 'Starter',
    description: '골프 레슨 시작',
    price: 0,
    billingCycle: 'monthly',
    memberLimit: 5,
    aiAnalysesLimit: 10,
    prioritySupport: false,
    apiAccess: false,
    features: ['회원 5명', '기본 AI 분석', '기본 레포트'],
    order: 0,
  },
  {
    id: 'pro',
    name: 'Pro',
    description: '더 많은 회원 관리',
    price: 19000,
    billingCycle: 'monthly',
    memberLimit: null, // unlimited
    aiAnalysesLimit: null, // unlimited
    prioritySupport: true,
    apiAccess: false,
    features: [
      '회원 무제한',
      'AI 분석 무제한',
      '고급 레포트',
      '우선 지원',
      '무료 쿠폰 3장',
    ],
    popular: true,
    order: 1,
  },
  {
    id: 'academy',
    name: 'Academy',
    description: '다중 프로 관리',
    price: 149000,
    billingCycle: 'monthly',
    memberLimit: null, // unlimited
    aiAnalysesLimit: null, // unlimited
    prioritySupport: true,
    apiAccess: true,
    features: [
      '전체 Pro 기능',
      'API 접근',
      '다중 프로 계정',
      '전용 계정 관리자',
      '커스텀 통합',
      '우선 기술 지원',
    ],
    order: 2,
  },
] as const;

/**
 * Get plan by ID
 */
export function getPlanById(planId: string): SubscriptionPlan | undefined {
  return STANDARD_PLANS.find((p) => p.id === planId);
}

/**
 * Get all plans sorted by order
 */
export function getAllPlans(): readonly SubscriptionPlan[] {
  return STANDARD_PLANS;
}
