# HelloNext AI Pipeline Reference

## Overview

The HelloNext AI Pipeline orchestrates three core Edge Functions that handle voice-to-report generation, swing analysis with confidence measurement, and causal graph inference for intelligent coaching insights. This document provides the architectural diagrams and functional reference for Phase 3 v2.0 of the system.

---

## A-4. Component Diagram — AI 파이프라인 (v1.1 기반 + v2.0 확장)

```mermaid
graph LR
    subgraph "Input"
        VM["음성 파일<br/>(WebM/M4A, ≤10MB)"]
        SV["스윙 영상<br/>(MP4/MOV, ≤60s)"]
    end

    subgraph "Edge Function: voice-to-report (v2.0 수정)"
        Q["FSM: UNBOUND 초기화<br/>(voice_memo_cache 생성)"]
        W["Whisper API 전사<br/>→PREPROCESSED"]
        BN["target_id 결합<br/>→LINKED"]
        GL["용어사전 조회"]
        S["LLM 구조화<br/>JSON 생성"]
        ET["에러 태그 매핑"]
        RG["리포트 생성<br/>→FINALIZED"]
        NF["알림 발송"]
    end

    subgraph "Edge Function: swing-analysis (v2.0 수정)"
        PD["포즈 데이터 수신<br/>→Layer A 저장 (immutable)"]
        MC["measurement_confidence<br/>복합 산출 (DC-2)"]
        ST["3단계 상태 분류<br/>(confirmed/pending/hidden)"]
        FC["Feel Check 응답"]
        AO["AI 관찰 생성<br/>(LLM, 톤 설정)"]
        CF["coach_consultation_flag"]
    end

    subgraph "Edge Function: causal-analysis (v2.0 신규)"
        CA_B["종속성 모델 생성<br/>Layer A→Layer B"]
        CA_T["역추적 + IIS"]
        CA_P["Primary Fix 결정<br/>(스칼라, DC-4)"]
        CA_D["수정 델타 기록"]
        CA_C["간선 보정 (배치)"]
    end

    VM --> Q --> W --> BN --> GL --> S --> ET --> RG --> NF
    SV --> PD --> MC --> ST
    FC --> AO
    ST --> AO --> CF
    PD --> CA_B --> CA_T --> CA_P
    CA_P -.->|프로 수정 시| CA_D --> CA_C
```

---

## D-4. 음성 FSM 파이프라인 (F-017 + F-001 수정)

```mermaid
sequenceDiagram
    participant P as 프로 브라우저
    participant V as Vercel (API)
    participant FSM as Voice FSM Controller
    participant WH as Whisper API
    participant LLM as GPT-4o/Claude
    participant DB as PostgreSQL
    participant RT as Realtime

    Note over P: F-001 + F-017: 음성 메모 녹음
    P->>V: POST 음성 업로드
    V->>DB: INSERT voice_memos (status=recording)
    V->>FSM: 캐시 레코드 생성 요청

    Note over FSM: DC-5: UNBOUND 초기화
    FSM->>DB: INSERT voice_memo_cache<br/>(state=UNBOUND, target_id=NULL)

    Note over FSM: UNBOUND→PREPROCESSED
    FSM->>WH: 비동기 전사 (job_id=UUID 할당)
    WH-->>FSM: transcript 결과
    FSM->>DB: UPDATE voice_memo_cache<br/>(state=PREPROCESSED, transcript, job_id)
    FSM->>DB: INSERT voice_memo_state_log

    alt 고아 메모 (F-003)
        Note over P: PREPROCESSED 상태 대기
        P->>V: Bottom Sheet에서 target_id 매핑
    end

    Note over FSM: PREPROCESSED→LINKED
    V->>FSM: target_id 결합 신호
    FSM->>DB: Verify state=PREPROCESSED
    FSM->>DB: UPDATE voice_memo_cache<br/>(state=LINKED, target_id=valid)
    FSM->>DB: INSERT voice_memo_state_log

    Note over FSM: LINKED→FINALIZED (캐시 재사용)
    FSM->>DB: SELECT transcript FROM voice_memo_cache (재사용)
    FSM->>LLM: 구조화 + 리포트 생성 (전사 미재실행)
    LLM-->>FSM: structured_json + report
    FSM->>DB: INSERT reports + UPDATE voice_memo_cache<br/>(state=FINALIZED)
    FSM->>DB: INSERT voice_memo_state_log
    FSM->>RT: Realtime (report_ready)
    RT-->>P: 리포트 프리뷰 표시
```

