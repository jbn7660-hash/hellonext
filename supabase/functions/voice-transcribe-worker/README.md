# voice-transcribe-worker

Second-stage worker for the HelloNext voice pipeline.

## Purpose
- Pick up a queued `transcription_jobs` row
- Download original audio from Supabase Storage (`audio` bucket)
- Send audio to OpenAI Whisper
- Persist transcript/result fields back into `transcription_jobs`
- Update `voice_memos.transcript`
- Advance `voice_memo_cache` from `UNBOUND` → `PREPROCESSED` when cache exists

This is the first real consumer for the new ACK + job boundary introduced in `voice-transcribe`.

## Required secrets
- `OPENAI_API_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_URL` or `NEXT_PUBLIC_SUPABASE_URL`
- `VOICE_TRANSCRIBE_WORKER_SECRET` (recommended for remote invoke)

Optional:
- `ALLOW_UNAUTHENTICATED_WORKER_INVOKE=true` for local-only ad-hoc testing

## Behavior
### Default mode
POST with no `jobId`:
- finds the oldest eligible queued job (`pending` / `processing`)
- claims it
- processes one job

### Targeted mode
POST `{ "jobId": "..." }`:
- processes the specified job
- useful for deterministic smoke/debug flows

## Expected success shape
```json
{
  "ok": true,
  "processed": true,
  "result": {
    "jobId": "uuid",
    "memoId": "uuid",
    "transcriptLength": 123,
    "processingMs": 4567,
    "stateAdvanced": true
  }
}
```

If there is no queued job:
```json
{
  "ok": true,
  "processed": false,
  "reason": "no_job"
}
```

## Invoke example
```bash
curl -X POST \
  "$NEXT_PUBLIC_SUPABASE_URL/functions/v1/voice-transcribe-worker" \
  -H "Authorization: Bearer $VOICE_TRANSCRIBE_WORKER_SECRET" \
  -H "Content-Type: application/json" \
  -d '{}'
```

Target a specific job:
```bash
curl -X POST \
  "$NEXT_PUBLIC_SUPABASE_URL/functions/v1/voice-transcribe-worker" \
  -H "Authorization: Bearer $VOICE_TRANSCRIBE_WORKER_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"jobId":"<uuid>"}'
```

## Important current limitation
This worker currently stops at transcript completion / FSM PREPROCESSED advancement.
It does **not yet** continue into full report generation or downstream report worker orchestration.

So the pipeline is now:
1. `voice-transcribe` → ACK + enqueue
2. `voice-transcribe-worker` → consume job + transcript persistence + PREPROCESSED
3. next stage still needed → report-generation worker / orchestration
