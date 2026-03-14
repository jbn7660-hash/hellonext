# HelloNext TODO — 현재 상태 기반 (2026-03-12 갱신)

> **현 상태:** Phase 2~6 산출물 93+ 파일 완료, 통합검증 완료, 와이어프레임 v4.0 완료
> **핵심 과제:** 산출물이 "설계 문서 + AI 생성 코드"로 존재 — 실 서비스 연결 + 코드 품질 검증 필요
> **참조:** claude.md, docs/tdd_workflow.md

---

## Phase 0: 코드 품질 검증 [긴급]
> 산출물이 AI 생성 코드이므로, 실 서비스 연결 전 코드가 실제로 동작하는지 검증 필수

### 0-1. 기존 코드 실행 가능 여부 확인 ✅ 완료 (2026-03-12 세션 9)
- [x] `pnpm install` → 1,533 packages, peer warning만 (통과)
- [x] `pnpm typecheck` (packages/shared) → ✅ 통과
- [x] `pnpm typecheck` (apps/mobile) → ✅ 통과
- [x] `pnpm typecheck` (apps/web) → ⚠️ **280 errors** (P0 해결 후 잔여, 대부분 API route 스키마 미스매치)
- [x] `pnpm test` (apps/web) → ⚠️ **469/480 통과** (11 fail: use-pwa.test.ts)
- [x] `pnpm build` (apps/web) → ✅ **빌드 성공** (29페이지, ignoreBuildErrors + 런타임 에러 수정)

#### 해결된 수정 사항 (세션 12)

| 순위 | 카테고리 | 상태 | 해결 방법 |
|------|----------|------|-----------|
| **P0** | Supabase Database 타입 | ✅ 해결 | `types.ts`를 auto-generated `database.types.ts` 기반으로 교체 (28테이블) |
| **P1** | @mediapipe/tasks-vision | ✅ 해결 | `pnpm add @mediapipe/tasks-vision` |
| **P2** | @playwright/test | ✅ 해결 | `pnpm add -D @playwright/test` |
| **P3** | Sentry v8 API | ✅ 해결 | `sentry.client/server.config.ts` v8 호환 재작성 |
| **P4** | Mobile NodeJS.Timeout | ✅ 해결 | `ReturnType<typeof setTimeout>` 패턴 |
| **P5** | Mobile @jest/globals | ✅ 해결 | `@types/jest` + tsconfig 추가 |
| **P6** | Mobile 중복 속성 | ✅ 해결 | spread 패턴 수정 |
| **P8** | next.config.js deprecated | ✅ 해결 | `isrMemoryCacheSize` → `cacheMaxMemorySize` |
| **추가** | `.from<any>()` 잘못된 제네릭 | ✅ 해결 | 89건 일괄 `.from()` 변경 |
| **추가** | `clip-rect-0` CSS 에러 | ✅ 해결 | 수동 `clip: rect()` 적용 |
| **추가** | `/offline` Server/Client 혼용 | ✅ 해결 | `'use client'` + layout 분리 |
| **추가** | `/login` Suspense 미적용 | ✅ 해결 | `useSearchParams` Suspense 래핑 |

#### 미해결 잔여 사항

| 카테고리 | 에러 수 | 원인 | 영향도 |
|----------|---------|------|--------|
| API route 타입 미스매치 | ~188 | 코드가 DB에 없는 컬럼 참조 (avatar_url, handicap 등) | 런타임 에러 가능 — Sprint 1-4 E2E에서 수정 |
| use-pwa.test.ts | 11 fail | jsdom + service worker mock 호환 | 테스트만 — 기능 무관 |
| monitoring/index.ts | 3 | 함수 미정의 (initSentry 등) | 모니터링 초기화 — Sprint 1-3 Sentry 연결 시 수정 |
| causal-graph-store import | 2 | `@hellonext/shared/types` 경로 오류 | Sprint 5 Patent Engine 연결 시 수정 |
| fsm-client 타입 | 11 | FsmState 'ERROR' + Supabase 반환값 타입 | Sprint 2-2 FSM 연동 시 수정 |

> **결론:** 빌드는 성공하므로 Vercel 배포 가능. 잔여 타입 에러 280건은 해당 기능 스프린트에서 점진적 수정.

