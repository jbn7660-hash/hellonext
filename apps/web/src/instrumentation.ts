/**
 * Next.js Instrumentation (14.2+)
 *
 * Server-side and edge Sentry initialization via the register() hook.
 * Client-side init remains in sentry.client.config.ts (auto-loaded by @sentry/nextjs).
 *
 * @see https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation
 */

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./instrumentation-node');
  }

  if (process.env.NEXT_RUNTIME === 'edge') {
    await import('./instrumentation-edge');
  }
}
