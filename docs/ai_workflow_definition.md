# HelloNext AI 파이프라인 워크플로우 정의 (WAT 프레임워크)

> **목적:** Sprint 2 최대 위험 구간 사전 대비. 코드 작성 전 글로 워크플로우를 완전히 정의합니다.
> **WAT:** W(Workflows) → A(Agents) → T(Tools) — 워크플로우를 글로 먼저 정의하고, 에이전트 힐링 메커니즘을 설계하고, 도구 스크립트를 분리합니다.

---

## Workflow 1: 음성→리포트 파이프라인 (F-001 + F-017)

### 전체 흐름 (11단계)

```
STEP  1: 프로가 음성 녹음 완료 → WebM/M4A 파일 전송
STEP  2: Supabase Storage에 원본 저장 → audio_blob_ref 획득
STEP  3: voice_memos 테이블에 레코드 생성 (status: recording)
STEP  4: voice_memo_cache 생성 (state: UNBOUND, target_id: NULL)
         → DC-5: target_id NULL 불변조건 강제
STEP  5: Whisper API 호출 (비동기, job_id=UUID 할당)
         → voice_memo_cache state: UNBOUND → PREPROCESSED
         → transcript 필드 저장 (캐시 — 재전사 불필요)
STEP  6: target_id 결합 대기
         - 일반: 프로가 녹음 시 이미 회원 선택 → 즉시 결합
         - 고아: PREPROCESSED 상태 대기 → 프로가 Bottom Sheet에서 매핑
         → voice_memo_cache state: PREPROCESSED → LINKED
         → DC-5: target_id 필수 (NOT NULL 강제)
STEP  7: 용어사전 조회 (glossary_terms WHERE pro_id)
         → 전사 텍스트 내 골프 용어 치환/보정
STEP  8: LLM 구조화 호출 (GPT-4o / Claude — feature flag)
         → 전사 텍스트 + 용어 치환 결과 → 구조화 JSON
         → 출력: { observations[], errorTags[], recommendations[], tone }
STEP  9: 에러 태그 매핑 (error_patterns 테이블 22개 조회)
         → auto_detected_symptoms 확정
STEP 10: 리포트 생성 (LLM)
         → lesson_reports 테이블 저장
         → voice_memos status → completed
         → voice_memo_cache state: LINKED → FINALIZED
STEP 11: 알림 발송
         - 카카오 알림톡 (회원에게)
         - FCM Push (모바일)
         - Supabase Realtime (프로 대시보드에 실시간 반영)
```

### 에러 핸들링

| 단계 | 실패 시나리오 | 처리 |
|------|------------|------|
| STEP 5 | Whisper API 타임아웃/500 | 3회 재시도 (지수 백오프: 2s→4s→8s), 실패 시 voice_memos status→failed, 프로에게 알림 |
| STEP 5 | Whisper 음질 불량 결과 | confidence_score 반환 시 임계값 미달이면 프로에게 재녹음 권유 알림 |
| STEP 6 | 고아 메모 미매핑 (24h+) | 크론잡: orphan_alert → 프로 대시보드 뱃지 표시 |
| STEP 7 | 용어사전 빈 결과 | 정상 진행 (치환 없이 원문 사용) |
| STEP 8 | LLM API 타임아웃/500 | 3회 재시도, 실패 시 전사 텍스트만 보존 → 프로가 수동 편집 가능 |
| STEP 8 | LLM 구조화 JSON 파싱 실패 | Zod 스키마 검증 실패 → 재시도 1회 (프롬프트에 "valid JSON" 강조), 여전히 실패 시 raw text 보존 |
| STEP 9 | 에러 태그 미매칭 | 빈 배열 허용, "분류 미정" 태그 부여 |
| STEP 10 | 리포트 생성 LLM 실패 | STEP 8의 구조화 JSON 보존, 프로가 직접 리포트 작성 UI 제공 |
| STEP 11 | 카카오 알림톡 실패 | 재시도 큐 (3회, 5분 간격), 실패 시 FCM fallback |
| STEP 11 | FCM 실패 | Sentry 기록, 다음 앱 진입 시 인앱 알림으로 보완 |
| 전체 | FSM 중단 (서버 재시작) | FSM 복구 컨트롤러: voice_memo_cache 스캔 → state + job_id 기반 재개 지점 결정 (DC-5 RTT 30초 목표) |

### Edge Function 분리 설계

```
supabase/functions/
├── voice-to-report/index.ts          # 메인 오케스트레이터
│   ├── steps/01-upload-audio.ts      # STEP 2: Storage 업로드
│   ├── steps/02-init-cache.ts        # STEP 4: voice_memo_cache 생성
│   ├── steps/03-transcribe.ts        # STEP 5: Whisper 호출
│   ├── steps/04-link-target.ts       # STEP 6: target_id 결합
│   ├── steps/05-glossary-match.ts    # STEP 7: 용어사전 매칭
│   ├── steps/06-structure-llm.ts     # STEP 8: LLM 구조화
│   ├── steps/07-error-tag-map.ts     # STEP 9: 에러 태그 매핑
│   ├── steps/08-generate-report.ts   # STEP 10: 리포트 생성
│   └── steps/09-notify.ts           # STEP 11: 알림 발송
│
├── voice-fsm-controller/index.ts     # FSM 전이 제어 + 복구
│   ├── transitions.ts                # 전이 규칙 정의
│   └── recovery.ts                   # 중단 복구 로직
```