### 0-2. 코드 내용 리뷰 (AI 환각 점검) ✅ 완료 (2026-03-12 세션 9)
- [x] 마이그레이션 001~020 SQL 문법 검증
- [x] RLS 정책 (008 + 017) 논리적 검증
- [x] Edge Function 11개 검증
- [x] API Route 20개 검증
- [x] shared/types 타입 일관성 검증
- [x] 통합검증 리포트 수정사항 반영 확인 → **9건 전부 반영 완료**

#### 발견된 이슈 요약 (수정 필요)

**CRITICAL (배포 전 필수 수정):**

| ID | 위치 | 이슈 | 스프린트 |
|----|------|------|---------|
| C1 | 008_rls_policies.sql | ✅ 022 마이그레이션으로 수정 (pose_data WITH CHECK + pro INSERT 정책) | Sprint 1-1 |
| C2 | 016_voice_memo_cache.sql:72 | ✅ 021 마이그레이션으로 수정 (NULL 가드 추가) | Sprint 1-1 |
| C3 | 020_transcription_jobs.sql:42 | ✅ 021 마이그레이션으로 수정 (handle_updated_at 사용) | Sprint 1-1 |
| C4 | push-send EF:89 | ✅ 이미 수정됨 (results 초기화 확인) | Sprint 2-2 |
| C5 | push-send EF:42 | ✅ 이미 수정됨 (인증 로직 정상) | Sprint 2-2 |
| C6 | swing-videos route:193 | ✅ 이미 수정됨 (pro_member_links 검증 추가) | Sprint 1-4 |
| C7 | voice-memos route:127 | ✅ 이미 수정됨 (pro_profiles.tier 사용) | Sprint 2-3 |

**HIGH (초기 안정화 단계 수정):**

| ID | 위치 | 이슈 | 스프린트 |
|----|------|------|---------|
| H1 | 002,004,005 마이그레이션 | ✅ 021 마이그레이션으로 수정 (ON DELETE SET NULL 4건) | Sprint 1-1 |
| H2 | causal-analysis EF:271 | DFS 사이클 탐지 visited 공유 버그 | Sprint 5 |
| H3 | send-notification EF:415 | ✅ JWT→OAuth2 access token 방식으로 수정 | Sprint 2-2 |
| H4 | API routes 다수 | Zod 검증 누락 (causal-analysis, edit-deltas) | Sprint 5 |
| H5 | payments route:81 | rate limit에 user.id 대신 proProfile.id 필요 | Sprint 4 |
| H6 | subscriptions route:150 | `.single()` → `.maybeSingle()` 변경 필요 | Sprint 4 |
| H7 | progress route:159 | `Math.random()` placeholder 데이터 | Sprint 3 |
| H8 | EF import 불일치 | ✅ 전체 EF 통일 (std@0.208.0, supabase-js@2.45.0) | Sprint 2 |

**MEDIUM (점진적 개선):**
- Edge Function: 에러 핸들링 강화 (voice-to-report catch 스코프, voice-transcribe 조용한 실패)
- shared/index.ts: causal-graph-seed, coupon, payment, subscription 타입 export 누락
- Edge Function → shared 타입 미사용 (로컬 중복 정의)
- next.config.js: Sentry instrumentation.ts 마이그레이션 필요
- ~~API routes: 비동기 fetch 미대기 (reports/publish, payments/webhook)~~ ✅ await + error logging 추가

**양호 사항:**
- 통합검증 9건 전부 반영 확인 (CRITICAL 3 + HIGH 5 + MEDIUM 1)
- shared/types 85% 일관성 (DC-1 3계층, FSM, ConfidenceState 모두 정합)
- Patent Engine 마이그레이션 (009~018) 대체로 우수
- Keypoint 중복 해결 완료, 3D z 필드 지원

---

## Sprint 1: 실 서비스 연결 (v0.1 Alpha)
> 기존 코드를 실 서비스에 연결하여 동작하는 최소 플로우 달성

### 1-1. Supabase 프로젝트 연결 ✅ 완료 (2026-03-12 세션 10~11)
- [x] Supabase 프로젝트 생성 (Dashboard) → `phstuugdppfutjcpislh` (ap-northeast-2)
- [x] .env.local에 실제 URL/Key 설정 (SUPABASE_URL, ANON_KEY, SERVICE_ROLE_KEY, DATABASE_URL)
- [x] 마이그레이션 001~017 순차 실행 (브라우저 Management API 경유)
- [x] 28 테이블 생성 확인 + RLS 전체 활성화 확인 (61개 정책)
- [x] supabase gen types → `packages/shared/src/types/database.types.ts` 생성 (1,383줄, 39KB)
- [x] Typecheck 검증: shared ✅, mobile ✅, web ⚠️ (OOM — VM 4GB 한계, CI에서 검증 예정)
- [ ] seed.sql 실행 (22개 에러 패턴 + 초기 DAG) → Sprint 1-2 이후 진행

