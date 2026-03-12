/**
 * Sentry Client Configuration (v3.0 Patent Engine Monitoring)
 * Enhanced performance monitoring, smart session replay, patent-specific context
 *
 * Auto-loaded by @sentry/nextjs
 */

import * as Sentry from '@sentry/nextjs';

// Smart sampling based on error occurrence
let errorOccurred = false;

Sentry.init({
  // DSN Configuration
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  enabled: process.env.NODE_ENV === 'production',
  environment: process.env.NODE_ENV,

  // Version tracking
  release: process.env.NEXT_PUBLIC_APP_VERSION || '2.0.0',

  // Dynamic sampling based on errors
  tracesSampleRate: errorOccurred
    ? 1.0
    : process.env.NODE_ENV === 'production'
      ? 0.1
      : 1.0,

  // Session replay with smart sampling based on error occurrence
  replaysSessionSampleRate: process.env.NODE_ENV === 'production' ? 0.05 : 1.0,
  replaysOnErrorSampleRate: 1.0, // Always replay on errors

  // Integrations
  integrations: [
    // Session replay with privacy
    Sentry.replayIntegration({
      maskAllText: true,
      blockAllMedia: true,
      maskAllInputs: true,
      mask: ['.sensitive-data'],
    }),

    // Console capture for debugging
    Sentry.captureConsoleIntegration({
      levels: ['error', 'warn'],
    }),

    // User interaction tracking
    Sentry.breadcrumbsIntegration({
      dom: true,
      xhr: true,
      fetch: true,
    }),

    // HTTP client integration for request/response tracking
    Sentry.httpClientIntegration(),
  ],

  // Enhanced error filtering
  beforeSend(event, hint) {
    // Mark error occurrence for smart sampling
    errorOccurred = true;

    // Sanitize sensitive information
    if (event.request?.cookies) {
      event.request.cookies = {};
    }
    if (event.request?.headers) {
      delete event.request.headers['authorization'];
      delete event.request.headers['cookie'];
    }

    // Filter out ResizeObserver errors (harmless)
    if (hint.originalException instanceof TypeError) {
      const typeError = hint.originalException as TypeError;
      if (typeError.message?.includes('ResizeObserver')) {
        return null;
      }
    }

    // Enhance patent engine context
    if (event.message?.includes('patent') || event.tags?.['source'] === 'patent-engine') {
      event.level = 'error';
      event.tags = {
        ...event.tags,
        'source': 'patent-engine',
        'patent.critical': 'true',
      };
      event.contexts = {
        ...event.contexts,
        patent_engine: {
          layer: 'client',
          component: extractPatentComponent(event.message || ''),
        },
      };
    }

    // Add Korean PII scrubbing patterns
    if (event.message) {
      // Korean phone number pattern: 010-1234-5678
      event.message = event.message.replace(/\d{2,3}-\d{3,4}-\d{4}/g, 'XXX-XXXX-XXXX');
    }

    return event;
  },

  // Breadcrumb enrichment
  beforeBreadcrumb(breadcrumb, hint) {
    // Ignore debug console logs
    if (breadcrumb.category === 'console' && breadcrumb.level === 'debug') {
      return null;
    }

    // Enrich patent engine breadcrumbs with context
    if (breadcrumb.message?.includes('patent') || breadcrumb.category?.includes('patent')) {
      breadcrumb.category = 'patent-engine';
      breadcrumb.data = {
        ...breadcrumb.data,
        'layer_access': extractLayerAccess(breadcrumb.message || ''),
        'confidence_calc': breadcrumb.message?.includes('confidence'),
        'fsm_transition': breadcrumb.message?.includes('fsm'),
      };
    }

    // Filter noisy breadcrumbs
    if (breadcrumb.category === 'fetch' && breadcrumb.data?.url?.includes('health')) {
      return null; // Ignore health check fetches
    }

    return breadcrumb;
  },

  // Error URL filtering
  denyUrls: [
    /extensions\//i,
    /^chrome:\/\//i,
    /devtools/i,
  ],

  // Allowed source URL patterns
  allowUrls: [
    /https?:\/\/(?:www\.)?arcup\.local/,
    /https?:\/\/(?:www\.)?hellonext\.io/,
    /https?:\/\/(?:www\.)?arcup\.dev/,
    /https?:\/\/hellonext\.vercel\.app/,
  ],

  // Trace propagation targets for distributed tracing
  tracePropagationTargets: [
    'localhost',
    'arcup.local',
    'arcup.dev',
    'hellonext.io',
    'hellonext.vercel.app',
    /^\//,
  ],

  // Maximum breadcrumbs to capture
  maxBreadcrumbs: 100,

  // Attach stack traces
  attachStacktrace: true,

  // Feature flags for monitoring
  initialScope: {
    tags: {
      'patent.fsm_enabled': process.env.PATENT_FSM_ENABLED === 'true',
      'patent.verification_enabled': process.env.PATENT_VERIFICATION_ENABLED === 'true',
    },
  },
});

// Helper function to extract patent component from error message
function extractPatentComponent(message: string): string {
  if (message.includes('fsm')) return 'fsm-controller';
  if (message.includes('causal')) return 'causal-analysis';
  if (message.includes('confidence')) return 'measurement-confidence';
  if (message.includes('verification')) return 'verification-handler';
  if (message.includes('edge-weight')) return 'edge-weight-calibration';
  return 'unknown';
}

// Helper function to extract layer access context
function extractLayerAccess(message: string): string {
  if (message.includes('data-layer')) return 'data-layer';
  if (message.includes('query-layer')) return 'query-layer';
  if (message.includes('measurement-layer')) return 'measurement-layer';
  return 'unknown';
}

// Set user feedback context for error reports
Sentry.setUser({
  id: undefined, // Don't collect user ID
  email: undefined, // Don't collect email
});

// TODO: Configure Sentry feedback widget (v8 API migration pending)
