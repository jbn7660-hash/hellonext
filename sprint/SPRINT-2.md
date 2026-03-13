# Sprint 2 — 핵심 AI 루프 (v0.2 Alpha)

Owner: 민수
Assistant: 따리
Repo: hellonext

## Goal
- 음성 → 전사(Whisper) → 구조화(LLM) → 리포트 생성 → 알림(푸시/알림톡)까지 최소 1개 E2E 성공.

## Quick links
- Visual dashboard: [STATUS-DASHBOARD.md](./STATUS-DASHBOARD.md)
- Current sprint status: [STATUS.md](./STATUS.md)
- PR-1 smoke validation notes: [team-sprint-2-pr1-smoketests.md](./team-sprint-2-pr1-smoketests.md)

## Non-goals (이번 스프린트에서 안 함)
- Kakao OAuth account_email 이슈 해결(블로커로 backlog)
- 결제/수익화(Toss)

## Sprint 2 Epics

### Epic 2-1: 외부 API 연결
- OpenAI: Whisper/Responses 호출 smoke test
- Cloudinary: 업로드 smoke test
- (옵션) 카카오 알림톡: 비즈채널/템플릿 심사 착수

### Epic 2-2: Edge Function 배포
- voice-to-report
- voice-transcribe
- voice-fsm-controller
- send-notification / push-send

### Epic 2-3: 음성→리포트 E2E
- 프로가 음성 녹음 → 전사 → 구조화 → 리포트 생성
- FSM 상태 전이 로그(voice_memo_state_log) 확인

## Definition of Done
- 로컬(dev)에서 최소 1회 E2E 성공 로그/스크린샷/결과물(리포트) 확보
- Edge Function 최소 1개 이상 실제 배포/동작 확인
- TODO 업데이트 + 남은 블로커 정리
