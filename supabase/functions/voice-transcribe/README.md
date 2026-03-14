# voice-transcribe

First rollout target for Sprint 2 Edge Function deployment.

## Purpose
- Accept an authenticated audio upload from the app
- Create or reuse a `transcription_jobs` row
- Upload the original audio into Supabase Storage (`audio` bucket)
- Return an immediate ACK (`202 Accepted`) with `jobId`
- Persist `audio_url` / `transcription_job_id` so downstream processing can continue from job state
- Separate request acceptance from transcription completion as the first architecture shift toward worker/job processing

## Required secrets
- Copy `.env.example` to `.env.voice-transcribe` in this folder and fill real values.
- Set `OPENAI_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, and either `SUPABASE_URL` or `NEXT_PUBLIC_SUPABASE_URL`.

## Deploy
```bash
# from repo root
ENV_FILE=supabase/functions/voice-transcribe/.env.voice-transcribe \
PROJECT_REF=hellonext \
./scripts/voice-transcribe-deploy.sh
```

If this function should accept end-user bearer tokens directly, keep JWT verification enabled.
Only use `--no-verify-jwt` if you intentionally want the function public and will enforce auth entirely in user code.

## Local serve
```bash
supabase functions serve voice-transcribe \
  --env-file .env.local
```

## Unified smoke runner
Use the unified runner instead of the older ad-hoc smoke scripts.

```bash
# local
USER_JWT='...' ./scripts/run-voice-smoke.sh local

# remote
USER_JWT='...' ./scripts/run-voice-smoke.sh remote
```

The runner loads the matching env file automatically, delegates to `scripts/voice-jwt-runtime-smoke.py`, and prints a short interpretation summary after the JSON output.

Remote-first recommendation for current maintenance state:
- prefer `./scripts/run-voice-smoke.sh remote`
- use a fresh JWT from an already verified account
- avoid repeated signup/token-farming attempts while email deliverability and rate limits are under pressure

Quick interpretation:
- `transcribe_status=200` → remote path healthy
- `transcribe_status=401` → JWT is stale/invalid; fetch a fresh JWT
- `transcribe_status=502` → auth passed; inspect Whisper/OpenAI upstream failure
- `transcribe_status=500` → function/runtime/config problem; inspect response body and secrets

## Minimal invoke example
```bash
curl -X POST \
  "$NEXT_PUBLIC_SUPABASE_URL/functions/v1/voice-transcribe" \
  -H "Authorization: Bearer $USER_JWT" \
  -F "audio=@./sample.m4a" \
  -F "voice_memo_id=$VOICE_MEMO_ID" \
  -F "duration=12"
```

`voice_memo_id`는 필수입니다. 먼저 `voice_memos` 레코드가 있어야 합니다.

If you populated `.env.voice-transcribe`, you can `source supabase/functions/voice-transcribe/.env.voice-transcribe` before running the curl command.

## Expected success shape
```json
{
  "accepted": true,
  "reused": false,
  "jobId": "uuid",
  "status": "processing",
  "storagePath": "voice-memos/<user>/<job>.m4a"
}
```

If an in-flight or completed job already exists for the same `voice_memo_id`, the function may return `reused: true` with the existing `jobId`.

## Deployment checklist
- Supabase Storage bucket `audio` exists
- `transcription_jobs` table exists and insert/update succeeds
- `voice_memos` and `voice_memo_cache` tables exist
- OpenAI key is set in Supabase function secrets
- Supabase CLI is logged in and can reach project ref `hellonext` (or override `PROJECT_REF`)
- Test with one real audio file after deploy

## 2026-03-14 maintenance notes
- Fixed cache state update key mismatch in `supabase/functions/voice-transcribe/index.ts`
  - before: `.eq('voice_memo_id', voiceMemoId)`
  - after: `.eq('memo_id', voiceMemoId)`
- Added env fallback handling for Edge/local execution:
  - `EDGE_SUPABASE_URL` → `SUPABASE_URL` → `NEXT_PUBLIC_SUPABASE_URL`
  - `EDGE_SUPABASE_SERVICE_ROLE_KEY` → `SUPABASE_SERVICE_ROLE_KEY`
- Tightened request validation for multipart input:
  - `audio` must be a real `File`
  - `audio.name` is required
  - `voice_memo_id` must be a non-empty string
- Improved Whisper upstream failure reporting so `transcription_jobs.error_message` and API response include upstream status/body.
- Added basic duplicate-job protection:
  - if the same `voice_memo_id` already has a `pending`/`processing` transcription job, the function returns `409` with the existing `jobId`
  - if the same `voice_memo_id` already has a latest `completed` job, the function reuses that result instead of creating a new job
- Current local blocker is no longer the PREPROCESSED transition mapping itself, but local runtime/container/env instability during E2E smoke (JWT boundary churn, edge-runtime container conflicts, and later `OPENAI_API_KEY` injection issues while serving functions locally).
- `voice-fsm-controller:initCache` was smoke-confirmed locally after the schema-aligned repair.
- The fastest remaining proof path is now remote smoke with a fresh JWT from an already verified account, using `./scripts/run-voice-smoke.sh remote`.
- Avoid repeated remote signup attempts for smoke auth while project email deliverability/rate limits are under pressure.
