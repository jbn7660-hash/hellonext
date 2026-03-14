/**
 * useVerificationQueue Hook
 *
 * Manages the professional verification queue for measurements.
 * Subscribes to Realtime for new pending verifications and provides
 * methods to submit verification responses.
 *
 * @module hooks/use-verification-queue
 * @feature F-016
 */

'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { logger } from '@/lib/utils/logger';
import type {
  VerificationQueueEntry as DbVerificationQueueEntry,
  VerificationResponse as DbVerificationResponse,
} from '@hellonext/shared';

// Re-export DB 타입 (참조용)
export type { DbVerificationQueueEntry, DbVerificationResponse };

/**
 * 클라이언트 측 검증 큐 항목 (DB row → UI 친화적 변환).
 * DB 스키마: shared/types/verification.ts의 VerificationQueueEntry
 * Patent 3 Claim 1(c), 1(e)
 */
export interface VerificationQueueEntry {
  id: string;
  token: string;
  sessionId: string;
  measurementId: string;
  measurementType: string;
  confidenceScore: number;
  predictedValue: number;
  unit: string;
  capturedAt: string;
  expiresAt?: string;
}

/**
 * Verification response type (shared와 동일한 string union).
 */
export type VerificationResponse = 'confirm' | 'correct' | 'reject';

/**
 * Hook state.
 */
export interface UseVerificationQueueState {
  items: VerificationQueueEntry[];
  pendingCount: number;
  loading: boolean;
  error: string | null;
}

/**
 * Hook actions.
 */
export interface UseVerificationQueueActions {
  submitVerification: (
    token: string,
    responseType: VerificationResponse,
    correctedValue?: Record<string, number>
  ) => Promise<void>;
  refresh: () => Promise<void>;
  reset: () => void;
}

/**
 * useVerificationQueue hook.
 * Subscribes to verification queue updates and provides verification submission.
 *
 * @returns Hook state and actions
 */
export function useVerificationQueue(): UseVerificationQueueState & UseVerificationQueueActions {
  const [items, setItems] = useState<VerificationQueueEntry[]>([]);
  const [pendingCount, setPendingCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const supabase = createClient();

  // Fetch verification queue items pending for current pro (F-016)
  const refresh = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      // Fetch pending verification items for current pro
      // Patent 3 Claim 1(c): Fetch pending verification items
      const { data, error: fetchError } = await supabase
        .from('verification_queue')
        .select('*')
        .eq('state', 'pending')
        .order('created_at', { ascending: false });

      if (fetchError) throw fetchError;

      // Transform DB rows to UI-friendly format
      const entries = (data || []).map((item: any) => ({
        id: item.id,
        token: item.token,
        sessionId: item.session_id,
        measurementId: item.measurement_id,
        measurementType: item.measurement_type,
        confidenceScore: item.confidence_score,
        predictedValue: item.predicted_value,
        unit: item.unit,
        capturedAt: item.created_at,
        expiresAt: item.expires_at,
      }));

      setItems(entries);
      setPendingCount(entries.length);

      logger.info('Verification queue refreshed', { count: entries.length });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load verification queue';
      setError(message);
      logger.error('Failed to load verification queue', { error: err });
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  // Subscribe to Realtime updates for new pending items (F-016)
  useEffect(() => {
    refresh();

    // Realtime subscription for new pending verification items
    const channel = supabase
      .channel('verification_queue_changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'verification_queue',
          filter: "state=eq.pending",
        },
        (payload) => {
          logger.info('Verification queue update received', {
            event: payload.eventType,
            measurementId: (payload.new as Record<string, unknown>)?.measurement_id,
          });
          // Optimistic refresh - could be enhanced with payload-based updates
          refresh();
        }
      )
      .subscribe();

    return () => {
      void channel.unsubscribe();
    };
  }, [supabase, refresh]);

  // Submit verification response (Patent 3 Claim 1(e))
  const submitVerification = useCallback(
    async (
      token: string,
      responseType: VerificationResponse,
      correctedValue?: Record<string, number>
    ) => {
      try {
        setError(null);

        // Optimistic update: remove item from queue before submission
        const originalItems = items;
        const itemIndex = items.findIndex(item => item.token === token);
        if (itemIndex > -1) {
          const newItems = items.filter((_, idx) => idx !== itemIndex);
          setItems(newItems);
          setPendingCount(newItems.length);
        }

        // Build corrected values payload
        const payload = {
          operation: 'handleVerification',
          token,
          response_type: responseType,
        } as any;

        if (responseType === 'correct' && correctedValue) {
          payload.corrected_values = correctedValue;
        }

        const { error: submitError } = await supabase.functions.invoke(
          'verification-handler',
          { body: payload }
        );

        if (submitError) throw submitError;

        logger.info('Verification submitted', { token, responseType });

        // Refresh queue after submission to ensure consistency
        await refresh();
      } catch (err) {
        // Restore original items on error
        await refresh();

        const message = err instanceof Error ? err.message : 'Failed to submit verification';
        setError(message);
        logger.error('Failed to submit verification', { error: err, token });
        throw err;
      }
    },
    [supabase, refresh, items]
  );

  // Reset hook state
  const reset = useCallback(() => {
    setItems([]);
    setPendingCount(0);
    setLoading(false);
    setError(null);
  }, []);

  return {
    items,
    pendingCount,
    loading,
    error,
    submitVerification,
    refresh,
    reset,
  };
}
