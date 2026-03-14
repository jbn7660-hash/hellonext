// DEPRECATED: Migrated to src/instrumentation.ts — remove after Next.js 14.2+ confirmed working

/**
 * Sentry Edge Configuration
 *
 * Initializes Sentry for Edge Runtime (middleware, edge API routes).
 */

import * as Sentry from '@sentry/nextjs';

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  enabled: process.env.NODE_ENV === 'production',
  tracesSampleRate: 0.1,
});
