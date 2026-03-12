# HelloNext v2.0 통합 검증 리포트

**일시:** 2026-03-11
**범위:** Phase 2~6 전체 산출물 (93+ 파일)
**검증 방법:** 정적 분석 (import/export 정합성, SQL 참조 무결성, 타입 일관성)

---

## 1. 검증 영역 및 결과 요약

| 검증 영역 | 결과 | 발견 이슈 | 수정 상태 |
|-----------|------|----------|----------|
| tsconfig path alias | PASS | 0 | — |
| pnpm workspace 의존성 | PASS | 0 | — |
| shared/index.ts export | **FAIL→FIXED** | 12개 v2.0 모듈 export 누락 | ✅ 수정 완료 |
| SQL Migration 순서/FK | **FAIL→FIXED** | FK ON DELETE 누락 2건, 인덱스 1건 | ✅ 018 hotfix |
| RLS 정책 커버리지 | **FAIL→FIXED** | derived_metrics 정책 0건, INSERT 정책 누락 다수 | ✅ 017 재작성 |
| Edge Function (Deno) | PASS | 0 (esm.sh 패턴 정상) | — |
| 프론트엔드 타입 정합성 | **FAIL→FIXED** | 로컬 타입 재정의 5건, 값 불일치 1건 | ✅ 수정 완료 |

---

## 2. CRITICAL 이슈 (수정 완료)

### 2.1 shared/index.ts — v2.0 export 누락

**문제:** 12개 v2.0 파일(constants 3, types 7, validators 2)이 shared 패키지에 존재하지만 index.ts에서 export되지 않음

**영향:** 웹앱에서 `@hellonext/shared`로 import 불가 → 모든 consumer가 로컬 타입 재정의

**수정:** 12개 export 추가 (총 19개 → v1.1: 7개, v2.0: 12개)

### 2.2 017 RLS — derived_metrics 정책 완전 누락

**문제:** `ALTER TABLE derived_metrics ENABLE ROW LEVEL SECURITY` 후 정책 0건 → 테이블 완전 접근 불가

**영향:** causal-analysis Edge Function이 derived_metrics INSERT 불가 → F-015 인과그래프 기능 불능

**수정:** member/pro SELECT + service INSERT/UPDATE 4개 정책 추가

### 2.3 ConfidenceState 값 불일치

**문제:** shared에서 `'pending_verification'` 사용, 프론트엔드에서 `'pending'` 사용

**영향:** DB에 `pending_verification`으로 저장되지만 프론트엔드 switch문에서 매칭 실패 → UI 미표시

**수정:** state-classifier.ts의 모든 `'pending'` → `'pending_verification'`으로 통일, shared import 전환

---

## 3. HIGH 이슈 (수정 완료)

### 3.1 FK ON DELETE 누락

| 테이블 | 컬럼 | 문제 | 수정 |
|--------|------|------|------|
| verification_queue | reviewer_id | ON DELETE 없음 → 프로 삭제 시 고아 레코드 | ON DELETE SET NULL |
| voice_memo_cache | target_id | ON DELETE 없음 → 회원 삭제 시 고아 레코드 | ON DELETE SET NULL |

### 3.2 누락 INSERT 정책 (017 재작성)

| 테이블 | 누락 정책 | 영향 |
|--------|----------|------|
| causal_graph_edges | INSERT, UPDATE | 시드 데이터 삽입 불가, 간선 보정 불가 |
| voice_memo_state_log | INSERT | FSM 전이 로그 트리거 실패 |
| measurement_states | INSERT, UPDATE | 신뢰도 엔진 상태 기록 불가 |
| verification_queue | INSERT | 검증 토큰 발급 불가 |
| edit_deltas | INSERT | 수정 델타 기록 불가 |

### 3.3 누락 인덱스

| 테이블 | 인덱스 | 용도 |
|--------|--------|------|
| verification_queue | idx_verif_measurement_state | RLS JOIN 성능 |
| measurement_states | updated_at 트리거 | 상태 전이 시각 자동 기록 |

---

## 4. MEDIUM 이슈 (수정 완료)

### 4.1 프론트엔드 로컬 타입 재정의 → shared import 전환

| 파일 | 변경 내용 |
|------|----------|
| fsm-client.ts | `FsmState` → shared import + ERROR 확장 |
| state-classifier.ts | `ConfidenceState`, `classifyConfidence()` → shared import |
| data-layer-separator.ts | 로컬 타입 `Client*` 접두어로 이름 변경 + DB 타입 re-export |
| use-verification-queue.ts | shared DB 타입 import + 로컬/DB 타입 명확 구분 |
| patent-store.ts | ConfidenceState → `@hellonext/shared` 직접 import |

---

## 5. PASS 항목 (이슈 없음)

### 5.1 Edge Function Deno 호환성
- 5개 함수 모두 `esm.sh` 패턴으로 npm 패키지 import ✅
- `npm:` prefix 미사용 ✅
- 로컬 타입 정의 (Deno runtime에서 불가피) ✅

### 5.2 SQL Migration 실행 순서
- 001~018 순차 실행 의존성 정합 ✅
- FK 참조 순서 정확 (009 → 010 → ... → 017 → 018) ✅
- 순환 FK 없음 ✅

### 5.3 tsconfig path alias
- `@/*` → `./src/*` 정상 매핑 ✅
- `@hellonext/shared/*` → `../../packages/shared/*` 정상 매핑 ✅
- pnpm workspace `@hellonext/shared: workspace:*` 정상 ✅

---

## 6. 수정 파일 목록 (8개)

```
packages/shared/index.ts                              # v2.0 export 12개 추가
supabase/migrations/017_patent_rls_policies.sql        # RLS 24개 정책 (기존 13 → 24)
supabase/migrations/018_patent_hotfix.sql              # FK/인덱스/트리거 핫픽스 (신규)
apps/web/src/lib/patent/fsm-client.ts                  # shared FsmState import
apps/web/src/lib/patent/state-classifier.ts            # shared ConfidenceState import
apps/web/src/lib/patent/data-layer-separator.ts        # Client* 타입 분리
apps/web/src/hooks/use-verification-queue.ts           # shared DB 타입 import
apps/web/src/stores/patent-store.ts                    # ConfidenceState shared import
```

---

## 7. 잔여 주의사항 (수정 불필요)

| 항목 | 설명 | 우선순위 |
|------|------|---------|
| Edge Function 로컬 타입 | Deno runtime 제약으로 shared import 불가. 현재 로컬 정의 유지 적합. | LOW |
| 017 RLS 테이블 비한정 참조 | `swing_videos` 등 `public.` 접두어 없음. Supabase 기본 search_path에서 동작. | LOW |
| 016 트리거 3개 실행 순서 | PostgreSQL 알파벳순 실행. 현재 순서 안전하나 단일 함수 통합 고려 가능. | LOW |
| causal_graph_edges 시드 | 018 이후 시드 migration(019) 생성 권장. 현재 INSERT 정책은 추가됨. | MEDIUM |