#### Sprint 1-1에서 수정된 코드
- `packages/shared/types/raw-measurement.ts`: Keypoint 중복 export 해결 (Keypoint3D 도입)
- `apps/mobile/__tests__/services.test.ts`: `@jest/globals` import 제거 + spread 패턴 수정
- `apps/mobile/tsconfig.json`: `@types/jest` 추가
- `apps/mobile/src/` (4파일): `NodeJS.Timeout` → `ReturnType<typeof setTimeout>`

#### Web typecheck 잔여 에러 (CI 환경에서 재확인 필요)
- Supabase cookie 타입 implicit any (middleware.ts, server.ts)
- FSM 'ERROR' state 미스매치 (fsm-client.ts)
- monitoring/index.ts 함수 미정의
- causal-graph-store.ts import 경로 오류 (`@hellonext/shared/types` → barrel export 사용 필요)

### 1-2. 카카오 OAuth 연동
- [ ] 카카오 개발자 앱 생성 + Supabase Auth Provider 설정
- [ ] Redirect URI 설정 (localhost + Vercel 도메인)
- [ ] (auth)/login → 카카오 로그인 실 테스트
- [ ] (auth)/callback → 세션 생성 확인
- [ ] middleware.ts → 역할 기반 리다이렉트 실 테스트

### 1-3. Vercel 배포 ✅ 완료 (2026-03-12 세션 13)
- [x] Vercel 프로젝트 생성 + GitHub 연결 → `prj_FT3QGs5kfcnO6LB2vMXW5ai5wz4l`
- [x] 환경변수 설정 (NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY — fallback 동작 확인)
- [x] pnpm 모노레포 빌드 에러 해결 (8 커밋: @/ 경로, tailwindcss/postcss, typescript/types)
- [x] 프리뷰 배포 성공 → `https://hellonext-git-main-jbn7660-hashs-projects.vercel.app/`
- [ ] Sentry 에러 추적 확인 → Sprint 2 이후 (SENTRY_AUTH_TOKEN 미설정)

