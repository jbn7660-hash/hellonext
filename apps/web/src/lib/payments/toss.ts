/**
 * TossPayments Client Library
 *
 * Wraps TossPayments SDK for:
 *  - One-time payments (coupon bundle purchase)
 *  - Billing key registration (Pro subscription)
 *  - Recurring billing execution
 *  - Payment confirmation (server-side)
 *
 * Features:
 *  - 30s timeout with AbortController
 *  - Retry logic with exponential backoff (network errors only)
 *  - Amount validation before Toss API calls
 *  - Idempotency keys for confirmPayment and executeBillingPayment
 *  - Rate limiting awareness (Retry-After header)
 *  - Structured logging without leaking secrets
 *  - Custom error classification with isRetryable flag
 *
 * @module lib/payments/toss
 * @feature F-008
 * @see https://docs.tosspayments.com
 */

import { logger } from '@/lib/utils/logger';
import { randomUUID } from 'crypto';

// ─── Constants ──────────────────────────────────────────────────

const TOSS_API_TIMEOUT_MS = 30000; // 30 seconds
const MAX_RETRIES = 2;
const INITIAL_BACKOFF_MS = 1000;

// ─── Types ──────────────────────────────────────────────────────

export interface TossPaymentConfirmation {
  paymentKey: string;
  orderId: string;
  amount: number;
}

export interface TossPaymentResponse {
  paymentKey: string;
  orderId: string;
  status: 'DONE' | 'CANCELED' | 'PARTIAL_CANCELED' | 'ABORTED' | 'EXPIRED';
  method: string;
  totalAmount: number;
  approvedAt: string;
  receipt?: { url: string };
  [key: string]: unknown;
}

export interface TossPaymentResult extends TossPaymentResponse {}

export interface TossBillingKeyResponse {
  billingKey: string;
  customerKey: string;
  method: string;
  card?: {
    issuerCode: string;
    number: string;
  };
  [key: string]: unknown;
}

export interface TossBillingKeyResult extends TossBillingKeyResponse {}

export interface TossBillingPaymentResponse {
  paymentKey: string;
  orderId: string;
  status: string;
  totalAmount: number;
  approvedAt: string;
  [key: string]: unknown;
}

export interface TossBillingPaymentResult extends TossBillingPaymentResponse {}

export interface TossCancelResponse {
  paymentKey: string;
  orderId: string;
  status: string;
  totalAmount: number;
  cancelAmount?: number;
  canceledAt: string;
  [key: string]: unknown;
}

// ─── Constants ──────────────────────────────────────────────────

const TOSS_API_URL = 'https://api.tosspayments.com/v1';

function getSecretKey(): string {
  const key = process.env.TOSS_PAYMENTS_SECRET_KEY;
  if (!key) throw new Error('Missing TOSS_PAYMENTS_SECRET_KEY');
  return key;
}

function getAuthHeader(): string {
  return `Basic ${Buffer.from(`${getSecretKey()}:`).toString('base64')}`;
}

function generateIdempotencyKey(): string {
  return randomUUID();
}

function getExponentialBackoffDelay(attempt: number): number {
  return INITIAL_BACKOFF_MS * Math.pow(2, attempt) + Math.random() * 100;
}

function isNetworkError(status: number): boolean {
  // Retry on network-level errors, not 4xx client errors
  return status >= 500 || status === 408 || status === 429;
}

async function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ─── Request Wrapper with Timeout & Retry ───────────────────────

async function fetchWithTimeoutAndRetry<T>(
  url: string,
  init: RequestInit,
  operation: string,
  metadata: Record<string, unknown>
): Promise<T> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), TOSS_API_TIMEOUT_MS);

      const response = await fetch(url, {
        ...init,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      // Handle rate limiting
      if (response.status === 429) {
        const retryAfter = response.headers.get('Retry-After');
        const waitMs = retryAfter ? parseInt(retryAfter) * 1000 : 5000;
        logger.warn('Toss rate limited', { ...metadata, operation, waitMs, attempt });

        if (attempt < MAX_RETRIES) {
          await delay(waitMs);
          continue;
        }
      }

      // Try to parse error response
      let errorData: Record<string, unknown> = {};
      if (!response.ok) {
        try {
          errorData = await response.json();
        } catch {
          // Response is not JSON, ignore
        }
      }

      if (!response.ok) {
        const isRetryable = isNetworkError(response.status);

        logger.error('Toss API error', {
          ...metadata,
          operation,
          status: response.status,
          code: errorData.code,
          message: errorData.message,
          attempt,
          isRetryable,
        });

        const error = new TossPaymentError(
          String(errorData.code ?? `HTTP_${response.status}`),
          String(errorData.message ?? 'Unknown error'),
          isRetryable
        );

        lastError = error;

        if (isRetryable && attempt < MAX_RETRIES) {
          const backoffMs = getExponentialBackoffDelay(attempt);
          await delay(backoffMs);
          continue;
        }

        throw error;
      }

      return response.json() as Promise<T>;
    } catch (err) {
      if (err instanceof Error) {
        if (err.name === 'AbortError') {
          lastError = new TossPaymentError(
            'TIMEOUT',
            'Payment request timed out after 30 seconds',
            true
          );
          logger.error('Toss request timeout', {
            ...metadata,
            operation,
            attempt,
          });

          if (attempt < MAX_RETRIES) {
            const backoffMs = getExponentialBackoffDelay(attempt);
            await delay(backoffMs);
            continue;
          }

          throw lastError;
        }

        // Network errors are retryable
        if (err.message.includes('fetch') || err.message.includes('network')) {
          lastError = new TossPaymentError(
            'NETWORK_ERROR',
            'Network request failed',
            true
          );

          if (attempt < MAX_RETRIES) {
            const backoffMs = getExponentialBackoffDelay(attempt);
            await delay(backoffMs);
            continue;
          }
        }
      }

      throw lastError ?? err;
    }
  }

  throw lastError ?? new Error('Max retries exceeded');
}

