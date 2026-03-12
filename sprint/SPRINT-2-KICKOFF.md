# Sprint 2 Kickoff — 핵심 AI 루프 (v0.2 Alpha)

날짜: 2026-03-12
프로젝트: HelloNext (hellonext monorepo)
담당: 민수
진행: 따리(OpenClaw)

## 목적 (Sprint Goal)
**음성 → 전사(Whisper) → 구조화(LLM) → 리포트 생성 → 알림**까지 최소 1회 E2E 성공.

## 스코프 / 비스코프
### In-scope
- OpenAI 연동(Whisper/LLM 호출) smoke test
- Cloudinary 업로드 smoke test
- Supabase Edge Functions 배포/호출(voice-to-report, voice-transcribe, voice-fsm-controller, send-notification/push-send)
- 음성→리포트 E2E 최소 1회 성공 및 로그/결과물 확보

### Out-of-scope (이번 스프린트 스킵)
- Kakao OAuth (account_email 권한 잠김 블로커) — backlog
- Toss Payments / Monetization

## 현재 전제/상태
- 로컬 dev 서버 구동 가능
- 로컬 build는 Sentry release 업로드가 실패할 수 있어 **로컬에서는 SENTRY 업로드 비활성**이 필요 (현재 apps/web build 스크립트에서 처리)
- Typecheck 에러 다수 존재하지만 build는 ignoreBuildErrors로 진행

---

## 작업 분해 (Epics → Tasks)

### Epic 2-1: 외부 API 연결

**T2-1-1 OpenAI 키/호출 smoke test (server-side)**
- Why: Edge Function/서버에서 OpenAI 호출이 가능한지 먼저 확인해야 뒤 작업이 막히지 않음
- Acceptance:
  - (로컬) 단일 API route 또는 스크립트로 OpenAI 호출 1회 성공
  - 에러 시: 401/429/timeout 등 원인 분류
- Test:
  - `curl` 또는 `pnpm` 스크립트로 확인

**T2-1-2 Whisper 전사 smoke test**
- Why: voice-transcribe의 핵심 의존성
- Acceptance:
  - 짧은 샘플 음성(5~15초)로 전사 텍스트 반환
- Test:
  - 로컬에서 샘플 파일 업로드/전사 실행

**T2-1-3 Cloudinary 업로드 smoke test**
- Why: swing video/voice memo 저장/썸네일 파이프라인의 기반
- Acceptance:
  - 파일 1개 업로드 후 public URL 반환
- Test:
  - 로컬에서 업로드 API/스크립트 실행

필요 env var (이 Epic):
- `OPENAI_API_KEY`
- `CLOUDINARY_CLOUD_NAME`
- `CLOUDINARY_API_KEY`
- `CLOUDINARY_API_SECRET`

---

### Epic 2-2: Edge Function 배포

**T2-2-1 Supabase CLI 설치/로그인 확인 + functions 목록 확인**
- Acceptance:
  - `supabase --version` OK
  - 프로젝트 링크/토큰 준비

**T2-2-2 voice-transcribe 배포 + 1회 호출 성공**
- Acceptance:
  - 배포 성공
  - 호출 시 전사 결과 반환 또는 명확한 에러(키 누락 등)

**T2-2-3 voice-fsm-controller 배포 + FSM 전이 1회 검증**
- Acceptance:
  - 배포 성공
  - voice_memo_state_log에 1개 이상 기록되거나, 로그로 전이 확인

**T2-2-4 voice-to-report 배포 + 리포트 생성 1회 성공**
- Acceptance:
  - DB에 report row 생성(또는 API가 리포트 JSON 반환)

**T2-2-5 send-notification/push-send 배포(또는 로컬에서 스텁) + 안전 점검**
- Acceptance:
  - 최소 “전송 시도 로그” 확인
  - CRITICAL 이슈(C4/C5) 존재하므로 배포 전 점검 포함

필요 env var (이 Epic):
- (Supabase) `SUPABASE_ACCESS_TOKEN`, `SUPABASE_PROJECT_REF` (또는 CLI 로그인)
- (Functions) `OPENAI_API_KEY` 등 (상기)

---

### Epic 2-3: 음성→리포트 E2E

**T2-3-1 E2E happy path 1회**
- Flow: pro가 음성 녹음 → 전사 → 구조화 → 리포트 생성 → (가능하면) 알림
- Acceptance:
  - 최종 리포트가 UI 또는 DB에서 확인 가능
  - 실패 시 어느 단계에서 끊겼는지 로그로 구분 가능

**T2-3-2 고아 메모(orphan memo) 시나리오**
- Acceptance:
  - target_id 미매핑 케이스가 시스템을 깨지 않고 처리됨

**T2-3-3 FSM 로그/관측성 정리**
- Acceptance:
  - 최소한 단계별 로그 키(voice_memo_id 등)로 트레이싱 가능

---

## 첫 PR 제안 (가장 작은 단위로 진척 내기)
**PR-1: OpenAI/Whisper/Cloudinary 연결을 로컬에서 검증하는 ‘smoke test’ 엔드포인트/스크립트 추가**
- 목표: Sprint 2의 가장 큰 외부 의존(키/네트워크/권한)을 초기에 확정
- 변경 범위 예:
  - `apps/web/src/app/api/health` 또는 별도 `api/smoke/*` route 추가
  - env var 이름만 문서화(`docs/` 또는 `sprint/SPRINT-2.md`)
- 검증:
  - 로컬에서 1회 호출 성공

---

## GitHub Issues 계획 (C)
> 실제 이슈 생성 전, 따리가 "생성할 이슈 목록"을 먼저 제시하고 주인님 확인을 받는다.

예상 이슈(초안):
1) Sprint2-1 OpenAI smoke test
2) Sprint2-1 Whisper transcription smoke test
3) Sprint2-1 Cloudinary upload smoke test
4) Sprint2-2 Deploy voice-transcribe
5) Sprint2-2 Deploy voice-fsm-controller
6) Sprint2-2 Deploy voice-to-report
7) Sprint2-3 E2E voice→report happy path
8) Blocker: Kakao OAuth account_email permission lock (backlog)

