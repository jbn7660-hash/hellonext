# Sprint 2 context extract (from todo.md)

## Sprint 2: 핵심 AI 루프 (v0.2 Alpha)
> 음성→리포트 파이프라인 실 동작 + FSM

### 2-1. 외부 API 연결
- [ ] OpenAI API 키 설정 + Whisper 호출 테스트
- [ ] Cloudinary 계정 설정 + 업로드 테스트
- [ ] 카카오 알림톡 비즈니스 채널 등록 + 템플릿 심사

### 2-2. Edge Function 배포
- [ ] voice-to-report 실 배포 + 테스트
- [ ] voice-fsm-controller 실 배포 + FSM 전이 검증
- [ ] voice-transcribe 실 배포 + Whisper 연동
- [ ] send-notification + push-send 실 배포

### 2-3. 음성→리포트 E2E
- [ ] 프로가 음성 녹음 → Whisper 전사 → LLM 구조화 → 리포트 생성
- [ ] 고아 메모 시나리오 (target_id 미매핑 → 후속 매핑)
- [ ] FSM 상태 전이 로그 확인 (voice_memo_state_log)

## Known blockers / notes
- Kakao OAuth blocked (account_email permission locked) — intentionally skipped.
- Local build requires Sentry upload disabled (SENTRY_AUTH_TOKEN empty) to avoid CI-style release upload errors.
- Typescript typecheck has many errors; build sets ignoreBuildErrors.
