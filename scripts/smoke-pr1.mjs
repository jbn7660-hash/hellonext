#!/usr/bin/env node

/**
 * PR-1 external dependency smoke runner.
 *
 * Calls the existing /api/smoke endpoint and exits non-zero on failure.
 * Uses SMOKE_TOKEN for auth and SMOKE_URL (optional) to override the target URL.
 */

const SMOKE_TOKEN = process.env.SMOKE_TOKEN;
const SMOKE_URL = process.env.SMOKE_URL || 'http://localhost:3000/api/smoke';

if (!SMOKE_TOKEN) {
  console.error('Missing SMOKE_TOKEN in environment.');
  process.exit(1);
}

async function main() {
  const start = Date.now();
  const res = await fetch(SMOKE_URL, {
    headers: { 'X-Smoke-Token': SMOKE_TOKEN },
  });

  const latencyMs = Date.now() - start;
  const text = await res.text();

  let payload;
  try {
    payload = JSON.parse(text);
  } catch (error) {
    console.error(`Failed to parse JSON response (${res.status}):`, error);
    console.error(text);
    process.exit(1);
  }

  const openaiOk = payload?.openai?.ok;
  const cloudinaryOk = payload?.cloudinary?.ok;

  const summary = {
    status: res.status,
    latencyMs,
    ok: payload?.ok,
    openai: openaiOk ? 'ok' : payload?.openai?.error || 'fail',
    cloudinary: cloudinaryOk ? 'ok' : payload?.cloudinary?.error || 'fail',
  };

  console.log(JSON.stringify(summary, null, 2));

  if (!payload?.ok) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('Smoke runner failed:', error);
  process.exit(1);
});
