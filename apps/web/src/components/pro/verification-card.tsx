/**
 * Verification Card Component
 *
 * Displays a pending verification item from the queue (Patent 3 Claim 1(e) AC-5).
 * Shows measurement details, confidence score, and three action buttons.
 *
 * Features:
 * - Confidence score visual indicator (color-coded)
 * - Token expiry countdown (24h)
 * - Correct mode with editable fields
 * - Loading states during submission
 * - Korean UI text
 *
 * @module components/pro/verification-card
 * @feature F-016
 * @patent Patent 3 Claim 1(e) AC-5
 */

'use client';

import { useState, useEffect } from 'react';
import type { VerificationQueueEntry } from '@/hooks/use-verification-queue';
import { logger } from '@/lib/utils/logger';

interface VerificationCardProps {
  item: VerificationQueueEntry;
  onConfirm: (token: string) => Promise<void>;
  onCorrect: (token: string, correctedValue: Record<string, number>) => Promise<void>;
  onReject: (token: string) => Promise<void>;
  loading?: boolean;
}

export function VerificationCard({
  item,
  onConfirm,
  onCorrect,
  onReject,
  loading = false,
}: VerificationCardProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [correctedValue, setCorrectedValue] = useState<number | ''>(item.predictedValue);
  const [submitting, setSubmitting] = useState(false);
  const [timeRemaining, setTimeRemaining] = useState<string>('');

  // Calculate and display token expiry countdown
  useEffect(() => {
    if (!item.expiresAt) return;

    const updateCountdown = () => {
      const now = new Date();
      const expiresAt = new Date(item.expiresAt!);
      const diff = expiresAt.getTime() - now.getTime();

      if (diff <= 0) {
        setTimeRemaining('만료됨');
        return;
      }

      const hours = Math.floor(diff / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      setTimeRemaining(`${hours}시간 ${minutes}분`);
    };

    updateCountdown();
    const interval = setInterval(updateCountdown, 60000); // Update every minute

    return () => clearInterval(interval);
  }, [item.expiresAt]);

  const handleConfirm = async () => {
    try {
      setSubmitting(true);
      await onConfirm(item.token);
    } catch (error) {
      logger.error('Failed to confirm verification', { error, token: item.token });
    } finally {
      setSubmitting(false);
    }
  };

  const handleCorrect = async () => {
    if (correctedValue === '' || correctedValue === item.predictedValue) {
      return;
    }

    try {
      setSubmitting(true);
      // Patent 3 Claim 1(e): Submit corrected values to edge function
      await onCorrect(item.token, {
        keypoint_visibility: correctedValue,
      });
      setIsEditing(false);
    } catch (error) {
      logger.error('Failed to correct verification', { error, token: item.token });
    } finally {
      setSubmitting(false);
    }
  };

  const handleReject = async () => {
    try {
      setSubmitting(true);
      await onReject(item.token);
    } catch (error) {
      logger.error('Failed to reject verification', { error, token: item.token });
    } finally {
      setSubmitting(false);
    }
  };

  const confidencePercent = Math.round(item.confidenceScore * 100);
  const confidenceColor =
    item.confidenceScore >= 0.7
      ? 'bg-green-100 text-green-800'
      : item.confidenceScore >= 0.4
        ? 'bg-yellow-100 text-yellow-800'
        : 'bg-red-100 text-red-800';

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
      {/* Header */}
      <div className="mb-4 flex items-start justify-between">
        <div>
          <h3 className="text-lg font-semibold text-gray-900">{item.measurementType}</h3>
          <p className="text-sm text-gray-600">세션: {item.sessionId}</p>
          {timeRemaining && (
            <p className={`text-xs mt-1 ${timeRemaining === '만료됨' ? 'text-red-600' : 'text-amber-600'}`}>
              만료: {timeRemaining}
            </p>
          )}
        </div>
        <div
          className={`rounded-full px-3 py-1 text-sm font-medium ${confidenceColor}`}
          title={`신뢰도 점수: ${item.confidenceScore.toFixed(3)}`}
        >
          {confidencePercent}%
        </div>
      </div>

      {/* Measurement Details */}
      <div className="mb-6 space-y-3 rounded-lg bg-gray-50 p-4">
        <div className="flex items-center justify-between">
          <span className="text-sm text-gray-600">예측 값</span>
          <span className="text-lg font-medium text-gray-900">
            {item.predictedValue} {item.unit}
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-sm text-gray-600">신뢰도</span>
          <div className="w-48">
            <div className="h-2 rounded-full bg-gray-200">
              <div
                className="h-2 rounded-full bg-blue-500"
                style={{ width: `${confidencePercent}%` }}
              />
            </div>
          </div>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-sm text-gray-600">기록 시간</span>
          <span className="text-sm text-gray-900">
            {new Date(item.capturedAt).toLocaleString('ko-KR')}
          </span>
        </div>
      </div>

      {/* Edit Section */}
      {isEditing && (
        <div className="mb-6 rounded-lg bg-blue-50 p-4">
          <label className="block text-sm font-medium text-gray-900">수정된 값</label>
          <div className="mt-2 flex items-center gap-2">
            <input
              type="number"
              value={correctedValue}
              onChange={(e) => setCorrectedValue(e.target.value === '' ? '' : parseFloat(e.target.value))}
              className="flex-1 rounded border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:outline-none"
              placeholder={`${item.predictedValue}`}
              disabled={submitting}
            />
            <span className="text-sm text-gray-600">{item.unit}</span>
          </div>
        </div>
      )}

      {/* Action Buttons - Three operations: confirm, correct, reject (Patent 3 Claim 1(e)) */}
      <div className="flex gap-3">
        <button
          onClick={handleConfirm}
          disabled={loading || submitting}
          className="flex-1 rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50 transition-colors"
          title="측정을 확정합니다"
        >
          {submitting && !isEditing ? '처리 중...' : '확인'}
        </button>

        {isEditing ? (
          <>
            <button
              onClick={handleCorrect}
              disabled={loading || submitting || correctedValue === '' || correctedValue === item.predictedValue}
              className="flex-1 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
              title="수정된 값으로 저장합니다"
            >
              {submitting ? '저장 중...' : '저장'}
            </button>
            <button
              onClick={() => setIsEditing(false)}
              disabled={submitting}
              className="flex-1 rounded-lg bg-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-300 disabled:opacity-50 transition-colors"
            >
              취소
            </button>
          </>
        ) : (
          <>
            <button
              onClick={() => setIsEditing(true)}
              disabled={loading || submitting}
              className="flex-1 rounded-lg bg-yellow-600 px-4 py-2 text-sm font-medium text-white hover:bg-yellow-700 disabled:opacity-50 transition-colors"
              title="측정값을 수정합니다"
            >
              수정
            </button>
            <button
              onClick={handleReject}
              disabled={loading || submitting}
              className="flex-1 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50 transition-colors"
              title="측정을 거절합니다"
            >
              {submitting ? '처리 중...' : '거부'}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
