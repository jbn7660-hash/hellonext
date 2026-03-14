/**
 * Sentry Node.js Runtime Initialization
 * Migrated from sentry.server.config.ts — preserves all original configuration.
 */

import * as Sentry from '@sentry/nextjs';

Sentry.init({
  // DSN Configuration
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  enabled: process.env.NODE_ENV === 'production',
  environment: process.env.NODE_ENV,

  // Version tracking
  release: process.env.NEXT_PUBLIC_APP_VERSION || '2.0.0',

  // Higher sampling rate for server-side (more events available)
  tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.3 : 1.0,

  // Server-side integrations
  integrations: [
    // Capture unhandled promise rejections
    Sentry.captureConsoleIntegration({
      levels: ['error', 'warn'],
    }),
  ],

  // Database and API error handling
  beforeSend(event) {
    // Sanitize sensitive headers
    if (event.request?.headers) {
      delete event.request.headers['authorization'];
      delete event.request.headers['cookie'];
      delete event.request.headers['x-api-key'];
      delete event.request.headers['x-supabase-auth'];
    }

    // Strip Korean PII patterns from body/message
    if (event.message) {
      // Phone number pattern: 010-1234-5678
      event.message = event.message.replace(/\d{2,3}-\d{3,4}-\d{4}/g, 'XXX-XXXX-XXXX');
      // Name patterns (2-4 Korean characters at word boundaries)
      event.message = event.message.replace(/[\uAC00-\uD7A3]{2,4}(?=\s|$)/g, 'XXXXX');
    }

    // Enhance patent engine API context
    if (event.request?.url?.includes('/api/patents') || event.request?.url?.includes('/patent-engine')) {
      event.tags = {
        ...event.tags,
        'patent.engine': 'api-route',
        'patent.critical': 'true',
      };
    }

    // Track health check endpoints (lower priority)
    if (event.request?.url?.includes('/api/health')) {
      return null; // Don't send health check errors
    }

    return event;
  },

  // Breadcrumb enrichment
  beforeBreadcrumb(breadcrumb) {
    // Track database query performance
    if (breadcrumb.category === 'db.query' || breadcrumb.category === 'database') {
      breadcrumb.category = 'database';
    }

    // Filter noisy breadcrumbs
    if (breadcrumb.category === 'fetch' && breadcrumb.data?.url?.includes('health')) {
      return null;
    }

    return breadcrumb;
  },

  // Trace propagation targets
  tracePropagationTargets: [
    'localhost',
    'arcup.local',
    'arcup.dev',
    /supabase\.co/,
    /vercel\.app/,
    /^\//,
  ],

  // Database monitoring
  attachStacktrace: true,
  maxBreadcrumbs: 100,
});
