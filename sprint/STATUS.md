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

## Latest update (2026-03-15)
- **E2E Voice Pipeline PASS** — 전체 파이프라인 성공:
  - Enqueue (voice-transcribe) → 202
  - Transcription (voice-transcribe-worker, Groq Whisper fallback) → 200 ("감사합니다" 전사, 1.4s)
  - Report (voice-report-worker, Groq LLM) → 200 (구조화 리포트 생성)
- 13개 Edge Function 전부 `--no-verify-jwt`로 재배포 (JWT gateway 충돌 해결)
- DB migration: `transcription_jobs_provider_check`에 `'groq'` 추가
- Worker 에러 직렬화 개선 (`[object Object]` → JSON.stringify)
- typecheck 0 에러 확인 (빌드 캐시 정리)

## Next actions
- Sprint 2-3: 실제 음성 녹음 E2E (프로 UI → 전사 → 리포트 생성 → 프리뷰)
- FSM 상태 전이 전체 검증 (UNBOUND → PREPROCESSED → LINKED → FINALIZED)
- Sprint 1-4: 기본 플로우 E2E (가입 → 온보딩 → 대시보드)
- PR-1 close 가능 (외부 API 검증 완료)

## Blockers
- OpenAI API quota exhausted — Groq fallback으로 우회 완료
- Kakao OAuth KOE205 / account_email permission locked. Skipped for Sprint 2.
- hellonext.app 도메인 미배포 상태 — 프론트엔드 배포 필요 시 별도 진행