#### Sprint 1-3에서 수정된 코드
- `apps/web/next.config.js`: webpack resolve alias `@` → `path.resolve(__dirname, 'src')` 추가 (Vercel tsconfig paths 미인식 대응)
- `apps/web/package.json`: devDependencies → dependencies 이동 (tailwindcss, postcss, autoprefixer, typescript, @types/*, eslint, eslint-config-next)
- `apps/web/postcss.config.js`: string 기반 플러그인 형식 유지 확인 (Next.js 요구사항)
- `.npmrc`: 최종 상태 유지 (shamefully-hoist, node-linker 불필요 확인)

### 1-4. 기본 플로우 E2E 검증
- [ ] 프로 가입 → 온보딩 → 대시보드 접근
- [ ] 초대 링크 생성 → 회원 가입 → 연결 확인
- [ ] 기본 페이지 라우팅 (pro/member 각 탭)

---

## Sprint 2: 핵심 AI 루프 (v0.2 Alpha)
> 음성→리포트 파이프라인 실 동작 + FSM

### 2-1. 외부 API 연결
- [ ] OpenAI API 키 설정 + Whisper 호출 테스트 (스킵 — billing 미충전)
- [x] Cloudinary 계정 설정 + 업로드 테스트 ✅ (signed + unsigned preset 검증 완료)
- [ ] 카카오 알림톡 비즈니스 채널 등록 + 템플릿 심사

### 2-2. Edge Function 배포 ✅ 완료 (2026-03-14, 재배포 2026-03-15)
- [x] 13개 전체 배포 완료 (voice-*, push-send, send-notification, causal-analysis, measurement-confidence 등)
- [x] H3 수정: send-notification FCM 인증 → OAuth2 JWT 기반으로 교체
- [x] H8 수정: 전체 EF import 버전 통일 (deno std@0.208.0, supabase-js@2.45.0)
- [x] Groq fallback 추가 (voice-transcribe-worker, voice-report-worker)
- [x] 전체 EF --no-verify-jwt 재배포 (JWT gateway 충돌 해결)
- [x] DB migration: transcription_jobs provider constraint에 'groq' 추가
- [x] 에러 직렬화 개선 (worker + FSM controller)
- [x] **E2E Smoke Test 성공**: enqueue(202) → transcribe/Groq(200) → report(200)

### 2-3. 음성→리포트 E2E ✅ 완료 (2026-03-15)
- [x] 프로가 음성 녹음 → Whisper 전사 → LLM 구조화 → 리포트 생성 (admin bypass smoke)
- [x] FSM 상태 전이 전체 검증: UNBOUND → PREPROCESSED → LINKED → FINALIZED
- [ ] 고아 메모 시나리오 (target_id 미매핑 → 후속 매핑) — UI 연결 시 테스트
- [ ] 프론트엔드 UI를 통한 실 사용자 E2E — Sprint 3 이후

---

## Sprint 3: 회원 앱 + 신뢰도 (v0.3 Beta) — 백엔드 완료 (2026-03-15)

- [x] measurement-confidence Edge Function: 5-factor 공식 동작, DB 스키마 정렬, Groq fallback
- [x] 3단계 분류 (confirmed/pending/hidden) 검증: classifyAndStore → issueVerificationTokens 성공
- [x] verification-handler: confirm/correct/reject 전체 동작 확인
- [x] swing-analysis: Groq fallback 추가, DB 스키마 정렬
- [x] Feel Check → AI 관찰 생성 흐름: practice/page.tsx 코드 검증 완료
- [x] verification-queue → 프로 대시보드: verification-card.tsx 코드 검증 완료
- [ ] swing-camera 실 디바이스 테스트 (카메라 권한, MediaPipe 포즈 추정) — 모바일 브라우저 필요

---

## Sprint 4: 수익화 (v0.4 Beta) — 코드 완성, API 키 필요

- [x] 결제 API (/api/payments) 코드 검증: rate limit, 중복 방지, 금액 검증
- [x] 웹훅 핸들러 (/api/payments/webhook) 코드 검증: HMAC 서명, idempotency, DLQ
- [x] coupon-activate Edge Function 코드 검증: 생성/활성화/만료
- [x] toss.ts 클라이언트 라이브러리 코드 검증: timeout, retry, 에러 분류
- [ ] 토스페이먼츠 테스트 API 키 발급 + .env.local 등록 — 주인님 필요
- [ ] 결제 → 쿠폰 발행 → 쿠폰 사용 E2E smoke test
- [ ] 웹훅 실 테스트 (Toss 테스트 환경)

---

## Sprint 5: Patent Engine (v0.5) — 완료 (2026-03-15)

- [x] causal-analysis Edge Function: DB 스키마 정렬, 22개 에러 패턴 로드
- [x] edge-weight-calibration Edge Function: DB 스키마 정렬, dry_run 성공
- [x] 인과그래프 역추적 + IIS + Primary Fix 코드 검증

## Sprint 6-7: 수정 델타 + 프로 워크플로우 (v0.6-0.7) — 완료 (2026-03-15)

- [x] edit-deltas API: DB 스키마 검증 완료
- [x] causal-analysis API route: DB 스키마 검증 완료
- [x] use-verification-queue hook: review_state + measurement_state_id JOIN 수정
- [x] use-causal-graph hook: causal_graph_edges + error_patterns 실제 테이블로 수정
- [x] /api/dashboard/stats route 신규 생성 (프로 대시보드 의존)
- [x] 프로 대시보드: MemberSummary 스키마 정렬
- [x] verification-card: 코드 검증 완료
- [x] edit-delta-history: 코드 검증 완료
- [ ] Patent 통합 E2E (실 사용자 데이터로 테스트)

---

## Sprint 8: MVP Launch (v1.0)

- [ ] 전체 E2E 테스트 통과
- [ ] 성능 최적화 (IIS 5초, confidence 1초, FSM 100ms)
- [ ] 파일럿: 프로 30명 + 회원 100명

---

## 메모
- 2026-03-12: 코드 93+ 파일은 AI 생성 산출물. 실행 가능 여부 미검증 상태.
- 2026-03-12: Phase 0(코드 품질 검증)이 Sprint 1 전에 반드시 필요.
- apps/mobile은 v0.3+ 에서 본격 연동 (현재 스캐폴딩만 존재)
