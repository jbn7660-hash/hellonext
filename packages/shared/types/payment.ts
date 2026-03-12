/**
 * Payment Types
 *
 * Type definitions for payment processing, history, and TossPayments integration.
 *
 * @module types/payment
 */

// ─── Status and Types ───────────────────────────────────────────

export type PaymentStatus =
  | 'pending'
  | 'completed'
  | 'failed'
  | 'refunded'
  | 'partial_refunded'
  | 'canceled';

export type PaymentType = 'coupon_bundle' | 'subscription' | 'upgrade_proration';

export type PaymentMethod = 'card' | 'transfer' | 'virtual_account' | 'gift_certificate';

// ─── Payment Record ────────────────────────────────────────────

/**
 * Complete payment record stored in database
 */
export interface PaymentRecord {
  readonly id: string;
  readonly pro_user_id: string;
  readonly amount: number;
  readonly type: PaymentType;
  readonly status: PaymentStatus;
  readonly method: PaymentMethod;
  readonly order_id: string;
  readonly payment_key?: string | null;
  readonly receipt_url?: string | null;
  readonly created_at: string;
  readonly updated_at: string;
  readonly metadata?: Record<string, unknown> | null;
  // Coupon bundle specific
  readonly coupon_quantity?: number | null;
  // Subscription specific
  readonly subscription_period_start?: string | null;
  readonly subscription_period_end?: string | null;
  readonly subscription_plan_id?: string | null;
  // Prorations
  readonly proration_reason?: string | null;
  readonly proration_amount?: number | null;
}

// ─── API Request/Response ──────────────────────────────────────

/**
 * Request to create a new payment
 */
export interface PaymentCreateRequest {
  readonly type: PaymentType;
  readonly amount: number;
  readonly method: PaymentMethod;
  readonly order_id: string;
  readonly metadata?: Record<string, unknown>;
  // For coupon bundles
  readonly coupon_quantity?: number;
  // For subscriptions
  readonly subscription_plan_id?: string;
}

/**
 * Payment confirmation request (after TossPayments client-side payment)
 */
export interface PaymentConfirmationRequest {
  readonly payment_key: string;
  readonly order_id: string;
  readonly amount: number;
  readonly type: PaymentType;
}

/**
 * Payment history item for list display
 */
export interface PaymentHistoryItem {
  readonly id: string;
  readonly amount: number;
  readonly type: PaymentType;
  readonly status: PaymentStatus;
  readonly method: PaymentMethod;
  readonly created_at: string;
  readonly receipt_url?: string | null;
  readonly coupon_quantity?: number | null;
  readonly subscription_plan_id?: string | null;
}

// ─── Webhook Events ────────────────────────────────────────────

/**
 * TossPayments webhook event data
 */
export interface PaymentWebhookEvent {
  readonly eventType:
    | 'PAYMENT_CONFIRMED'
    | 'PAYMENT_SUCCEEDED'
    | 'PAYMENT_FAILED'
    | 'PAYMENT_CANCELED'
    | 'PAYMENT_EXPIRED';
  readonly paymentKey: string;
  readonly orderId: string;
  readonly totalAmount: number;
  readonly status: PaymentStatus;
  readonly approvedAt?: string;
  readonly failedAt?: string;
  readonly timestamp: string;
}

/**
 * Processed webhook event after validation
 */
export interface ProcessedWebhookEvent {
  readonly id: string;
  readonly eventType: PaymentWebhookEvent['eventType'];
  readonly paymentKey: string;
  readonly orderId: string;
  readonly totalAmount: number;
  readonly status: PaymentStatus;
  readonly processedAt: string;
  readonly idempotency_key: string;
}

// ─── Query/Filter Types ────────────────────────────────────────

/**
 * Payment filtering options
 */
export interface PaymentFilter {
  readonly pro_user_id?: string;
  readonly type?: PaymentType;
  readonly status?: PaymentStatus;
  readonly dateFrom?: string; // ISO 8601
  readonly dateTo?: string; // ISO 8601
  readonly limit?: number;
  readonly offset?: number;
}

/**
 * Paginated payment list response
 */
export interface PaymentListResponse {
  readonly data: PaymentHistoryItem[];
  readonly total: number;
  readonly limit: number;
  readonly offset: number;
  readonly hasMore: boolean;
}

// ─── Error Types ───────────────────────────────────────────────

/**
 * Payment error details
 */
export interface PaymentError {
  readonly code: string;
  readonly message: string;
  readonly type: 'validation' | 'processing' | 'network' | 'unknown';
  readonly isRetryable: boolean;
  readonly timestamp: string;
}

// ─── Helper Functions ──────────────────────────────────────────

/**
 * Check if payment is completed successfully
 */
export function isPaymentCompleted(status: PaymentStatus): boolean {
  return status === 'completed';
}

/**
 * Check if payment can be refunded
 */
export function isPaymentRefundable(status: PaymentStatus): boolean {
  return status === 'completed' || status === 'partial_refunded';
}

/**
 * Get human-readable payment type label (Korean)
 */
export function getPaymentTypeLabel(type: PaymentType): string {
  const labels: Record<PaymentType, string> = {
    coupon_bundle: '쿠폰 번들',
    subscription: '구독 결제',
    upgrade_proration: '업그레이드 프로레이션',
  };
  return labels[type] ?? type;
}

/**
 * Get human-readable payment status label (Korean)
 */
export function getPaymentStatusLabel(status: PaymentStatus): string {
  const labels: Record<PaymentStatus, string> = {
    pending: '대기중',
    completed: '완료',
    failed: '실패',
    refunded: '환불됨',
    partial_refunded: '부분환불',
    canceled: '취소됨',
  };
  return labels[status] ?? status;
}