### 입출력 스키마 (Zod)

```typescript
// STEP 8 LLM 구조화 출력 스키마
const StructuredReportSchema = z.object({
  observations: z.array(z.object({
    category: z.enum(['posture', 'grip', 'swing_path', 'tempo', 'balance', 'other']),
    description: z.string().min(10),
    severity: z.enum(['critical', 'major', 'minor', 'positive']),
  })).min(1),
  errorTags: z.array(z.string()).default([]),  // 에러 패턴 코드
  recommendations: z.array(z.object({
    priority: z.number().int().min(1).max(5),
    description: z.string(),
    drillRef: z.string().optional(),  // 추천 드릴 ID
  })).default([]),
  tone: z.enum(['encouraging', 'neutral', 'direct']).default('encouraging'),
  summary: z.string().max(200),
});
```

---

## Workflow 2: 스윙 분석 + 신뢰도 파이프라인 (F-005 + F-016)

### 전체 흐름 (8단계)

```
STEP 1: 회원이 스윙 촬영 → MediaPipe BlazePose (클라이언트 2D 포즈 추정)
        → keypoints + joint angles + visibility scores
STEP 2: 포즈 데이터 서버 전송 → raw_measurements INSERT (Layer A — 불변)
        → DC-1: Layer A 분리, DC-3: UPDATE 차단 트리거 적용
STEP 3: Measurement Confidence Engine 호출
        → measurement_confidence = keypoint_vis × cam_angle × motion_blur × occlusion × K
        → DC-2: 5-factor 복합 신뢰도 산출
STEP 4: 3단계 상태 분류 (F-016)
        → confidence >= T1(0.7): confirmed → 회원에게 즉시 표시
        → T2(0.4) <= confidence < T1: pending_verification → 검증 큐 발행
        → confidence < T2: hidden → 회원 미표시, 프로 참조만
STEP 5: [pending_verification만] verification_queue INSERT
        → 토큰 발급 → 프로 대시보드 알림
STEP 6: Feel Check 입력 수신 (회원이 "됐다/모르겠다/안됐다" 응답)
        → feel_checks 테이블 저장
STEP 7: AI 관찰 생성 (LLM)
        → 포즈 데이터 + Feel Check + 톤 설정 → ai_observations INSERT
        → coach_consultation_flag 설정 (AI가 확신 낮을 때)
STEP 8: 프로 검증 응답 처리 (F-016 AC-5)
        → confirm: measurement_states → confirmed, 회원 표시 전환
        → correct: 보정값 재산정, 상태 재분류
        → reject: measurement_states → hidden
```

### 에러 핸들링

| 단계 | 실패 시나리오 | 처리 |
|------|------------|------|
| STEP 1 | MediaPipe 초기화 실패 | 클라이언트에서 재시도 UI, 브라우저 호환성 안내 |
| STEP 1 | 카메라 권한 거부 | 권한 요청 재표시 + 가이드 |
| STEP 2 | raw_measurements INSERT 실패 | 클라이언트 로컬 버퍼에 보관 → 재시도 |
| STEP 3 | Confidence 산출 NaN/범위 초과 | 기본값 0.5(pending_verification)으로 fallback |
| STEP 7 | LLM 관찰 생성 실패 | 포즈 데이터 기반 규칙 기반 관찰 fallback (패턴 매칭) |

---

## Workflow 3: 인과그래프 역추적 + 수정 델타 보정 (F-015)

### 전체 흐름 (7단계)

```
STEP 1: Layer A(raw_measurements) → Layer B(derived_metrics) 변환
        → 증상 노드 자동 탐지 (auto_detected_symptoms)
        → 증상 간 종속성 간선 생성 (dependency_edges)
STEP 2: causal_graph_edges DAG 로드 (22개 에러 패턴 + 간선)
STEP 3: 역방향 탐색 (증상 노드 → 원인 노드)
        → 각 후보 원인의 IIS(Integrated Importance Score) 산출
STEP 4: Primary Fix 결정
        → 최대 IIS 노드 1개 = Primary Fix (DC-4: 단일 스칼라 강제)
        → coaching_decisions INSERT (auto_draft, primary_fix, tier=tier_1)
STEP 5: 프로 대시보드에 자동 진단 표시
        → 프로가 수정 시:
        → diff 계산 (before: auto_draft / after: coach_edited)
        → coaching_decisions UPDATE (tier→tier_2 또는 tier_3)
        → edit_deltas INSERT (edited_fields, original, edited, delta, tier)
STEP 6: 간선 가중치 부분 보정 (배치, 1시간 주기)
        → edit_deltas 10건 이상 누적 시 트리거
        → tier별 보정 계수: tier_1=0(보정 불필요), tier_2=1.0(표준), tier_3=0.5(보수적)
        → causal_graph_edges.weight UPDATE
STEP 7: 보정 후 DAG로 다음 세션 역추적 정확도 향상 (피드백 루프)
```

