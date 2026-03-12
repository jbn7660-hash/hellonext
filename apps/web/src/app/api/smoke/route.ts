import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

function json(status: number, body: unknown) {
  return new NextResponse(JSON.stringify(body, null, 2), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
    },
  });
}

async function checkOpenAi(): Promise<{ ok: boolean; error?: string; status?: number; latencyMs?: number }> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return { ok: false, error: 'OPENAI_API_KEY is not set' };

  const start = Date.now();
  try {
    const res = await fetch('https://api.openai.com/v1/models', {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      signal: AbortSignal.timeout(5000),
    });

    return {
      ok: res.ok,
      status: res.status,
      latencyMs: Date.now() - start,
      ...(res.ok ? {} : { error: `OpenAI responded with status ${res.status}` }),
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'unknown_error';
    return { ok: false, error: `OpenAI request failed: ${msg}`, latencyMs: Date.now() - start };
  }
}

function checkCloudinary(): { ok: boolean; error?: string } {
  const required = ['CLOUDINARY_CLOUD_NAME', 'CLOUDINARY_API_KEY', 'CLOUDINARY_API_SECRET'];
  const missing = required.filter((k) => !process.env[k]);
  if (missing.length) return { ok: false, error: `Missing env: ${missing.join(', ')}` };
  return { ok: true };
}

export async function GET(request: Request) {
  const expected = process.env.SMOKE_TOKEN;
  const provided = request.headers.get('x-smoke-token') ?? '';

  if (!expected) {
    return json(500, {
      ok: false,
      error: 'SMOKE_TOKEN is not set on server',
    });
  }

  if (provided !== expected) {
    return json(401, {
      ok: false,
      error: 'Unauthorized',
    });
  }

  const [openai, cloudinary] = await Promise.all([checkOpenAi(), Promise.resolve(checkCloudinary())]);

  const ok = openai.ok && cloudinary.ok;

  return json(ok ? 200 : 500, {
    ok,
    openai,
    cloudinary,
  });
}
