# Phase 4+5 병합 — TDD 워크플로우 계획

> **기존 문제:** Phase 4(코드 생성) 이후 Phase 5(QA) 순차 실행 → 버그 후기 발견, 재작업 비용 증가
> **해결:** TDD로 Phase 4+5 동시 진행 — 파일 단위로 테스트 먼저, 코드 후속

---

## 1. 파일 단위 TDD 사이클

```
┌─────────────────────────────────────────────────┐
│  1. 플랜 모드                                      │
│     "이 파일의 구현 계획을 세워줘. 코드는 아직 쓰지 마."    │
│     → 계획 제시 → 리뷰 → 피드백 → 확정               │
├─────────────────────────────────────────────────┤
│  2. 테스트 먼저 (RED)                               │
│     "확정된 계획 기반으로 테스트를 먼저 작성해줘."           │
│     → 테스트 실행 → 전부 실패 확인 (빨간불)              │
├─────────────────────────────────────────────────┤
│  3. 구현 (GREEN)                                   │
│     "이제 테스트를 통과하는 코드를 작성해줘."               │
│     → 구현 → 테스트 실행 → 전부 통과 (초록불)            │
├─────────────────────────────────────────────────┤
│  4. 리팩토링 (REFACTOR)                             │
│     → 코드 정리 (중복 제거, 네이밍 개선)                 │
│     → 테스트 재실행 → 여전히 통과 확인                   │
├─────────────────────────────────────────────────┤
│  5. 커밋                                           │
│     git commit -m "feat(F-XXX): 기능 설명"           │
│     → 다음 파일로 이동                               │
└─────────────────────────────────────────────────┘
```

---

## 2. 테스트 전략 — Feature별

### Sprint 1 테스트 (인프라 + 인증)

