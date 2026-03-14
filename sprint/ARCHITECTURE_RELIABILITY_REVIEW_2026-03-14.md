# HelloNext 아키텍처 신뢰성/장애 격리 점검 — 2026-03-14

## 목적
현재 HelloNext 아키텍처를 기능 중심이 아니라 **장애 격리(blast radius reduction)** 와 **운영 통제권 확보** 관점에서 재점검한다.

기준 문서:
- `HelloNext_Phase3_v2.0_아키텍처.md`
- `sprint/VOICE_PIPELINE_MAINTENANCE_2026-03-14.md`
- `supabase/functions/voice-transcribe/README.md`

---

## 1. 현재 위험 구조

### 1.1 Supabase 역할 과집중
현재 Supabase가 동시에 담당하는 역할:
- Auth
- PostgreSQL
- Storage
- Realtime
- Edge Functions
- 일부 운영 검증 경로

이 구조는 빠른 MVP에는 유리하지만, 운영 관점에서는 **하나의 플랫폼 장애가 여러 기능 축으로 전염**되기 쉽다.

### 1.2 voice pipeline의 직렬 의존
현재 voice pipeline은 대략 다음 순서로 강하게 연결된다.
1. 사용자 인증
2. `voice_memos` 생성
3. `voice_memo_cache` 초기화
4. Whisper 전사
5. cache 상태 전이
6. 리포트 생성
7. 알림 / Realtime 반영

이 구조는 중간 어느 하나만 실패해도 전체 흐름이 멈추기 쉽다.

### 1.3 핵심 비즈니스 로직의 Edge Functions 집중
현재 핵심 엔진 다수가 Supabase Edge Functions에 실려 있다.
- `voice-fsm-controller`
- `measurement-confidence`
- `causal-analysis`
- `verification-handler`
- `edge-weight-calibration`

운영 관점에서 이는 runtime/정책/디버깅 한계에 핵심 로직이 직접 노출된 상태다.

### 1.4 외부 서비스 의존의 동기적 결합
핵심 플로우가 다음 외부 의존에 연결된다.
- Whisper
- GPT/Claude
- Cloudinary
- Kakao/Push/Email

현재 구조에서는 외부 서비스 실패가 부분 실패로 흘러가기보다 핵심 사용자 플로우 전체를 흔들 가능성이 높다.

---

## 2. 반드시 분리할 축

### 2.1 voice pipeline
가장 먼저 분리할 대상.

권장 분해:
- `voice ingest API`
- `transcription worker`
- `fsm transition worker`
- `report generation worker`

원칙:
- 요청 수신은 빠르게 ACK
- 무거운 작업은 queue 기반 비동기 처리
- retry / idempotency / dead-letter 가능 구조

### 2.2 이메일 발송 및 인증 보조 흐름
즉시 분리 권장.

이유:
- 인증/테스트/운영 알림이 이메일 deliverability 정책에 같이 묶이면 blast radius가 큼
- 확인 메일/거래 메일/테스트 발송은 별도 provider 또는 custom SMTP로 분리하는 편이 안정적

### 2.3 장기적 AI 오케스트레이션 및 배치
다음 축은 Edge보다 worker/batch가 더 적합하다.
- `causal-analysis`
- `edge-weight-calibration`
- verification 후 재분류/후처리
- 대량 재계산/리빌드

---

## 3. 유지 가능한 축

### 3.1 Supabase PostgreSQL + RLS
계속 유지 가치가 큼.

이유:
- 권한 분리 모델이 도메인에 잘 맞음
- 특허 스키마(3계층, FSM, verification queue)와 관계형 모델 적합
- RLS + trigger + migration 조합이 이미 설계와 잘 맞물림

### 3.2 Supabase Storage
음성 원본/문서 저장 계층으로는 유지 가능.
중요한 건 저장소 자체보다, 저장소를 누가 어떤 방식으로 호출하느냐다.

### 3.3 Supabase Realtime
결과 전달 / 대시보드 반영 용도로는 여전히 유용.
다만 핵심 비즈니스 처리 엔진이 되면 안 되고, 결과 표시 계층으로 한정하는 것이 바람직하다.

---

## 4. 권장 서비스 경계

### 4.1 App/API Layer
책임:
- 인증된 요청 수신
- 최소 검증
- job enqueue
- 사용자 즉시 응답

### 4.2 Worker Layer
책임:
- transcription worker
- report generation worker
- causal-analysis worker
- verification post-process worker
- retry / timeout / dead-letter / replay

### 4.3 Data Layer
책임:
- Supabase Postgres + RLS
- Storage
- 상태 기록 및 감사 로그

### 4.4 Notification Layer
책임:
- email
- kakao
- push

핵심 처리와 분리해 장애 전파를 막는다.

### 4.5 Realtime Layer
책임:
- UI 상태 반영
- queue 상태 변화 push
- 처리 완료/실패 표시

핵심 처리보다 결과 반영에 집중시킨다.

---

## 5. 30 / 60 / 90일 개선 로드맵

### 30일
목표: 가장 큰 blast radius 제거
- voice pipeline을 동기 호출 중심에서 job 중심으로 재설계
- `voice-transcribe`를 직접 요청 처리형이 아니라 비동기 처리형으로 전환
- 메일 발송 provider 분리
- 상태 전이에 idempotency key 도입
- runbook / smoke / 운영 경로 정리

### 60일
목표: 핵심 엔진 운영 통제권 회수
- `voice-fsm-controller` 핵심 처리 일부 또는 전부를 app backend/worker로 이동
- `causal-analysis`, `edge-weight-calibration`을 batch/worker로 이동
- 외부 provider별 retry / backoff / circuit breaker 추가
- observability 강화
  - job 상태
  - 단계별 latency
  - provider 실패율
  - replay 가능 로그

### 90일
목표: 장애 복원력 확보
- queue / dead-letter / replay 체계 확립
- degraded mode 정의
  - 전사 지연 허용
  - 리포트 생성 지연 허용
  - 알림 지연 허용
- Supabase를 데이터 플랫폼 중심으로 축소
- 핵심 처리 로직의 서비스 ownership 명확화

---

## 6. 최종 권고

### 하지 말 것
- 당장 전면 탈-Supabase
- DB까지 포함한 무리한 자가구축
- 핵심 경로를 계속 Edge/Auth/email 정책에 묶어두기

### 지금 해야 할 것
- Supabase는 **DB/RLS/Storage/Realtime 중심**으로 유지
- 핵심 처리 경로는 **worker/service 중심**으로 이동
- voice pipeline을 첫 번째 분리 대상으로 선정
- 이메일과 거래성 발송은 별도 provider로 분리

한 줄 결론:

> HelloNext는 Supabase를 버리는 것이 아니라, Supabase를 **데이터 플랫폼으로 축소**하고 핵심 처리 로직을 **장애 격리 가능한 서비스 경계**로 재편해야 운영 안정성이 올라간다.
