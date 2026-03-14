# Sprint 3 — 회원 앱 + 신뢰도 (v0.3 Beta)

Owner: 민수  
Assistant: 따리 (OpenClaw)  
기간: 2026-03-15 ~ 2026-03-22 (1주)

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
| Epic | Task | Estimate |
| ---- | ---- | -------- |
| 3-1 회원 앱 | T3-1-1 swing-camera 권한/성능 점검 + 업로드 경로 실측 (apps/mobile/components/swing) | 1.5d |
| | T3-1-2 raw_measurements 업로드 → Realtime 확인 + 실패 재시도 버퍼링 | 1.0d |
| | T3-1-3 Feel Check 입력 → ai_observations 톤 설정 검증 (LLM fallback 포함) | 1.0d |
| 3-2 신뢰도/검증 | T3-2-1 measurement-confidence EF 통합 테스트 + 임계값 검증(T1/T2/K) | 1.0d |
| | T3-2-2 pending_verification → verification_queue → 프로 대시보드 표시/필터 | 1.0d |
| | T3-2-3 검증 응답(confirm/correct/reject) API/DB 상태 전파 검증 | 0.8d |
| 3-3 신뢰도 가드레일 | T3-3-1 DFS visited 공유 버그(H2) 재현 테스트 작성 → 패치 | 0.5d |
| | T3-3-2 progress API placeholder(Math.random) 제거 → 실제 메트릭 연결 (H7) | 0.5d |
| | T3-3-3 Health check sub-route 404 수정 + smoke | 0.5d |
| 3-4 배포/운영 | T3-4-1 GROQ_API_KEY Supabase secret 설정 + voice workers fallback 호출 검증 | 0.3d |
| | T3-4-2 Kakao 알림톡 채널/템플릿 검토 → 승인/대응 플랜 | 0.5d |
| | T3-4-3 hellonext.app 프로덕션 배포 (env 동기화 + 모니터링 연동) | 1.0d |
| 버퍼 | 리스크 버퍼 (테스트/배포 변동) | 0.4d |

## Dependencies
- Secrets: `GROQ_API_KEY`(Supabase Functions + Edge), `KAKAO_REST_API_KEY`/템플릿 승인, Cloudinary creds (video), existing Supabase URL/keys.
- Tooling: Mobile camera permissions (Expo), MediaPipe models, Groq API quota (OpenAI 한도 소진 상태).
- Data: raw_measurements/derived_metrics DAG seed, verification_queue schema, progress metrics source.

## Blockers / Risks
- OpenAI 쿼터 소진 → Groq fallback 미설정 시 음성/LLM 흐름 중단 가능.
- DAG 사이클 시 traverse visited 불공유(H2)로 무한 재귀 위험.
- Progress API가 랜덤 데이터를 반환(H7) → 프로/회원 대시보드 신뢰도 저하.
- Health check 404로 liveness probe 실패 가능성.

## Deliverables
- 모바일 스윙 촬영 → 신뢰도 분류 → 검증 큐 → 프로 대시보드 표시되는 E2E 데모 1회.
- measurement-confidence / verification-handler / swing-analysis 호출 로그 및 테스트 스크립트.
- Fix PRs: health check, progress API 실제 데이터, DFS visited 패치.
- 배포: hellonext.app 최신 main 배포 + Groq fallback 활성화.

## Notes (aligns with architecture docs)
- DC-2/T1=0.7, T2=0.4 기본값에서 시작 후 실측 기반 조정.
- DC-4: Primary Fix 스칼라 강제, DFS 테스트로 사이클 재현 계획.
- DC-5: FSM 복구는 유지, 음성 파이프라인은 Groq fallback으로만 검증.
