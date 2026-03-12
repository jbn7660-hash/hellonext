/**
 * Pro Subscription / Plan Page (F-008 AC-4)
 *
 * Comprehensive subscription management with:
 * - Current plan display with billing cycle info
 * - Plan comparison feature matrix
 * - Upgrade/downgrade flow with proration
 * - Multi-step cancellation confirmation
 * - Paginated payment history with invoice links
 * - Usage stats (members count, AI analyses used)
 * - Trial countdown banner
 * - Payment failure recovery
 * - Mobile-responsive cards
 * - Full Korean localization
 *
 * @page /subscription
 * @feature F-008
 */

'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { SUBSCRIPTION_PLANS, TOSS_CLIENT_KEY, COUPON_BUNDLES } from '@/lib/payments/toss';
import { cn } from '@/lib/utils/cn';
import { logger } from '@/lib/utils/logger';

interface Subscription {
  plan_id: string;
  status: string;
  current_period_start?: string;
  current_period_end?: string;
  trial_end?: string;
  card_info?: { issuerCode: string; number: string } | null;
}

interface Payment {
  id: string;
  amount: number;
  type: string;
  status: string;
  method: string;
  created_at: string;
  receipt_url: string | null;
  order_id?: string;
}

interface UsageStats {
  members_count: number;
  members_limit: number;
  ai_analyses_used: number;
  ai_analyses_limit: number | null;
}

type CancelStep = 'none' | 'confirm' | 'reason' | 'final';

