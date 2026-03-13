# PR-1 Draft

## Title
feat(web): strengthen smoke route with real OpenAI transcription and Cloudinary upload checks

## Summary
This PR closes Sprint 2 PR-1 by upgrading the smoke endpoint from partial config-level checks to real end-to-end external dependency verification.

### What changed
- Expanded `apps/web/src/app/api/smoke/route.ts`
  - keeps `X-Smoke-Token` / `SMOKE_TOKEN` protection
  - replaces OpenAI `/v1/models` ping with a real Whisper transcription smoke call
  - replaces Cloudinary config-only validation with a real lightweight upload smoke call
  - returns safe JSON with status, latency, and minimal details only
- Updated env examples
  - added `SMOKE_TOKEN`
  - added Cloudinary key/secret names to staging example
- Added PR-1 smoke test notes and local validation steps
  - `sprint/team-sprint-2-pr1-smoketests.md`

## Why
Sprint 2 is still at the external dependency validation stage.
Before moving to Edge Function deployment, we need proof that the real OpenAI transcription path and the real Cloudinary upload path both work from the app runtime.

This makes PR-1 actually closeable instead of stopping at partial connectivity checks.

## Implementation details
### Smoke endpoint
Route:
- `apps/web/src/app/api/smoke/route.ts`

Behavior:
- rejects unauthorized requests with `401`
- fails fast if `SMOKE_TOKEN` is missing on server
- runs both checks in parallel after auth succeeds

### OpenAI smoke check
- uses `OPENAI_API_KEY`
- sends a tiny generated silent WAV to `POST /v1/audio/transcriptions`
- uses `whisper-1`
- returns only safe metadata:
  - `status`
  - `latencyMs`
  - `transcriptLength`
  - `textSample`

### Cloudinary smoke check
- uses signed upload with:
  - `CLOUDINARY_CLOUD_NAME`
  - `CLOUDINARY_API_KEY`
  - `CLOUDINARY_API_SECRET`
- uploads a tiny text blob to Cloudinary `raw/upload`
- stores under `smoke-tests/`
- returns only safe metadata:
  - `status`
  - `latencyMs`
  - `publicId`
  - `bytes`

## Security / ops notes
- no secrets are logged or returned
- endpoint remains protected by `X-Smoke-Token`
- Cloudinary smoke uploads will leave tiny files under `smoke-tests/`
  - acceptable for PR-1
  - cleanup/lifecycle policy can be added later if needed

## Required env vars
- `SMOKE_TOKEN`
- `OPENAI_API_KEY`
- `CLOUDINARY_CLOUD_NAME`
- `CLOUDINARY_API_KEY`
- `CLOUDINARY_API_SECRET`

## Local validation
```bash
pnpm --filter @hellonext/web dev
```

Unauthorized request:
```bash
curl -i http://localhost:3000/api/smoke
```

Authorized request:
```bash
curl -sS \
  -H "X-Smoke-Token: $SMOKE_TOKEN" \
  http://localhost:3000/api/smoke | jq
```

## Acceptance criteria
- [x] smoke endpoint requires secret header auth
- [x] OpenAI check validates real transcription path
- [x] Cloudinary check validates real upload path
- [x] response does not expose secrets
- [x] env examples document required variable names
- [x] local validation steps are documented
