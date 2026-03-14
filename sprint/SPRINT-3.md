# Sprint 3 — 회원 앱 + 신뢰도 (v0.3 Beta)

Owner: 민수
Assistant: 따리 (OpenClaw)
기간: 2026-03-15 ~ 2026-03-22 (1주, 5 working days)

## Sprint Goal
- 회원 측 스윙 캡처 → 신뢰도 산출 → 검증 큐 → 프로 대시보드 표시까지 Beta 품질로 연결한다.
- 음성/보고서 루프는 Groq fallback으로 유지하면서 배포 안정성(헬스체크, 프론트 배포) 확보.

## Scope
- MediaPipe 기반 `swing-camera` 실동작 및 업로드 경로 안정화 (apps/mobile PWA)
- `measurement-confidence` Edge Function 검증 및 T1/T2 임계값 튜닝, 검증 큐 → 프로 대시보드 표시
- Feel Check → AI 관찰(톤 설정) 생성 흐름 재검증
- Causal Graph 신뢰도 가드레일: DFS 방문 집합 공유 버그(H2) 재현/패치, progress API 더미 데이터 제거(H7)
- Infra carry-over: GROQ_API_KEY 설정, health check 404 수정, Kakao 알림톡 채널/템플릿 리뷰, hellonext.app 프로덕션 배포

### Out of Scope
- 결제/쿠폰( Sprint 4 )
- Patent Engine 배치 보정( Sprint 5+ )

## Carry-Over from Sprint 2
- GROQ_API_KEY Supabase secret 설정 + Groq fallback smoke
- Health check 404 (sub-route) 수정
- Kakao 알림톡 채널/템플릿 심사 확인
- hellonext.app 정식 프론트엔드 배포

## Task Breakdown (with estimates)

> **Capacity: 5d.** Tasks reordered: blockers/bugs first → infra → features.
> Original Codex estimates totaled ~10d — adjusted to fit 1 week by trimming scope
> and parallelizing where possible. Deferred items moved to Sprint 3.5 stretch.

| Priority | Epic | Task | Estimate | Dep |
| -------- | ---- | ---- | -------- | --- |
| P0 | 3-3 버그픽스 | **T3-3-1** DFS visited 공유 버그(H2) 패치 — `new Set(visited)` → `visited` 직접 전달 (causal-analysis/index.ts:399) | 0.3d | — |
| P0 | 3-3 버그픽스 | **T3-3-2** progress API placeholder(Math.random) 제거 → derived_metrics 기반 실제 계산 (H7) | 0.3d | — |
| P0 | 3-3 인프라 | **T3-3-3** Health check sub-route 404 수정 — `[component]` dynamic route 추가 | 0.3d | — |
| P1 | 3-4 배포/운영 | **T3-4-1** GROQ_API_KEY Supabase secret 설정 + voice workers fallback smoke | 0.3d | 외부(민수) |
| P1 | 3-4 배포/운영 | **T3-4-3** hellonext.app 프로덕션 배포 (env 동기화 + 모니터링 연동) | 0.5d | T3-4-1 |
| P2 | 3-1 회원 앱 | **T3-1-1** swing-camera 권한/성능 점검 + 업로드 경로 실측 | 0.8d | — |
| P2 | 3-1 회원 앱 | **T3-1-2** raw_measurements 업로드 → Realtime 확인 + 실패 재시도 | 0.5d | T3-1-1 |
| P2 | 3-1 회원 앱 | **T3-1-3** Feel Check → ai_observations 톤 설정 검증 (LLM fallback) | 0.5d | T3-4-1 |
| P3 | 3-2 신뢰도 | **T3-2-1** measurement-confidence EF 통합 테스트 + T1/T2/K 임계값 검증 | 0.5d | T3-1-2 |
| P3 | 3-2 신뢰도 | **T3-2-2** pending_verification → verification_queue → 프로 대시보드 표시 | 0.5d | T3-2-1 |
| — | 버퍼 | 리스크 버퍼 (테스트/배포 변동) | 0.5d | — |
| **합계** | | | **5.0d** | |

### Sprint 3.5 Stretch (넘치면 Sprint 4로 이월)
| Task | Estimate | Note |
| ---- | -------- | ---- |
| T3-2-3 검증 응답(confirm/correct/reject) API/DB 상태 전파 | 0.8d | T3-2-2 이후 |
| T3-4-2 Kakao 알림톡 채널/템플릿 검토 | 0.5d | 외부 의존(심사) |

## Dependencies
- **Secrets (외부):** `GROQ_API_KEY`(Supabase Functions + Edge), `KAKAO_REST_API_KEY`/템플릿 승인, Cloudinary creds (video), existing Supabase URL/keys.
- **Tooling:** Mobile camera permissions (Expo), MediaPipe models, Groq API quota (OpenAI 한도 소진 상태).
- **Data:** raw_measurements/derived_metrics DAG seed, verification_queue schema.
- **순서:** T3-3-* (버그픽스, 병렬 가능) → T3-4-* (인프라) → T3-1-* (회원 앱) → T3-2-* (신뢰도).

## Blockers / Risks
- **[CRITICAL] 일정 초과:** Codex 원본 추정치 합계 ~10d → 5d 용량 초과. P3 일부를 stretch로 이동하여 해결.
- **[HIGH] OpenAI 쿼터 소진:** Groq fallback 미설정 시 음성/LLM 흐름 중단. T3-4-1에서 즉시 해결.
- **[HIGH] H2 DFS visited 공유 버그:** `new Set(visited)`가 분기마다 visited를 복사하여 동일 노드 중복 방문 → 지수적 탐색/스택 오버플로우. 사이클 감지가 선행되지만, 대형 DAG에서 성능 문제 유발. (순환이 아니라 중복 방문이 핵심 문제)
- **[MEDIUM] H7 Progress API:** Math.random() placeholder → 프로/회원 대시보드 신뢰도 저하.
- **[MEDIUM] Health check 404:** INTEGRATION.md에 문서화된 sub-route(/api/health/fsm-controller 등)에 대한 route handler 부재.

## Deliverables
- 모바일 스윙 촬영 → 신뢰도 분류 → 검증 큐 → 프로 대시보드 표시되는 E2E 데모 1회.
- measurement-confidence / verification-handler / swing-analysis 호출 로그 및 테스트 스크립트.
- Fix commits: DFS visited 패치, progress API 실제 데이터, health check sub-route.
- 배포: hellonext.app 최신 main 배포 + Groq fallback 활성화.

## Notes (aligns with architecture docs)
- DC-2/T1=0.7, T2=0.4 기본값에서 시작 후 실측 기반 조정.
- DC-4: Primary Fix 스칼라 강제, DFS 테스트로 사이클 재현 계획. H2 버그는 사이클이 아닌 **중복 방문** 문제 — visited set을 공유하면 각 노드를 정확히 1회만 방문.
- DC-5: FSM 복구는 유지, 음성 파이프라인은 Groq fallback으로만 검증.