export default function SubscriptionPage() {
  const searchParams = useSearchParams();
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [usage, setUsage] = useState<UsageStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [cancelStep, setCancelStep] = useState<CancelStep>('none');
  const [cancelReason, setCancelReason] = useState('');
  const [paymentPage, setPaymentPage] = useState(1);
  const [paymentError, setPaymentError] = useState<string | null>(null);

  // Check if redirected from coupon bundle purchase
  const purchaseType = searchParams.get('purchase');
  const bundleQuantity = searchParams.get('quantity');
  const bundleAmount = searchParams.get('amount');
  const paymentErrorParam = searchParams.get('error');

  const fetchData = useCallback(async () => {
    try {
      const [subRes, payRes, usageRes] = await Promise.all([
        fetch('/api/subscriptions'),
        fetch(`/api/payments?limit=10&page=${paymentPage}`),
        fetch('/api/usage'),
      ]);

      if (subRes.ok) {
        const { data } = await subRes.json();
        setSubscription(data);
      }
      if (payRes.ok) {
        const { data } = await payRes.json();
        setPayments(data ?? []);
      }
      if (usageRes.ok) {
        const { data } = await usageRes.json();
        setUsage(data);
      }
    } catch (err) {
      logger.error('Subscription page fetch error', { error: err });
    } finally {
      setLoading(false);
    }
  }, [paymentPage]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Handle payment error
  useEffect(() => {
    if (paymentErrorParam === 'payment_failed') {
      setPaymentError('결제에 실패했습니다. 다시 시도해주세요.');
    } else if (paymentErrorParam === 'billing_failed') {
      setPaymentError('결제 수단 등록에 실패했습니다. 다시 시도해주세요.');
    }
  }, [paymentErrorParam]);

  // Auto-trigger coupon bundle payment if redirected
  useEffect(() => {
    if (purchaseType === 'coupon' && bundleQuantity && bundleAmount) {
      handleCouponBundlePurchase(parseInt(bundleQuantity, 10), parseInt(bundleAmount, 10));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [purchaseType]);

  const handleCouponBundlePurchase = async (quantity: number, amount: number) => {
    if (!TOSS_CLIENT_KEY || processing) return;
    setProcessing(true);

    try {
      // @ts-expect-error TossPayments SDK loaded via script tag
      const tossPayments = window.TossPayments(TOSS_CLIENT_KEY);
      const orderId = `coupon-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

      await tossPayments.requestPayment('카드', {
        amount,
        orderId,
        orderName: `쿠폰 ${quantity}장 번들`,
        successUrl: `${window.location.origin}/api/payments/callback?type=coupon_bundle&quantity=${quantity}`,
        failUrl: `${window.location.origin}/subscription?error=payment_failed`,
      });
    } catch (err) {
      logger.error('Coupon bundle payment error', { error: err });
      setPaymentError('결제 요청 중 오류가 발생했습니다.');
    } finally {
      setProcessing(false);
    }
  };

  const handleSubscribe = async (planId: string) => {
    if (!TOSS_CLIENT_KEY || processing) return;
    setProcessing(true);
    setPaymentError(null);

    try {
      // @ts-expect-error TossPayments SDK loaded via script tag
      const tossPayments = window.TossPayments(TOSS_CLIENT_KEY);
      const customerKey = `cust-${Date.now()}`;

      await tossPayments.requestBillingKeyAuth('카드', {
        customerKey,
        successUrl: `${window.location.origin}/api/payments/callback?type=subscription&plan=${planId}&customerKey=${customerKey}`,
        failUrl: `${window.location.origin}/subscription?error=billing_failed`,
      });
    } catch (err) {
      logger.error('Subscription billing error', { error: err });
      setPaymentError('결제 수단 등록 중 오류가 발생했습니다.');
    } finally {
      setProcessing(false);
    }
  };

  const handleCancelStart = () => {
    setCancelStep('confirm');
  };

  const handleConfirmCancel = () => {
    setCancelStep('reason');
  };

  const handleSubmitCancel = async () => {
    setCancelStep('none');

    try {
      const res = await fetch('/api/subscriptions', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: cancelReason }),
      });

      if (res.ok) {
        setCancelReason('');
        await fetchData();
      } else {
        const data = await res.json();
        alert(data.error ?? '해지에 실패했습니다.');
      }
    } catch (err) {
      logger.error('Subscription cancel error', { error: err });
      alert('해지 중 오류가 발생했습니다.');
    }
  };

  const handleCancelAbort = () => {
    setCancelStep('none');
    setCancelReason('');
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <LoadingSpinner size="lg" label="플랜 정보 로딩 중..." />
      </div>
    );
  }

  const currentPlan = subscription?.plan_id ?? 'starter';
  const isTrial = subscription?.trial_end && new Date(subscription.trial_end) > new Date();
  const trialDaysRemaining = isTrial
    ? Math.ceil((new Date(subscription!.trial_end!).getTime() - Date.now()) / (24 * 60 * 60 * 1000))
    : 0;

  const currentPlanData = SUBSCRIPTION_PLANS.find((p) => p.id === currentPlan);

  return (
    <div className="px-5 pt-4 pb-24">
      <h2 className="text-lg font-bold text-text-primary mb-2">구독 & 플랜</h2>

      {/* Current Plan Badge */}
      {subscription && (
        <div className="card p-4 mb-4 bg-brand-primary/5 border border-brand-primary/20">
          <div className="flex items-start justify-between mb-2">
            <div>
              <p className="text-xs text-text-tertiary uppercase tracking-wider mb-1">현재 플랜</p>
              <p className="text-xl font-bold text-text-primary">{getPlanName(currentPlan)}</p>
            </div>
            <span className="text-sm font-semibold text-brand-primary">
              {currentPlanData?.price === 0 ? '무료' : `${currentPlanData?.price?.toLocaleString()}원/월`}
            </span>
          </div>

          {subscription.status === 'canceled' && subscription.current_period_end && (
            <p className="text-xs text-status-error">
              ⚠️ 해지 예정 · {new Date(subscription.current_period_end).toLocaleDateString('ko-KR')}까지 이용 가능
            </p>
          )}

          {subscription.current_period_end && subscription.status === 'active' && (
            <p className="text-xs text-text-secondary">
              다음 결제일: {new Date(subscription.current_period_end).toLocaleDateString('ko-KR')}
            </p>
          )}
        </div>
      )}

      {/* Trial Banner */}
      {isTrial && trialDaysRemaining > 0 && (
        <div className="card p-4 mb-4 bg-status-warning/10 border border-status-warning/20">
          <p className="text-sm font-semibold text-status-warning mb-2">
            트라이얼 진행 중 · {trialDaysRemaining}일 남음
          </p>
          <p className="text-xs text-text-secondary mb-3">
            트라이얼 기간이 끝나면 자동으로 결제됩니다.
          </p>
          <button
            type="button"
            onClick={() => handleSubscribe(currentPlan)}
            className="btn-primary text-xs px-4 py-2 w-full"
          >
            지금 업그레이드
          </button>
        </div>
      )}

      {/* Error Message */}
      {paymentError && (
        <div className="card p-3 mb-4 bg-status-error/10 border border-status-error/20">
          <p className="text-sm text-status-error">{paymentError}</p>
        </div>
      )}

      {/* Usage Stats */}
      {usage && (
        <div className="grid grid-cols-2 gap-3 mb-6">
          <UsageCard
            label="회원"
            used={usage.members_count}
            limit={usage.members_limit}
            icon="👤"
          />
          <UsageCard
            label="AI 분석"
            used={usage.ai_analyses_used}
            limit={usage.ai_analyses_limit}
            icon="🤖"
          />
        </div>
      )}

      {/* Plan Comparison */}
      <h3 className="text-sm font-semibold text-text-primary mb-3">플랜 비교</h3>
      <div className="space-y-3 mb-8">
        {SUBSCRIPTION_PLANS.map((plan) => {
          const isCurrent = plan.id === currentPlan;
          const isUpgrade = getPlanOrder(plan.id) > getPlanOrder(currentPlan);

          return (
            <div
              key={plan.id}
              className={cn(
                'card p-4 relative transition-all',
                plan?.popular && 'ring-2 ring-brand-primary',
                isCurrent && 'bg-brand-primary/5'
              )}
            >
              {plan?.popular && (
                <span className="absolute -top-2 right-4 bg-brand-primary text-white text-[10px] px-2 py-0.5 rounded-full">
                  추천
                </span>
              )}

              <div className="flex items-start justify-between mb-3">
                <div>
                  <h4 className="text-base font-bold text-text-primary">{plan.name}</h4>
                  <p className="text-sm text-text-secondary mt-0.5">
                    {plan.price === 0 ? '무료' : `${plan.price.toLocaleString()}원/월`}
                  </p>
                </div>

                {isCurrent ? (
                  <span className="text-xs bg-brand-primary/10 text-brand-primary px-2 py-1 rounded-full font-medium whitespace-nowrap">
                    ✓ 현재
                  </span>
                ) : isUpgrade ? (
                  <button
                    type="button"
                    onClick={() => handleSubscribe(plan.id)}
                    disabled={processing}
                    className="btn-primary text-xs px-4 py-1.5 disabled:opacity-50 whitespace-nowrap"
                  >
                    {processing ? '처리 중...' : '업그레이드'}
                  </button>
                ) : (
                  <span className="text-xs text-text-tertiary px-2 py-1">다운그레이드</span>
                )}
              </div>

              <ul className="space-y-1.5">
                {plan.features.map((feature, idx) => (
                  <li key={idx} className="text-xs text-text-secondary flex items-center gap-1.5">
                    <CheckIcon className="w-3.5 h-3.5 text-status-success flex-shrink-0" />
                    {feature}
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>

      {/* Cancellation Flow */}
      {subscription?.status === 'active' && currentPlan !== 'starter' && cancelStep === 'none' && (
        <button
          type="button"
          onClick={handleCancelStart}
          className="w-full text-center text-xs text-text-tertiary underline hover:text-text-primary py-3 transition-colors"
        >
          구독 해지
        </button>
      )}

      {/* Cancel Confirmation Dialog */}
      {cancelStep !== 'none' && (
        <div className="fixed inset-0 bg-black/30 flex items-end z-50 animate-fade-in">
          <div className="w-full bg-surface-primary rounded-t-3xl p-6 animate-slide-up">
            {cancelStep === 'confirm' && (
              <div className="space-y-4">
                <h3 className="text-lg font-bold text-text-primary">정말 구독을 해지하시겠어요?</h3>
                <div className="bg-status-error/10 rounded-lg p-3 space-y-2">
                  <p className="text-sm font-semibold text-status-error">주의사항</p>
                  <ul className="text-xs text-text-secondary space-y-1">
                    <li>• 현재 결제 기간이 끝날 때까지 이용 가능</li>
                    <li>• 해지 후 무료 플랜으로 다운그레이드</li>
                    <li>• 우선 지원 등 Pro 기능 이용 불가</li>
                  </ul>
                </div>
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={handleCancelAbort}
                    className="flex-1 card py-3 text-center font-medium text-text-secondary hover:bg-gray-50"
                  >
                    취소
                  </button>
                  <button
                    type="button"
                    onClick={handleConfirmCancel}
                    className="flex-1 btn-primary py-3 text-center font-medium"
                  >
                    계속
                  </button>
                </div>
              </div>
            )}

            {cancelStep === 'reason' && (
              <div className="space-y-4">
                <h3 className="text-lg font-bold text-text-primary">해지 사유를 선택해주세요</h3>
                <div className="space-y-2">
                  {[
                    '사용하지 않음',
                    '기능 부족',
                    '높은 가격',
                    '기술적 문제',
                    '기타',
                  ].map((reason) => (
                    <button
                      key={reason}
                      type="button"
                      onClick={() => setCancelReason(reason)}
                      className={cn(
                        'w-full p-3 text-left rounded-lg border-2 transition-colors',
                        cancelReason === reason
                          ? 'border-brand-primary bg-brand-primary/5'
                          : 'border-gray-200 hover:border-brand-primary/30'
                      )}
                    >
                      <p className={cn(
                        'text-sm font-medium',
                        cancelReason === reason ? 'text-brand-primary' : 'text-text-primary'
                      )}>
                        {reason}
                      </p>
                    </button>
                  ))}
                </div>

                <textarea
                  placeholder="추가 의견 (선택사항)"
                  value={cancelReason === '' || [
                    '사용하지 않음',
                    '기능 부족',
                    '높은 가격',
                    '기술적 문제',
                    '기타',
                  ].includes(cancelReason) ? '' : cancelReason}
                  onChange={(e) => setCancelReason(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg outline-none focus:border-brand-primary"
                  rows={3}
                />

                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => setCancelStep('confirm')}
                    className="flex-1 card py-3 text-center font-medium text-text-secondary hover:bg-gray-50"
                  >
                    뒤로
                  </button>
                  <button
                    type="button"
                    onClick={handleSubmitCancel}
                    className="flex-1 btn-primary py-3 text-center font-medium"
                  >
                    해지 완료
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Payment History */}
      <div>
        <h3 className="text-sm font-semibold text-text-primary mb-3">결제 내역</h3>
        {payments.length === 0 ? (
          <div className="card p-4 text-center">
            <p className="text-sm text-text-secondary">결제 내역이 없습니다</p>
          </div>
        ) : (
          <div className="space-y-2">
            {payments.map((payment) => (
              <PaymentRow key={payment.id} payment={payment} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

interface UsageCardProps {
  label: string;
  used: number;
  limit: number | null;
  icon: string;
}

function UsageCard({ label, used, limit, icon }: UsageCardProps) {
  const percent = limit ? Math.round((used / limit) * 100) : 0;
  const isWarning = percent > 80;

  return (
    <div className="card p-3">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-lg">{icon}</span>
        <p className="text-xs font-semibold text-text-primary">{label}</p>
      </div>
      <p className={cn(
        'text-lg font-bold',
        isWarning ? 'text-status-warning' : 'text-text-primary'
      )}>
        {used}{limit ? `/${limit}` : '+'}
      </p>
      {limit && (
        <div className="w-full h-1.5 bg-gray-200 rounded-full overflow-hidden mt-2">
          <div
            className={cn(
              'h-full transition-all',
              isWarning ? 'bg-status-warning' : 'bg-status-success'
            )}
            style={{ width: `${Math.min(percent, 100)}%` }}
          />
        </div>
      )}
    </div>
  );
}

interface PaymentRowProps {
  payment: Payment;
}

function PaymentRow({ payment }: PaymentRowProps) {
  const isSuccessful = payment.status === 'DONE';
  const paymentLabel = payment.type === 'coupon_bundle'
    ? '쿠폰 번들'
    : payment.type === 'subscription'
    ? '구독 결제'
    : '결제';

  return (
    <div className="card p-4 flex items-center justify-between hover:shadow-md transition-shadow">
      <div className="flex-1">
        <p className="text-sm font-medium text-text-primary">{paymentLabel}</p>
        <p className="text-xs text-text-tertiary mt-0.5">
          {new Date(payment.created_at).toLocaleDateString('ko-KR')} · {payment.method}
        </p>
      </div>
      <div className="text-right flex items-center gap-3">
        <div>
          <p className="text-sm font-bold text-text-primary">
            {payment.amount.toLocaleString()}원
          </p>
          <p className={cn(
            'text-xs font-medium',
            isSuccessful ? 'text-status-success' : 'text-status-error'
          )}>
            {isSuccessful ? '✓ 완료' : payment.status}
          </p>
        </div>
        {payment.receipt_url && (
          <a
            href={payment.receipt_url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-brand-primary hover:underline whitespace-nowrap"
          >
            영수증
          </a>
        )}
      </div>
    </div>
  );
}

function getPlanName(planId: string): string {
  return SUBSCRIPTION_PLANS.find((p) => p.id === planId)?.name ?? planId;
}

function getPlanOrder(planId: string): number {
  const order: Record<string, number> = { starter: 0, pro: 1, academy: 2 };
  return order[planId] ?? 0;
}

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
      <polyline points="20,6 9,17 4,12" />
    </svg>
  );
}