---

## D-5. 측정 신뢰도 3단계 상태 전이 (F-016 + F-005 수정)

```mermaid
sequenceDiagram
    participant M as 회원 PWA
    participant MP as MediaPipe (Client)
    participant V as Vercel
    participant MCE as Measurement Confidence Engine
    participant DB as PostgreSQL
    participant RT as Realtime
    participant P as 프로 대시보드

    M->>MP: 스윙 촬영 + 포즈 추정
    MP-->>M: keypoints + angles
    M->>V: POST 포즈 데이터

    Note over V: DC-1: Layer A 저장 (불변)
    V->>DB: INSERT raw_measurements (spatial_data, source_model)

    Note over MCE: DC-2: 복합 신뢰도 산출
    V->>MCE: confidence 산출 요청
    MCE->>MCE: measurement_confidence =<br/>keypoint_vis × cam_angle ×<br/>motion_blur × occlusion × K
    MCE->>DB: UPDATE raw_measurements.measurement_confidence

    Note over MCE: F-016: 3단계 분류
    alt confidence >= 0.7 (T1)
        MCE->>DB: INSERT measurement_states<br/>(state=confirmed)
        MCE->>RT: confirmed 데이터 → 회원 표시
    else 0.4 <= confidence < 0.7
        MCE->>DB: INSERT measurement_states<br/>(state=pending_verification)
        MCE->>DB: INSERT verification_queue<br/>(token=UUID, review_state=pending)
        MCE->>RT: pending → 프로 대시보드 큐
    else confidence < 0.4 (T2)
        MCE->>DB: INSERT measurement_states<br/>(state=hidden)
        Note over MCE: 회원 미표시, 프로 참조만
    end

    Note over P: F-016 AC-5: 프로 검증 응답
    P->>V: POST verification response
    alt confirm
        V->>DB: UPDATE measurement_states<br/>(state=confirmed, review_state=reviewed)
        V->>DB: UPDATE verification_queue<br/>(response_type=confirm)
        V->>RT: 회원에게 확정 표시 전환
    else correct
        V->>DB: 보정값으로 confidence 재산정
        V->>DB: UPDATE measurement_states<br/>(state=confirmed 또는 hidden)
    else reject
        V->>DB: UPDATE measurement_states<br/>(state=hidden, review_state=reviewed)
    end
```

---

## D-6. 인과그래프 역추적 + 수정 델타 보정 (F-015)

