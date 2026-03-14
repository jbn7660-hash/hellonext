# Sprint Status — HelloNext

## Current sprint
- Sprint: 2 (core AI loop)
- Branch: sprint-2-core-loop

## Latest update (2026-03-14)
- Voice pipeline async split implemented:
  - `voice-transcribe`: ACK + job enqueue (already applied by 주인님)
  - `voice-transcribe-worker`: new, Whisper consumption + transcript persist
  - `voice-report-worker`: new, LLM structuring + report draft creation
  - All three deployed to remote (Supabase Edge Functions)
- Admin bypass (`VOICE_ADMIN_SECRET`) added to `voice-transcribe` for JWT-free smoke testing
- Storage `audio` bucket created on remote
- Admin smoke script (`run-voice-smoke-admin.sh`) created and verified:
  - memo creation → enqueue (202) → storage upload → worker Whisper call reached
  - Report worker downstream data path verified via mock transcript
- Architecture reliability review documented: [ARCHITECTURE_RELIABILITY_REVIEW_2026-03-14.md](./ARCHITECTURE_RELIABILITY_REVIEW_2026-03-14.md)

## Quick links
- Visual dashboard: [STATUS-DASHBOARD.md](./STATUS-DASHBOARD.md)
- Sprint overview: [SPRINT-2.md](./SPRINT-2.md)
- PR-1 smoke notes: [team-sprint-2-pr1-smoketests.md](./team-sprint-2-pr1-smoketests.md)
- PR draft: [PR-1-DRAFT.md](./PR-1-DRAFT.md)
- Voice pipeline maintenance: [VOICE_PIPELINE_MAINTENANCE_2026-03-14.md](./VOICE_PIPELINE_MAINTENANCE_2026-03-14.md)
- Architecture review: [ARCHITECTURE_RELIABILITY_REVIEW_2026-03-14.md](./ARCHITECTURE_RELIABILITY_REVIEW_2026-03-14.md)

## Latest update (2026-03-14 session 2)
- Groq fallback added to voice-transcribe-worker (Whisper) and voice-report-worker (ChatGPT)
- All 13 Edge Functions deployed to remote (was 4, now 13)
  - New: send-notification, push-send, causal-analysis, coupon-activate, edge-weight-calibration, measurement-confidence, swing-analysis, verification-handler, voice-to-report
- Frontend E2E routing/auth guards verified on local dev server
- Git pushed to sprint-2-core-loop (secret scanning resolved)

## Next actions
- Add GROQ_API_KEY to Supabase Edge Function secrets → then smoke test
- Or: charge OpenAI billing → smoke test with OpenAI directly
- Fix health check to call Supabase EF URLs directly (currently 404 on sub-routes)
- PR-1 close (external dependency validation — blocked on Whisper/ChatGPT quota)
- Kakao 알림톡 비즈채널/템플릿 심사 시작 (optional)

## Blockers
- OpenAI API quota exhausted — Whisper + ChatGPT 모두 429. Groq fallback code ready but GROQ_API_KEY not yet set.
- Kakao OAuth KOE205 / account_email permission locked. Skipped for Sprint 2.
- hellonext.app 도메인 미배포 상태 — 프론트엔드 배포 필요 시 별도 진행
