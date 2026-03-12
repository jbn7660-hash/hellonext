/**
 * Formatting Utilities
 *
 * Common date, number, and string formatting functions
 * used throughout the application.
 *
 * @module lib/utils/format
 */

/**
 * Formats a date string to Korean locale format.
 * @example formatDate('2026-03-10T14:30:00Z') => '2026. 3. 10.'
 */
export function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return '';
  return date.toLocaleDateString('ko-KR');
}

/**
 * Formats a date string to relative time.
 * @example formatRelativeTime('2026-03-10T14:00:00Z') => '2시간 전'
 */
export function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return '';

  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);

  if (diffSec < 60) return '방금 전';
  if (diffMin < 60) return `${diffMin}분 전`;
  if (diffHour < 24) return `${diffHour}시간 전`;
  if (diffDay < 7) return `${diffDay}일 전`;
  return formatDate(dateStr);
}

/**
 * Formats seconds to mm:ss display.
 * @example formatDuration(90) => '1:30'
 */
export function formatDuration(seconds: number): string {
  if (seconds < 0) return '0:00';
  const min = Math.floor(seconds / 60);
  const sec = Math.floor(seconds % 60);
  return `${min}:${sec.toString().padStart(2, '0')}`;
}

/**
 * Formats a number to Korean currency format.
 * @example formatCurrency(50000) => '50,000원'
 */
export function formatCurrency(amount: number): string {
  return `${amount.toLocaleString('ko-KR')}원`;
}

/**
 * Truncates text to a maximum length with ellipsis.
 */
export function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength)}...`;
}
