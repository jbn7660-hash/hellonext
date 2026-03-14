# voice-report-worker

Async report-generation worker for the HelloNext voice pipeline.

## Purpose
Consumes a memo that already has a transcript (`voice_memos.transcript` or `voice_memo_cache.transcript`) and performs the post-transcription stages:
- fetch glossary
- fetch per-member AI scope context when available
- structure transcript via LLM
- persist `voice_memos.structured_json`
- create a `reports` draft when the memo is linked to an active member
- if cache state is `LINKED`, advance `voice_memo_cache` to `FINALIZED`

## Current contract
Input:
```json
{ "memoId": "uuid" }
```

Auth:
- deploy with `--no-verify-jwt`
- invoke with `Authorization: Bearer $VOICE_REPORT_WORKER_SECRET`

## Required secrets
- `OPENAI_API_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_URL` or `NEXT_PUBLIC_SUPABASE_URL`
- `VOICE_REPORT_WORKER_SECRET`

## Expected success shape
```json
{
  "ok": true,
  "processed": true,
  "result": {
    "memoId": "uuid",
    "skipped": false,
    "reportId": "uuid-or-null",
    "sectionsCount": 3,
    "errorTags": 2,
    "finalized": false
  }
}
```

## Important notes
- This worker expects transcription to already be complete.
- If `memo.structured_json` already exists, it returns a skip result instead of duplicating report generation.
- `FINALIZED` advancement only happens when the memo cache is already `LINKED`.
- `PREPROCESSED` memos can still be structured into draft content without forced finalization.
