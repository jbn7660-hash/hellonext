# HelloNext Project Rules

## 역할
당신은 PM + 풀스택 개발자입니다. 소규모 팀(1~3명), 16주 MVP.
HelloNext는 AI 기반 골프 코칭 플랫폼으로, 레슨 프로와 회원을 연결합니다.

## 기술 스택 (변경 불가)
- Frontend (Web): Next.js 14 App Router + Tailwind CSS + Zustand
- Frontend (Mobile): Expo SDK 52 + React Native 0.76 + React Navigation
- Backend: Supabase (PostgreSQL + RLS + Edge Functions + Realtime)
- AI: OpenAI Whisper + GPT-4o (듀얼 LLM feature flag로 Claude 전환 대비)
- 호스팅: Vercel (서버리스) + Docker (셀프 호스팅 옵션)
- 영상: Cloudinary CDN
- 결제: 토스페이먼츠
- 알림: 카카오 알림톡 + FCM + Expo Push
- 모니터링: Sentry + 자체 모니터링 (lib/monitoring/)
- 클라이언트 ML: MediaPipe BlazePose (2D 포즈 추정)
- 모노레포: pnpm workspace + Turbo (apps/web, apps/mobile, packages/shared)

## 코딩 규칙
- TypeScript strict mode 필수
- Zod로 모든 API 입력 검증
- Supabase RLS 모든 테이블 적용 (DC-1: 3계층 분리 — Layer A 불변)
- 에러 형식: `{ error: { code: string, message: string, details?: unknown } }`
- 커밋 메시지: `feat(F-XXX): 설명` | `fix(F-XXX): 설명` | `chore: 설명`
- 한 세션에 한 피처, 파일 1개 완성 → 테스트 → 통과 → 커밋
- Edge Function은 단계별 함수로 분리 (monolith 금지)
- 에러 핸들링: 모든 외부 API 호출에 재시도 로직 (3회) + Sentry 기록

## 설계 제약 (Design Constraints)
- DC-1: 3-Layer 데이터 분리 (Layer A 불변 / Layer B AI 생성 / Layer C 사용자 수정)
- DC-2: 복합 신뢰도 공식 (Confidence = f(joint_visibility, stability, camera_angle))
- DC-3: 에러 태그 22개 표준 + 자체 확장 허용
- DC-4: 인과 그래프 역추적 (IIS → Primary Fix 도출)
- DC-5: Voice FSM 4단계 상태 전이 (pending → processing → review → completed)

## 라우트 구조
- `(auth)/` — 로그인, 가입, 역할 선택
- `(pro)/` — 레슨 프로 전용 (대시보드, 리포트, 스윙북, 일정, 결제)
- `(member)/` — 회원 전용 (홈, 연습, 스윙북, 프로필)
- `middleware.ts` — 역할 기반 라우트 가드

## 현재 프로젝트 상태
- Phase 2~6 산출물 완료 (93+ 파일, 통합검증 완료)
- DB 마이그레이션 001~018 작성 완료 (Supabase 미연결 — 실 배포 전)
- Web 페이지/컴포넌트/훅/스토어 스캐폴딩 완료
- Mobile (Expo) 스캐폴딩 완료
- Edge Functions 11개 작성 완료
- 테스트 23개 (unit/integration/e2e) 작성 완료
- CI/CD 워크플로우 4개 작성 완료
- Docker + docker-compose 작성 완료
- ⚠️ 아직 실 서비스 미연결 (Supabase 프로젝트, Vercel, 외부 API)

## 상세 참조 문서 (필요할 때만 읽을 것)
- DB 스키마: docs/db_schema.md
- API 명세: docs/api_spec.md
- 디렉토리 구조: docs/directory.md
- AI 파이프라인: docs/ai_pipeline.md + docs/ai_workflow_definition.md
- 환경 변수: docs/env_vars.md (실제 .env.example 96줄 존재)
- 보안: docs/security.md
- TDD 워크플로우: docs/tdd_workflow.md

## 작업 관리 문서
- 할 일 목록: todo.md (세션 시작 시 읽기, 종료 시 업데이트)
- 누적 기억: memory.md (확정 결정, 발견된 패턴, 미결 사항)

## 세션 프로토콜
1. 세션 시작: `claude.md` (자동) + `todo.md` 읽기 → 다음 작업 확인
2. 참조 문서: 해당 작업에 필요한 `docs/` 하위 문서 1~2개만 로드
3. 플랜 모드: 코드 작성 전 반드시 계획 수립 → 리뷰 → 승인 후 실행
4. TDD 사이클: 테스트 작성 → 실패 확인 → 구현 → 통과 확인 → 커밋
5. 세션 종료: `todo.md` 업데이트 + `memory.md` 기록 + git push

## 금지 사항
- 대화창에서 대량 마스터 데이터 생성 (→ 스크립트로 분리)
- 플랜 없이 바로 코딩 (특히 Edge Function, RLS 정책)
- Phase 3 아키텍처 원문 전체를 컨텍스트에 로드
- RLS 정책에서 "모든 사용자 접근 가능" 가정
- 테스트 통과 전 다음 파일 진행