```mermaid
sequenceDiagram
    participant V as Vercel
    participant CGE as Causal Graph Engine
    participant DB as PostgreSQL
    participant P as 프로 대시보드
    participant BATCH as Edge Weight Calibration (배치)

    Note over CGE: F-015 AC-1: Layer A→Layer B
    V->>CGE: 종속성 모델 생성 요청
    CGE->>DB: SELECT raw_measurements WHERE session_id
    CGE->>CGE: 증상 노드 탐지 + 종속성 간선 생성
    CGE->>DB: INSERT derived_metrics<br/>(auto_detected_symptoms, dependency_edges)

    Note over CGE: F-015 AC-2: 역추적 + IIS + Primary Fix
    CGE->>DB: SELECT causal_graph_edges (DAG)
    CGE->>CGE: 역방향 탐색 (증상→원인)
    CGE->>CGE: IIS 산출 (각 후보 원인)
    CGE->>CGE: Primary Fix 결정 (최대 IIS 노드 1개)
    CGE->>DB: INSERT coaching_decisions<br/>(primary_fix=스칼라, auto_draft, tier=tier_1)
    CGE->>V: Realtime → 프로 대시보드

    Note over P: F-015 AC-3: 프로 수정
    P->>V: 프로가 자동 진단 수정
    V->>DB: SELECT coaching_decisions (original)
    V->>V: diff 계산 (before/after)
    V->>DB: UPDATE coaching_decisions<br/>(coach_edited, tier=tier_2 또는 tier_3)
    V->>DB: INSERT edit_deltas<br/>(edited_fields, original, edited, delta, tier)

    Note over BATCH: F-015 AC-4: 간선 보정 (배치)
    BATCH->>DB: SELECT edit_deltas WHERE created_at > last_run<br/>GROUP BY decision_id (10건 이상)
    BATCH->>DB: SELECT causal_graph_edges 관련 간선
    BATCH->>BATCH: data_quality_tier별 보정 계수 차등 적용<br/>tier_1: 0 (보정 불필요)<br/>tier_2: 1.0 (표준)<br/>tier_3: 0.5 (보수적)
    BATCH->>DB: UPDATE causal_graph_edges SET weight = 보정값
```

---

## Edge Functions Summary

### 1. voice-to-report

Handles conversion of coaching audio notes to structured reports through an FSM pipeline:

- **Initialization (UNBOUND)**: Creates a voice_memo_cache record with NULL target_id
- **Preprocessing**: Asynchronously transcribes audio via Whisper API, moves to PREPROCESSED state
- **Linking**: Receives target_id mapping (e.g., swing session, player) and transitions to LINKED state
- **Finalization**: Reuses cached transcript for LLM structuring, generates structured JSON and report, transitions to FINALIZED and notifies via Realtime
- **Notification**: Sends completion alerts to both pro dashboard and relevant stakeholders

Key feature: Caches transcript to avoid re-transcription when coaches correct/modify target associations.

### 2. swing-analysis

Processes swing video data to produce measurement-driven coaching insights:

- **Raw Measurement Layer A**: Stores immutable pose keypoints and angles from MediaPipe client detection
- **Confidence Engine (DC-2)**: Computes composite measurement_confidence = keypoint_visibility × camera_angle × motion_blur × occlusion × calibration_factor
- **3-tier Classification (F-016)**:
  - **T1 (confidence ≥ 0.7)**: Confirmed state, displayed to member
  - **T2 (0.4 ≤ confidence < 0.7)**: Pending verification, queued for pro review with UUID token
  - **T3 (confidence < 0.4)**: Hidden state, shown only to pro reference
- **AI Observation**: Generates LLM-based coaching insights with tone settings per coach
- **Pro Verification**: Coaches can confirm, correct (recalculate), or reject pending measurements; corrected values trigger state re-evaluation

### 3. causal-analysis

Infers root-cause relationships and determines primary coaching focus:

- **Dependency Modeling (AC-1)**: Converts raw Layer A measurements into Layer B derived metrics and symptom nodes; auto-detects causal edges (DAG)
- **Reverse Trace + IIS (AC-2)**: Performs backward graph search from symptoms to root causes; calculates Impact-Importance Score (IIS) for each candidate; selects single primary_fix scalar (highest IIS)
- **Pro Edits (AC-3)**: Coaches can override auto-diagnosis; system records original vs. edited coaching_decisions with data_quality_tier (tier_1/tier_2/tier_3)
- **Edge Calibration (AC-4)**: Batch process applies tier-based correction coefficients to causal_graph_edges:
  - tier_1 (auto): 0.0 (no correction)
  - tier_2 (coach-edited): 1.0 (standard)
  - tier_3 (conservative edits): 0.5 (conservative)

Together, these functions enable a complete loop from voice notes → measurement → causal inference → adaptive coaching recommendations.
