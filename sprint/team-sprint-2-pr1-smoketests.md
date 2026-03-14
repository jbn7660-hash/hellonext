# Team: Sprint 2 PR-1 — Smoke Tests (HelloNext)

## Objective
Create the FIRST PR for Sprint 2: add minimal, verifiable smoke tests for external dependencies.

### Scope (PR-1)
- Add one small API route to validate:
  - OpenAI API key works via a real Whisper transcription smoke call
  - Cloudinary upload works via a real lightweight upload smoke call
- Document required env var NAMES ONLY.
- Do not introduce production secrets into repo.

### Constraints
- Keep PR small and reviewable.
- Prefer server-side route under apps/web (Next.js app router).
- Include commands to validate locally.
- Do not log or return secrets.

### Implemented endpoint
- `apps/web/src/app/api/smoke/route.ts`

Behavior:
- Requires `X-Smoke-Token` header matching `SMOKE_TOKEN`
- Runs a real OpenAI transcription smoke check using a tiny in-memory WAV payload
- Runs a real Cloudinary raw upload smoke check using a tiny text blob
- Returns safe JSON only:
  - `ok`
  - `openai: { ok, error?, status?, latencyMs?, details? }`
  - `cloudinary: { ok, error?, status?, latencyMs?, details? }`

OpenAI details:
- Endpoint: `POST /v1/audio/transcriptions`
- Model: `whisper-1`
- Payload: tiny generated silent WAV (~0.3s)
- Safe response details:
  - `transcriptLength`
  - `textSample`

Cloudinary details:
- Endpoint: signed `raw/upload`
- Payload: tiny text blob
- Folder: `smoke-tests`
- Safe response details:
  - `publicId`
  - `bytes`

## Acceptance criteria
- Unauthorized requests return `401`
- Missing `SMOKE_TOKEN` on server returns `500`
- Valid authorized request executes both external checks
- OpenAI result confirms real transcription-path connectivity
- Cloudinary result confirms real upload-path connectivity
- No secrets are logged or returned in the JSON body

## Required env var names
- `SMOKE_TOKEN`
- `OPENAI_API_KEY`
- `CLOUDINARY_CLOUD_NAME`
- `CLOUDINARY_API_KEY`
- `CLOUDINARY_API_SECRET`

## Local validation
Start web app:

```bash
pnpm --filter @hellonext/web dev
```

Unauthorized check:

```bash
curl -i http://localhost:3000/api/smoke
```

Authorized smoke test:

```bash
curl -sS \
  -H "X-Smoke-Token: $SMOKE_TOKEN" \
  http://localhost:3000/api/smoke | jq
```

CLI shortcut (uses the same header, exits non-zero on failure):

```bash
pnpm smoke:deps
# override target if running against staging:
SMOKE_URL=https://staging.hellonext.app/api/smoke pnpm smoke:deps
```

Expected success shape:

```json
{
  "ok": true,
  "openai": {
    "ok": true,
    "status": 200,
    "latencyMs": 1234,
    "details": {
      "transcriptLength": 0,
      "textSample": ""
    }
  },
  "cloudinary": {
    "ok": true,
    "status": 200,
    "latencyMs": 456,
    "details": {
      "publicId": "smoke-tests/...",
      "bytes": 27
    }
  }
}
```

## Notes
- Cloudinary smoke uploads will leave tiny files under `smoke-tests/` unless separately cleaned up.
- This is intentional for PR-1: prove end-to-end dependency wiring before Edge Function rollout.
