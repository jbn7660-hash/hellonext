/**
 * Structured Logger
 *
 * Provides consistent, structured logging across the application.
 * Integrates with Sentry for error tracking in production.
 * Replaces all console.log usage per project coding standards.
 *
 * @module lib/utils/logger
 * @exports logger
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogContext {
  [key: string]: unknown;
}

interface LogEntry {
  level: LogLevel;
  message: string;
  timestamp: string;
  context?: LogContext;
}

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

const CURRENT_LEVEL: LogLevel =
  process.env.NODE_ENV === 'production' ? 'info' : 'debug';

function shouldLog(level: LogLevel): boolean {
  return LOG_LEVELS[level] >= LOG_LEVELS[CURRENT_LEVEL];
}

function formatEntry(entry: LogEntry): string {
  const prefix = `[${entry.timestamp}] [${entry.level.toUpperCase()}]`;
  const context = entry.context
    ? ` ${JSON.stringify(entry.context)}`
    : '';
  return `${prefix} ${entry.message}${context}`;
}

async function sendToSentry(entry: LogEntry): Promise<void> {
  if (typeof window === 'undefined') {
    // Server-side: use @sentry/nextjs
    try {
      const Sentry = await import('@sentry/nextjs');
      if (entry.level === 'error') {
        Sentry.captureException(
          entry.context?.['error'] instanceof Error
            ? entry.context['error']
            : new Error(entry.message),
          { extra: entry.context }
        );
      } else if (entry.level === 'warn') {
        Sentry.captureMessage(entry.message, {
          level: 'warning',
          extra: entry.context,
        });
      }
    } catch {
      // Sentry not available — silently ignore
    }
  }
}

function createLogMethod(level: LogLevel) {
  return (message: string, context?: LogContext): void => {
    if (!shouldLog(level)) return;

    const entry: LogEntry = {
      level,
      message,
      timestamp: new Date().toISOString(),
      context,
    };

    const formatted = formatEntry(entry);

    switch (level) {
      case 'debug':
        // eslint-disable-next-line no-console
        console.debug(formatted);
        break;
      case 'info':
        // eslint-disable-next-line no-console
        console.info(formatted);
        break;
      case 'warn':
        // eslint-disable-next-line no-console
        console.warn(formatted);
        break;
      case 'error':
        // eslint-disable-next-line no-console
        console.error(formatted);
        break;
    }

    // Send to Sentry in production for warn and error levels
    if (process.env.NODE_ENV === 'production' && (level === 'warn' || level === 'error')) {
      void sendToSentry(entry);
    }
  };
}

export const logger = {
  debug: createLogMethod('debug'),
  info: createLogMethod('info'),
  warn: createLogMethod('warn'),
  error: createLogMethod('error'),
} as const;