### 에러 핸들링

| 단계 | 실패 시나리오 | 처리 |
|------|------------|------|
| STEP 1 | 증상 탐지 0건 | "분석 데이터 부족" 메시지 → 프로에게 수동 진단 요청 |
| STEP 3 | DAG 사이클 탐지 | 사이클 간선 로그 → Sentry 알림 → 수동 검토 |
| STEP 4 | IIS 동점 (다수 후보) | 첫 번째 탐지 노드 선택 + 프로에게 "복수 후보" 알림 |
| STEP 6 | 보정 계수 음수/범위 초과 | weight 클램핑 [0.0, 1.0] + 이상치 Sentry 로그 |

---

## Agents — 힐링 메커니즘

### Edge Function 장애 복구

```
Edge Function 실패 시:
1. 에러 로그 → Sentry (자동)
2. 재시도 정책:
   - 외부 API (Whisper, LLM): 3회, 지수 백오프
   - DB 쓰기: 2회, 500ms 간격
   - 알림 발송: 3회, 5분 간격
3. 최종 실패:
   - voice_memos.status → 'failed'
   - 프로에게 실패 알림 (인앱 + 푸시)
   - retry_count 기록 → 모니터링 대시보드
```

### FSM 복구 컨트롤러 (DC-5)

```
서버 재시작/크래시 후:
1. voice_memo_cache 스캔 (state != 'FINALIZED')
2. 각 레코드의 state + job_id 기반 판단:
   - UNBOUND + job_id 없음: STEP 5부터 재시작 (Whisper 호출)
   - PREPROCESSED + transcript 있음: STEP 6 대기 (target_id 매핑)
   - LINKED + 리포트 없음: STEP 8부터 재시작 (LLM 구조화)
3. 복구 RTT 목표: 30초 이내
4. 복구 로그 → voice_memo_state_log에 기록
```

### CI/CD 장애 처리

```
GitHub Actions 실패 시:
1. 에러 원인 분석 스텝 추가 (tsc --noEmit 출력 파싱)
2. 테스트 실패: 실패 테스트명 + 스택 트레이스 요약
3. 빌드 실패: 의존성 충돌 자동 감지
4. 배포 실패: Vercel 로그 확인 → 환경변수 누락 검사
```

---

## Tools — 스크립트 분리

| 스크립트 | 용도 | 실행 시점 | 토큰 절약 효과 |
|---------|------|----------|--------------|
| `scripts/seed-error-patterns.ts` | 22개 에러 패턴 시드 데이터 생성 | Sprint 1 세션 2 | 대화창에서 대량 JSON 생성 방지 |
| `scripts/seed-glossary.ts` | 골프 용어 사전 기본 시드 | Sprint 2 세션 1 | 용어 목록 외부 파일 관리 |
| `scripts/seed-causal-graph.ts` | 초기 DAG 간선 6개 체인 시드 | Sprint 5 | 복잡한 간선 정의 분리 |
| `scripts/test-whisper.ts` | Whisper API 연결 + 골프 용어 인식 테스트 | Sprint 2 세션 1 | 외부 API 독립 검증 |
| `scripts/test-toss.ts` | 토스페이먼츠 연결 + 결제 시나리오 테스트 | Sprint 4 | 결제 API 독립 검증 |
| `scripts/migrate-check.ts` | 마이그레이션 상태 + RLS 적용 확인 | 매 세션 시작 | DB 상태 빠른 점검 |
| `scripts/generate-types.ts` | Supabase DB 타입 자동 생성 | 마이그레이션 후 | `npx supabase gen types` 래퍼 |

---

## LLM 프롬프트 설계 가이드

### voice-to-report 구조화 프롬프트 (STEP 8)

```
역할: 당신은 골프 레슨 리포트 구조화 전문가입니다.
입력: 프로의 음성 전사 텍스트
출력: 반드시 아래 JSON 스키마에 맞는 유효한 JSON

규칙:
1. observations는 최소 1개 이상
2. severity 판단 기준: 스윙 안정성/반복성에 미치는 영향도
3. errorTags는 22개 표준 에러 패턴 코드 중에서만 선택
4. recommendations의 priority는 1(최우선)~5(참고)
5. tone은 프로의 ai_scope_settings.ai_tone에 따름
6. summary는 200자 이내, 회원이 바로 이해할 수 있는 언어
```

### AI 관찰 생성 프롬프트 (STEP 7 of Workflow 2)

```
역할: 당신은 골프 스윙 AI 분석 보조입니다.
입력: {포즈 데이터 요약, Feel Check 응답, 이전 세션 관찰, 톤 설정}
출력: 자연어 관찰 텍스트 (1~3문장)

규칙:
1. Feel Check 응답과 포즈 데이터가 일치하면 긍정 피드백
2. 불일치하면 "이런 부분이 감지되었어요" 형식의 중립 피드백
3. 프로의 톤 설정(encouraging/neutral/direct)에 맞춤
4. coach_consultation_flag: AI 확신도 < 0.6이면 true
5. 전문 용어 대신 회원 친화적 언어 사용
```
