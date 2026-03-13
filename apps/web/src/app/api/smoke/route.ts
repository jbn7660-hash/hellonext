import { NextResponse } from 'next/server';
import { createHash } from 'crypto';

export const runtime = 'nodejs';

type SmokeResult = {
  ok: boolean;
  error?: string;
  status?: number;
  latencyMs?: number;
  details?: Record<string, unknown>;
};

function json(status: number, body: unknown) {
  return new NextResponse(JSON.stringify(body, null, 2), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
    },
  });
}

function toErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'unknown_error';
}

async function safeJson<T>(response: Response): Promise<T | undefined> {
  try {
    return await response.json() as T;
  } catch {
    return undefined;
  }
}

function createSilentWav(durationMs = 300, sampleRate = 16000) {
  const bytesPerSample = 2;
  const numSamples = Math.max(1, Math.floor((sampleRate * durationMs) / 1000));
  const dataSize = numSamples * bytesPerSample;
  const buffer = Buffer.alloc(44 + dataSize);

  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write('WAVE', 8);
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16); // PCM fmt chunk size
  buffer.writeUInt16LE(1, 20); // Audio format: PCM
  buffer.writeUInt16LE(1, 22); // Mono
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * bytesPerSample, 28); // Byte rate
  buffer.writeUInt16LE(bytesPerSample, 32); // Block align
  buffer.writeUInt16LE(8 * bytesPerSample, 34); // Bits per sample
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataSize, 40);

  return buffer;
}

async function checkOpenAi(): Promise<SmokeResult> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return { ok: false, error: 'OPENAI_API_KEY is not set' };

  const start = Date.now();

  try {
    const file = new File([createSilentWav()], 'smoke.wav', { type: 'audio/wav' });
    const form = new FormData();
    form.append('file', file);
    form.append('model', 'whisper-1');
    form.append('response_format', 'json');
    form.append('temperature', '0');

    const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      body: form,
      signal: AbortSignal.timeout(8000),
    });

    const latencyMs = Date.now() - start;

    if (!res.ok) {
      const errorPayload = await safeJson<{ error?: { message?: string } }>(res);
      const reason = errorPayload?.error?.message ?? res.statusText;
      return {
        ok: false,
        status: res.status,
        latencyMs,
        error: `OpenAI transcription failed: ${reason}`,
      };
    }

    const body = await safeJson<{ text?: string }>(res);

    return {
      ok: true,
      status: res.status,
      latencyMs,
      details: {
        transcriptLength: body?.text?.length ?? 0,
        textSample: body?.text?.slice(0, 40) ?? '',
      },
    };
  } catch (error) {
    return { ok: false, error: `OpenAI request failed: ${toErrorMessage(error)}`, latencyMs: Date.now() - start };
  }
}

function signCloudinaryParams(params: Record<string, string>, apiSecret: string) {
  const paramString = Object.keys(params)
    .sort()
    .map((key) => `${key}=${params[key]}`)
    .join('&');

  return createHash('sha1').update(`${paramString}${apiSecret}`).digest('hex');
}

async function checkCloudinary(): Promise<SmokeResult> {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;

  const missing = [
    ['CLOUDINARY_CLOUD_NAME', cloudName],
    ['CLOUDINARY_API_KEY', apiKey],
    ['CLOUDINARY_API_SECRET', apiSecret],
  ]
    .filter(([, value]) => !value)
    .map(([key]) => key);

  if (missing.length) {
    return { ok: false, error: `Missing env: ${missing.join(', ')}` };
  }

  const start = Date.now();

  try {
    const folder = 'smoke-tests';
    const tags = 'smoke,healthcheck';
    const timestamp = Math.floor(Date.now() / 1000).toString();

    const paramsToSign = { folder, tags, timestamp };
    const signature = signCloudinaryParams(paramsToSign, apiSecret!);

    const form = new FormData();
    const payload = new Blob([`smoke-check-${timestamp}`], { type: 'text/plain' });
    form.append('file', payload, 'smoke.txt');
    form.append('api_key', apiKey!);
    form.append('timestamp', timestamp);
    form.append('folder', folder);
    form.append('tags', tags);
    form.append('signature', signature);

    const res = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/raw/upload`, {
      method: 'POST',
      body: form,
      signal: AbortSignal.timeout(8000),
    });

    const latencyMs = Date.now() - start;

    if (!res.ok) {
      const errorPayload = await safeJson<{ error?: { message?: string } }>(res);
      const reason = errorPayload?.error?.message ?? res.statusText;
      return {
        ok: false,
        status: res.status,
        latencyMs,
        error: `Cloudinary upload failed: ${reason}`,
      };
    }

    const body = await safeJson<{ public_id?: string; bytes?: number }>(res);

    return {
      ok: true,
      status: res.status,
      latencyMs,
      details: {
        publicId: body?.public_id,
        bytes: body?.bytes,
      },
    };
  } catch (error) {
    return { ok: false, error: `Cloudinary request failed: ${toErrorMessage(error)}`, latencyMs: Date.now() - start };
  }
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

  const [openai, cloudinary] = await Promise.all([checkOpenAi(), checkCloudinary()]);

  const ok = openai.ok && cloudinary.ok;

  return json(ok ? 200 : 500, {
    ok,
    openai,
    cloudinary,
  });
}