| 파일 | 테스트 종류 | 테스트 도구 | 핵심 시나리오 |
|------|-----------|-----------|------------|
| Migration SQL | DB 단위 | Supabase CLI | 테이블 생성, 제약조건, 인덱스 확인 |
| RLS 정책 | DB 단위 | pgTAP 또는 SQL | 프로/회원/미인증 3역할 접근 제어 |
| middleware.ts | 단위 | Vitest | 미인증→리다이렉트, 프로→(pro), 회원→(member) |
| lib/supabase/*.ts | 단위 | Vitest | 클라이언트 생성, 세션 관리 |
| (auth)/login | 컴포넌트 | Vitest + Testing Library | 폼 유효성, 에러 표시, 카카오 버튼 |
| (auth)/signup | 컴포넌트 | Vitest + Testing Library | 가입 플로우, 약관 동의, Zod 검증 |
| E2E 플로우 | 통합 | Playwright | 가입→온보딩→초대→연결 전체 |

### Sprint 2 테스트 (AI 파이프라인)

| 파일 | 테스트 종류 | 핵심 시나리오 |
|------|-----------|------------|
| voice-to-report EF | 단위 | Whisper 응답 모킹 → 구조화 검증 → 에러 태그 매핑 |
| voice-fsm-controller | 단위 | FSM 전이 guard (UNBOUND→PREPROCESSED→LINKED→FINALIZED) |
| FSM 복구 | 통합 | 중단된 상태에서 재시작 → 올바른 단계부터 재개 |
| voice-memo-cache | DB 단위 | target_id NULL 불변조건, 상태 스킵 방지 트리거 |

### Sprint 3 테스트 (신뢰도 시스템)

| 파일 | 테스트 종류 | 핵심 시나리오 |
|------|-----------|------------|
| measurement-confidence | 단위 | 5-factor 공식 계산 정확도 |
| state-classifier | 단위 | T1=0.7, T2=0.4 경계값 테스트 |
| verification-handler | 통합 | confirm/correct/reject 3가지 응답 → 상태 전이 |
| raw_measurements | DB 단위 | DC-3 불변성 (UPDATE 차단 트리거) |

### Sprint 4 테스트 (결제)

| 파일 | 테스트 종류 | 핵심 시나리오 |
|------|-----------|------------|
| toss.ts | 단위 | 토스 API 모킹 → 결제 성공/실패/중복/만료 |
| webhook route | 통합 | 웹훅 검증 → 쿠폰 상태 전이 (unused→assigned→redeemed→expired) |
| coupon.ts | 단위 | 쿠폰 코드 유효성, 만료 로직 |

---

## 3. 테스트 인프라 (이미 구축 완료)

> ⚠️ 아래는 이미 존재하는 테스트 인프라입니다. 새로 설치할 필요 없습니다.

### 기존 테스트 파일 (23개)

**단위 테스트 (apps/web/src/__tests__/unit/):**
- hooks/use-voice-recorder.test.ts
- lib/confidence-score.test.ts, data-layer-separator.test.ts, edit-delta.test.ts
- lib/error-patterns.test.ts, format-utils.test.ts, fsm-transition.test.ts
- lib/patent-regression.test.ts, toss-payments.test.ts
- pwa/use-pwa.test.ts
- utils/validators.test.ts

**통합 테스트 (apps/web/src/__tests__/integration/):**
- api/causal-graph.test.ts, coupons.test.ts, payments.test.ts, verification.test.ts

**E2E 테스트 (apps/web/src/__tests__/e2e/):**
- coupon-redeem.spec.ts, measurement-confidence.spec.ts, mobile-responsive.spec.ts
- practice-flow.spec.ts, pwa-offline.spec.ts, voice-fsm.spec.ts, voice-to-report.spec.ts

**설정 파일:**
- apps/web/src/__tests__/setup.ts (테스트 셋업)
- apps/web/playwright.config.ts (E2E)
- Phase 5 QA 리포트: PHASE5_TEST_SUMMARY.md, README_PHASE5.md

### CI 워크플로우 (이미 존재)
- `.github/workflows/ci.yml` — 린트 + 타입체크 + 테스트 + 빌드
- `.github/workflows/patent-regression.yml` — 특허 관련 회귀 테스트
- `.github/workflows/mobile-ci.yml` — 모바일 앱 CI
- `.github/workflows/deploy.yml` — 배포

### 실행 방법
```bash
pnpm test          # vitest (단위 + 통합)
pnpm test:watch    # 감시 모드
npx playwright test # E2E
```

---

## 4. 세션 프로토콜 변경 사항

### 기존 (순차)
```
Phase 4: 모든 코드 파일 생성 → Phase 5: 전체 QA
```

### 변경 (TDD 병합)
```
세션 시작:
  1. claude.md 로드 (자동)
  2. todo.md 읽기 → 다음 미완료 파일 확인
  3. 해당 파일의 참조 문서 로드

파일 작업:
  4. 플랜 모드: "이 파일의 구현 계획을 세워줘"
  5. 리뷰: 계획 확인 + 피드백
  6. 테스트 먼저: "테스트를 먼저 작성해줘"
  7. 실패 확인: npm test → 빨간불
  8. 구현: "테스트를 통과하는 코드를 작성해줘"
  9. 통과 확인: npm test → 초록불
  10. 커밋: git commit -m "feat(F-XXX): ..."

세션 종료:
  11. todo.md 업데이트
  12. memory.md에 패턴/이슈 기록
  13. git push
```

---

## 5. 커밋 컨벤션

```
feat(F-007): 이메일 로그인 페이지 구현
test(F-007): 로그인 폼 유효성 테스트
fix(F-007): 카카오 OAuth 리다이렉트 수정
chore: Vitest + Testing Library 설정
refactor(F-001): voice-to-report 에러 핸들링 개선
```

---

## 6. 테스트 커버리지 목표

| 레이어 | 목표 | 비고 |
|--------|------|------|
| DB (RLS + 트리거) | 100% | 보안 관련 — 빈틈 불허 |
| Edge Functions | 90%+ | 외부 API는 모킹 |
| API Routes | 85%+ | 인증/인가 경로 포함 |
| 컴포넌트 | 80%+ | 핵심 인터랙션 중심 |
| E2E | 주요 플로우 | Feature당 Happy Path + 주요 에러 |

---

## 7. 기존 지침서와의 매핑

| 기존 Phase | TDD 병합 후 |
|-----------|------------|
| Phase 4: 파일 단위 코드 생성 | 파일마다 플랜→테스트→코드→커밋 |
| Phase 5: 테스트 피라미드 | 각 파일의 테스트가 곧 피라미드 |
| Phase 5: OWASP 보안 | RLS 테스트에 포함 |
| Phase 5: 성능 테스트 | Sprint 8 마지막에 별도 실행 |
| Phase 6: CI/CD | Sprint 1 세션 8에서 기본 설정 |