// ─── One-time Payment Confirmation ──────────────────────────────

/**
 * Confirm a one-time payment (server-side).
 * Called after TossPayments client SDK completes on the frontend.
 *
 * Validates amount before sending to Toss and includes idempotency key.
 */
export async function confirmPayment(
  params: TossPaymentConfirmation
): Promise<TossPaymentResult> {
  // Validate amount
  if (params.amount <= 0) {
    throw new TossPaymentError('INVALID_AMOUNT', 'Amount must be greater than 0', false);
  }

  const idempotencyKey = generateIdempotencyKey();

  return fetchWithTimeoutAndRetry<TossPaymentResult>(
    `${TOSS_API_URL}/payments/confirm`,
    {
      method: 'POST',
      headers: {
        Authorization: getAuthHeader(),
        'Content-Type': 'application/json',
        'X-Idempotency-Key': idempotencyKey,
      },
      body: JSON.stringify(params),
    },
    'confirmPayment',
    { orderId: params.orderId, amount: params.amount }
  );
}

// ─── Billing Key (Subscription) ─────────────────────────────────

/**
 * Issue a billing key from an auth key (after customer card registration).
 * Includes idempotency key to prevent duplicate registrations.
 */
export async function issueBillingKey(
  authKey: string,
  customerKey: string
): Promise<TossBillingKeyResult> {
  const idempotencyKey = generateIdempotencyKey();

  return fetchWithTimeoutAndRetry<TossBillingKeyResult>(
    `${TOSS_API_URL}/billing/authorizations/issue`,
    {
      method: 'POST',
      headers: {
        Authorization: getAuthHeader(),
        'Content-Type': 'application/json',
        'X-Idempotency-Key': idempotencyKey,
      },
      body: JSON.stringify({ authKey, customerKey }),
    },
    'issueBillingKey',
    { customerKey }
  );
}

/**
 * Execute a recurring billing payment using a stored billing key.
 * Validates amount before sending and includes idempotency key.
 */
export async function executeBillingPayment(params: {
  billingKey: string;
  customerKey: string;
  amount: number;
  orderId: string;
  orderName: string;
}): Promise<TossBillingPaymentResult> {
  // Validate amount
  if (params.amount <= 0) {
    throw new TossPaymentError('INVALID_AMOUNT', 'Amount must be greater than 0', false);
  }

  const idempotencyKey = generateIdempotencyKey();

  return fetchWithTimeoutAndRetry<TossBillingPaymentResult>(
    `${TOSS_API_URL}/billing/${params.billingKey}`,
    {
      method: 'POST',
      headers: {
        Authorization: getAuthHeader(),
        'Content-Type': 'application/json',
        'X-Idempotency-Key': idempotencyKey,
      },
      body: JSON.stringify({
        customerKey: params.customerKey,
        amount: params.amount,
        orderId: params.orderId,
        orderName: params.orderName,
      }),
    },
    'executeBillingPayment',
    { orderId: params.orderId, amount: params.amount }
  );
}

// ─── Payment Cancellation ───────────────────────────────────────

/**
 * Cancel a payment or partial cancellation.
 * Includes idempotency key to prevent duplicate cancellations.
 */
export async function cancelPayment(
  paymentKey: string,
  cancelReason: string,
  cancelAmount?: number
): Promise<TossCancelResponse> {
  const idempotencyKey = generateIdempotencyKey();
  const body: Record<string, unknown> = { cancelReason };
  if (cancelAmount != null && cancelAmount > 0) {
    body.cancelAmount = cancelAmount;
  }

  return fetchWithTimeoutAndRetry<TossCancelResponse>(
    `${TOSS_API_URL}/payments/${paymentKey}/cancel`,
    {
      method: 'POST',
      headers: {
        Authorization: getAuthHeader(),
        'Content-Type': 'application/json',
        'X-Idempotency-Key': idempotencyKey,
      },
      body: JSON.stringify(body),
    },
    'cancelPayment',
    { paymentKey: paymentKey.slice(0, 8) + '...', cancelAmount }
  );
}

// ─── Error Class ────────────────────────────────────────────────

export class TossPaymentError extends Error {
  code: string;
  isRetryable: boolean;

  constructor(code: string, message: string, isRetryable = false) {
    super(message);
    this.name = 'TossPaymentError';
    this.code = code;
    this.isRetryable = isRetryable;
  }
}

// ─── Client-side Helper Constants ───────────────────────────────

export const TOSS_CLIENT_KEY = process.env.NEXT_PUBLIC_TOSS_PAYMENTS_CLIENT_KEY ?? '';

export const COUPON_BUNDLES = [
  { quantity: 5, price: 30000, perUnit: 6000, label: '5장 번들' },
  { quantity: 10, price: 50000, perUnit: 5000, label: '10장 번들', popular: true },
  { quantity: 30, price: 120000, perUnit: 4000, label: '30장 번들' },
] as const;

export const SUBSCRIPTION_PLANS = [
  { id: 'starter', name: 'Starter', price: 0, memberLimit: 5, features: ['회원 5명', 'PLG 쿠폰 3장'] },
  { id: 'pro', name: 'Pro', price: 19000, memberLimit: -1, features: ['회원 무제한', '우선 AI 분석', '고급 리포트'], popular: true },
  { id: 'academy', name: 'Academy', price: 149000, memberLimit: -1, features: ['전체 Pro 기능', '다중 프로 관리', '전용 대시보드', '우선 지원'] },
] as const;
