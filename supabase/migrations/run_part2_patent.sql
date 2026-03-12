-- ============================================================
-- HelloNext Migration Part 2: Patent Engine (009-018)
-- Supabase SQL Editor에서 실행 (Part 2 of 3)
-- ⚠️ Part 1 실행 완료 후 실행하세요
-- ============================================================

-- === 009_raw_measurements.sql ===
/**
 * Migration 009: Raw Measurements (Layer A — Immutable)
 *
 * Patent 1 Claim 1(a): 제1 논리 계층 — 원시 측정값 저장
 * DC-1: 3계층 데이터 논리 분리
 * DC-3: 원시 측정값 불변성 (UPDATE 차단)
 *
 * Dependencies: 003_swing_videos_and_pose (swing_videos)
 */

CREATE TABLE public.raw_measurements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES public.swing_videos(id) ON DELETE CASCADE,
    frame_index INT NOT NULL CHECK (frame_index >= 0),
    spatial_data JSONB NOT NULL,
    measurement_confidence FLOAT CHECK (measurement_confidence >= 0 AND measurement_confidence <= 1),
    source_model TEXT NOT NULL DEFAULT 'mediapipe_blazepose',
    source_version TEXT NOT NULL DEFAULT '0.10.14',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    UNIQUE(session_id, frame_index)
);

COMMENT ON TABLE public.raw_measurements IS 'Layer A (Patent 1): Immutable raw pose measurements. UPDATE prohibited by DC-3.';
COMMENT ON COLUMN public.raw_measurements.spatial_data IS 'Raw keypoints, joint coordinates, visibility scores from pose estimation';
COMMENT ON COLUMN public.raw_measurements.measurement_confidence IS 'DC-2: Composite confidence = keypoint_vis × cam_angle × motion_blur × occlusion × K';

CREATE INDEX idx_raw_meas_session ON public.raw_measurements(session_id, frame_index);
CREATE INDEX idx_raw_meas_confidence ON public.raw_measurements(session_id, measurement_confidence);

-- DC-3: Layer A 불변성 강제 — UPDATE 차단 트리거
CREATE OR REPLACE FUNCTION public.prevent_raw_measurement_update()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'DC-3 VIOLATION: raw_measurements table is immutable. UPDATE operations are prohibited.';
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER enforce_raw_measurement_immutability
    BEFORE UPDATE ON public.raw_measurements
    FOR EACH ROW EXECUTE FUNCTION public.prevent_raw_measurement_update();

-- ROLLBACK:
-- DROP TRIGGER IF EXISTS enforce_raw_measurement_immutability ON public.raw_measurements;
-- DROP FUNCTION IF EXISTS public.prevent_raw_measurement_update();
-- DROP TABLE IF EXISTS public.raw_measurements;

-- === 010_derived_metrics.sql ===
/**
 * Migration 010: Derived Metrics (Layer B — Recalculable)
 *
 * Patent 1 Claim 1(b): 제2 논리 계층 — 파생 지표
 * DC-1: 3계층 데이터 논리 분리
 *
 * Dependencies: 003_swing_videos_and_pose, 009_raw_measurements
 */

CREATE TABLE public.derived_metrics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES public.swing_videos(id) ON DELETE CASCADE,
    compound_metrics JSONB NOT NULL DEFAULT '{}',
    auto_detected_symptoms JSONB NOT NULL DEFAULT '[]',
    dependency_edges JSONB NOT NULL DEFAULT '[]',
    formula_id TEXT NOT NULL DEFAULT 'v1.0',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    recalculated_at TIMESTAMPTZ
);

COMMENT ON TABLE public.derived_metrics IS 'Layer B (Patent 1): Derived metrics computed from Layer A. Recalculable, not human-editable.';
COMMENT ON COLUMN public.derived_metrics.compound_metrics IS 'X-Factor, swing tempo, hip rotation etc.';
COMMENT ON COLUMN public.derived_metrics.auto_detected_symptoms IS 'Auto-detected error pattern nodes from analysis';
COMMENT ON COLUMN public.derived_metrics.dependency_edges IS 'Symptom-to-symptom dependency edges for causal graph input';
COMMENT ON COLUMN public.derived_metrics.formula_id IS 'Version of calculation logic for reproducibility';

CREATE INDEX idx_derived_session ON public.derived_metrics(session_id);

-- ROLLBACK:
-- DROP TABLE IF EXISTS public.derived_metrics;

-- === 011_coaching_decisions.sql ===
/**
 * Migration 011: Coaching Decisions (Layer C — Coach-Editable)
 *
 * Patent 1 Claims 1(c)-(d): 제3 논리 계층 — 코칭 결정
 * DC-1: 3계층 데이터 논리 분리
 * DC-4: 단일 스칼라 Primary Fix 강제
 *
 * Dependencies: 003_swing_videos_and_pose, 001_users_and_profiles
 */

CREATE TABLE public.coaching_decisions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES public.swing_videos(id) ON DELETE CASCADE,
    coach_profile_id UUID NOT NULL REFERENCES public.pro_profiles(id),
    primary_fix TEXT,
    auto_draft JSONB NOT NULL DEFAULT '{}',
    coach_edited JSONB,
    data_quality_tier TEXT NOT NULL DEFAULT 'tier_1'
        CHECK (data_quality_tier IN ('tier_1', 'tier_2', 'tier_3')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.coaching_decisions IS 'Layer C (Patent 1): Coach-editable coaching decisions. Ground truth labels.';
COMMENT ON COLUMN public.coaching_decisions.primary_fix IS 'DC-4: Single scalar Primary Fix node. Must reference exactly one error pattern code.';
COMMENT ON COLUMN public.coaching_decisions.data_quality_tier IS 'tier_1=AI unchanged, tier_2=partial edit, tier_3=full override';

CREATE INDEX idx_decisions_session ON public.coaching_decisions(session_id);
CREATE INDEX idx_decisions_coach ON public.coaching_decisions(coach_profile_id);
CREATE INDEX idx_decisions_tier ON public.coaching_decisions(data_quality_tier)
    WHERE data_quality_tier IN ('tier_2', 'tier_3');

CREATE TRIGGER set_coaching_decisions_updated_at
    BEFORE UPDATE ON public.coaching_decisions
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- ROLLBACK:
-- DROP TRIGGER IF EXISTS set_coaching_decisions_updated_at ON public.coaching_decisions;
-- DROP TABLE IF EXISTS public.coaching_decisions;

-- === 012_edit_deltas.sql ===
/**
 * Migration 012: Edit Deltas
 *
 * Patent 1 Claims 1(d), 3: 수정 델타 레코드
 * 프로가 자동 진단을 수정할 때 before/after 차이를 영구 기록
 *
 * Dependencies: 011_coaching_decisions
 */

CREATE TABLE public.edit_deltas (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    decision_id UUID NOT NULL REFERENCES public.coaching_decisions(id) ON DELETE CASCADE,
    edited_fields TEXT[] NOT NULL,
    original_value JSONB NOT NULL,
    edited_value JSONB NOT NULL,
    delta_value JSONB NOT NULL,
    data_quality_tier TEXT NOT NULL
        CHECK (data_quality_tier IN ('tier_1', 'tier_2', 'tier_3')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.edit_deltas IS 'Patent 1 Claim 3: Edit delta records for RLHF and edge weight calibration';
COMMENT ON COLUMN public.edit_deltas.edited_fields IS 'Array of field names that were modified';
COMMENT ON COLUMN public.edit_deltas.delta_value IS 'Computed difference between original and edited values';

CREATE INDEX idx_deltas_decision ON public.edit_deltas(decision_id);
CREATE INDEX idx_deltas_tier ON public.edit_deltas(data_quality_tier)
    WHERE data_quality_tier IN ('tier_2', 'tier_3');
CREATE INDEX idx_deltas_created ON public.edit_deltas(created_at DESC);

-- ROLLBACK:
-- DROP TABLE IF EXISTS public.edit_deltas;

-- === 013_causal_graph_edges.sql ===
/**
 * Migration 013: Causal Graph Edges
 *
 * Patent 1 Claims 1(b), 1(e): 인과 그래프 DAG 간선 + 부분 보정
 *
 * Dependencies: 007_error_patterns_seed (error_patterns)
 */

CREATE TABLE public.causal_graph_edges (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    from_node TEXT NOT NULL,
    to_node TEXT NOT NULL,
    edge_type TEXT NOT NULL DEFAULT 'causes'
        CHECK (edge_type IN ('causes', 'aggravates', 'correlates')),
    weight FLOAT NOT NULL DEFAULT 0.5
        CHECK (weight >= 0.0 AND weight <= 1.0),
    calibrated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    calibration_count INT NOT NULL DEFAULT 0,

    UNIQUE(from_node, to_node, edge_type)
);

COMMENT ON TABLE public.causal_graph_edges IS 'Patent 1: Causal graph DAG edges between error pattern nodes. Weights partially calibrated via edit deltas.';
COMMENT ON COLUMN public.causal_graph_edges.from_node IS 'Source error pattern code (cause)';
COMMENT ON COLUMN public.causal_graph_edges.to_node IS 'Target error pattern code (effect/symptom)';
COMMENT ON COLUMN public.causal_graph_edges.weight IS 'Edge weight [0,1] calibrated by edit deltas';

CREATE INDEX idx_graph_from ON public.causal_graph_edges(from_node);
CREATE INDEX idx_graph_to ON public.causal_graph_edges(to_node);

-- 초기 시드: 22개 에러 패턴 기반 6개 인과 체인
-- (seed.sql에서 INSERT)

-- ROLLBACK:
-- DROP TABLE IF EXISTS public.causal_graph_edges;

-- === 014_measurement_states.sql ===
/**
 * Migration 014: Measurement States
 *
 * Patent 3 Claims 1(b)-(c): 3단계 신뢰도 상태 분류
 *
 * Dependencies: 009_raw_measurements
 */

CREATE TABLE public.measurement_states (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    measurement_id UUID NOT NULL UNIQUE REFERENCES public.raw_measurements(id) ON DELETE CASCADE,
    session_id UUID NOT NULL REFERENCES public.swing_videos(id) ON DELETE CASCADE,
    state TEXT NOT NULL DEFAULT 'pending_verification'
        CHECK (state IN ('confirmed', 'pending_verification', 'hidden')),
    confidence_score FLOAT NOT NULL
        CHECK (confidence_score >= 0 AND confidence_score <= 1),
    predicted_value JSONB,
    review_state TEXT NOT NULL DEFAULT 'pending'
        CHECK (review_state IN ('pending', 'reviewed')),
    issued_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.measurement_states IS 'Patent 3: 3-tier state classification for each measurement based on confidence score';
COMMENT ON COLUMN public.measurement_states.state IS 'confirmed(>=0.7), pending_verification(0.4~0.7), hidden(<0.4)';

CREATE INDEX idx_meas_state_session ON public.measurement_states(session_id, state);
CREATE INDEX idx_meas_state_pending ON public.measurement_states(session_id)
    WHERE state = 'pending_verification' AND review_state = 'pending';
CREATE INDEX idx_meas_state_hidden ON public.measurement_states(session_id)
    WHERE state = 'hidden';

-- ROLLBACK:
-- DROP TABLE IF EXISTS public.measurement_states;

-- === 015_verification_queue.sql ===
/**
 * Migration 015: Verification Queue
 *
 * Patent 3 Claims 1(c), 1(e): 검증 대기 객체 및 비동기 검증 큐
 *
 * Dependencies: 014_measurement_states, 001_users_and_profiles
 */

CREATE TABLE public.verification_queue (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    measurement_state_id UUID NOT NULL UNIQUE REFERENCES public.measurement_states(id) ON DELETE CASCADE,
    token TEXT NOT NULL UNIQUE DEFAULT gen_random_uuid()::text,
    review_state TEXT NOT NULL DEFAULT 'pending'
        CHECK (review_state IN ('pending', 'confirmed', 'corrected', 'rejected')),
    reviewer_id UUID REFERENCES public.pro_profiles(id),
    reviewed_at TIMESTAMPTZ,
    response_type TEXT
        CHECK (response_type IS NULL OR response_type IN ('confirm', 'correct', 'reject')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.verification_queue IS 'Patent 3: Async verification queue for pending_verification measurements. Tokens issued only for pending state.';

CREATE INDEX idx_verif_pending ON public.verification_queue(review_state)
    WHERE review_state = 'pending';
CREATE INDEX idx_verif_reviewer ON public.verification_queue(reviewer_id)
    WHERE review_state = 'pending';

-- ROLLBACK:
-- DROP TABLE IF EXISTS public.verification_queue;

-- === 016_voice_memo_cache.sql ===
/**
 * Migration 016: Voice Memo Cache (FSM State Management)
 *
 * Patent 4 Claims 1(a)-(e): 4단계 FSM + 캐시 재사용
 * DC-5: 엄격한 상태 전이 규칙
 *
 * Dependencies: 002_voice_memos_and_reports, 001_users_and_profiles
 */

CREATE TABLE public.voice_memo_cache (
    memo_id UUID PRIMARY KEY REFERENCES public.voice_memos(id) ON DELETE CASCADE,
    coach_profile_id UUID NOT NULL REFERENCES public.pro_profiles(id),
    target_id UUID REFERENCES public.member_profiles(id),
    state TEXT NOT NULL DEFAULT 'UNBOUND'
        CHECK (state IN ('UNBOUND', 'PREPROCESSED', 'LINKED', 'FINALIZED')),
    transcription_job_id TEXT UNIQUE,
    audio_blob_ref TEXT NOT NULL,
    transcript TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.voice_memo_cache IS 'Patent 4 DC-5: 4-state FSM for voice memo lifecycle. Cache reuse prevents duplicate transcription.';
COMMENT ON COLUMN public.voice_memo_cache.state IS 'UNBOUND→PREPROCESSED→LINKED→FINALIZED. No state skips allowed.';
COMMENT ON COLUMN public.voice_memo_cache.target_id IS 'Patent 4 Claim 2: Must be NULL in UNBOUND and PREPROCESSED states.';

CREATE INDEX idx_cache_state ON public.voice_memo_cache(state)
    WHERE state IN ('UNBOUND', 'PREPROCESSED', 'LINKED');
CREATE INDEX idx_cache_coach ON public.voice_memo_cache(coach_profile_id, state);

-- DC-5: target_id NULL 불변조건 강제
CREATE OR REPLACE FUNCTION public.enforce_target_id_null_invariant()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.state IN ('UNBOUND', 'PREPROCESSED') AND NEW.target_id IS NOT NULL THEN
        RAISE EXCEPTION 'DC-5 VIOLATION: target_id must be NULL in state % (Patent 4 Claim 2)', NEW.state;
    END IF;
    IF NEW.state IN ('LINKED', 'FINALIZED') AND NEW.target_id IS NULL THEN
        RAISE EXCEPTION 'DC-5 VIOLATION: target_id must NOT be NULL in state %', NEW.state;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER enforce_voice_cache_target_invariant
    BEFORE INSERT OR UPDATE ON public.voice_memo_cache
    FOR EACH ROW EXECUTE FUNCTION public.enforce_target_id_null_invariant();

-- DC-5: 상태 전이 guard (스킵 방지)
CREATE OR REPLACE FUNCTION public.enforce_fsm_transition()
RETURNS TRIGGER AS $$
DECLARE
    valid_transitions JSONB := '{
        "UNBOUND": ["PREPROCESSED"],
        "PREPROCESSED": ["LINKED"],
        "LINKED": ["FINALIZED"]
    }'::JSONB;
    allowed TEXT[];
BEGIN
    IF OLD.state = NEW.state THEN
        RETURN NEW;
    END IF;

    IF OLD.state = 'FINALIZED' THEN
        RAISE EXCEPTION 'DC-5 VIOLATION: Cannot transition from FINALIZED state';
    END IF;

    SELECT array_agg(elem::text)
    INTO allowed
    FROM jsonb_array_elements_text(valid_transitions -> OLD.state) AS elem;

    IF NOT (NEW.state = ANY(allowed)) THEN
        RAISE EXCEPTION 'DC-5 VIOLATION: Invalid transition from % to % (Patent 4 Claim 1)', OLD.state, NEW.state;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER enforce_voice_cache_fsm
    BEFORE UPDATE ON public.voice_memo_cache
    FOR EACH ROW EXECUTE FUNCTION public.enforce_fsm_transition();

-- 상태 전이 로그 (감사 추적)
CREATE TABLE public.voice_memo_state_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    memo_id UUID NOT NULL REFERENCES public.voice_memos(id),
    from_state TEXT NOT NULL,
    to_state TEXT NOT NULL,
    transitioned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    metadata JSONB
);

CREATE OR REPLACE FUNCTION public.log_fsm_transition()
RETURNS TRIGGER AS $$
BEGIN
    IF OLD.state != NEW.state THEN
        INSERT INTO public.voice_memo_state_log (memo_id, from_state, to_state, metadata)
        VALUES (NEW.memo_id, OLD.state, NEW.state,
                jsonb_build_object('target_id', NEW.target_id, 'job_id', NEW.transcription_job_id));
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER log_voice_cache_transition
    AFTER UPDATE ON public.voice_memo_cache
    FOR EACH ROW EXECUTE FUNCTION public.log_fsm_transition();

CREATE TRIGGER set_voice_memo_cache_updated_at
    BEFORE UPDATE ON public.voice_memo_cache
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- ROLLBACK:
-- DROP TRIGGER IF EXISTS set_voice_memo_cache_updated_at ON public.voice_memo_cache;
-- DROP TRIGGER IF EXISTS log_voice_cache_transition ON public.voice_memo_cache;
-- DROP TRIGGER IF EXISTS enforce_voice_cache_fsm ON public.voice_memo_cache;
-- DROP TRIGGER IF EXISTS enforce_voice_cache_target_invariant ON public.voice_memo_cache;
-- DROP TABLE IF EXISTS public.voice_memo_state_log;
-- DROP TABLE IF EXISTS public.voice_memo_cache;
-- DROP FUNCTION IF EXISTS public.log_fsm_transition();
-- DROP FUNCTION IF EXISTS public.enforce_fsm_transition();
-- DROP FUNCTION IF EXISTS public.enforce_target_id_null_invariant();

-- === 017_patent_rls_policies.sql ===
/**
 * Migration 017: RLS Policies for Patent Tables (v2.0 수정)
 *
 * Row Level Security for all v2.0 patent-derived tables.
 * Key policy: raw_measurements has NO UPDATE policy (DC-3 immutability).
 * Hidden measurement_states are excluded from member access path (Patent 3 Claim 1(d)).
 *
 * Note: service_role 키로 호출되는 Edge Function은 RLS를 우회하지만,
 *       anon/authenticated 키를 사용하는 경우를 대비한 방어적 정책 포함.
 *
 * Dependencies: 009~016 patent tables
 */

-- Enable RLS on all patent tables
ALTER TABLE public.raw_measurements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.derived_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coaching_decisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.edit_deltas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.causal_graph_edges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.measurement_states ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.verification_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.voice_memo_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.voice_memo_state_log ENABLE ROW LEVEL SECURITY;

-- ============================
-- raw_measurements: DC-3 불변 — SELECT + INSERT only, NO UPDATE
-- ============================
-- 회원: 자기 세션만 읽기
CREATE POLICY raw_meas_member_read ON public.raw_measurements
    FOR SELECT USING (
        session_id IN (SELECT id FROM public.swing_videos WHERE member_id IN
            (SELECT id FROM public.member_profiles WHERE user_id = auth.uid()))
    );

-- 프로: 연결된 회원 세션 읽기
CREATE POLICY raw_meas_pro_read ON public.raw_measurements
    FOR SELECT USING (
        session_id IN (SELECT sv.id FROM public.swing_videos sv
            JOIN public.pro_member_links pml ON sv.member_id = pml.member_id
            WHERE pml.pro_id IN (SELECT id FROM public.pro_profiles WHERE user_id = auth.uid())
            AND pml.status = 'active')
    );

-- Edge Function (service_role): INSERT만
CREATE POLICY raw_meas_service_insert ON public.raw_measurements
    FOR INSERT WITH CHECK (true);
-- Note: UPDATE policy 없음 = DC-3 RLS 강제

-- ============================
-- derived_metrics: 회원/프로 읽기 + Edge Function INSERT/UPDATE (DC-1 Layer B)
-- ============================
-- 회원: 자기 세션 메트릭 읽기
CREATE POLICY derived_member_read ON public.derived_metrics
    FOR SELECT USING (
        session_id IN (SELECT id FROM public.swing_videos WHERE member_id IN
            (SELECT id FROM public.member_profiles WHERE user_id = auth.uid()))
    );

-- 프로: 연결된 회원 세션 메트릭 읽기
CREATE POLICY derived_pro_read ON public.derived_metrics
    FOR SELECT USING (
        session_id IN (SELECT sv.id FROM public.swing_videos sv
            JOIN public.pro_member_links pml ON sv.member_id = pml.member_id
            WHERE pml.pro_id IN (SELECT id FROM public.pro_profiles WHERE user_id = auth.uid())
            AND pml.status = 'active')
    );

-- Edge Function (service_role): INSERT + UPDATE
CREATE POLICY derived_service_insert ON public.derived_metrics
    FOR INSERT WITH CHECK (true);

CREATE POLICY derived_service_update ON public.derived_metrics
    FOR UPDATE USING (true);

-- ============================
-- measurement_states: 회원은 hidden 제외 (Patent 3 Claim 1(d))
-- ============================
-- 회원: confirmed + pending만 (데이터 접근 경로 분리)
CREATE POLICY meas_state_member ON public.measurement_states
    FOR SELECT USING (
        state != 'hidden' AND
        session_id IN (SELECT id FROM public.swing_videos WHERE member_id IN
            (SELECT id FROM public.member_profiles WHERE user_id = auth.uid()))
    );

-- 프로: 전체 (hidden 포함 — 참조 레코드 접근 가능)
CREATE POLICY meas_state_pro ON public.measurement_states
    FOR SELECT USING (
        session_id IN (SELECT sv.id FROM public.swing_videos sv
            JOIN public.pro_member_links pml ON sv.member_id = pml.member_id
            WHERE pml.pro_id IN (SELECT id FROM public.pro_profiles WHERE user_id = auth.uid())
            AND pml.status = 'active')
    );

-- Edge Function (service_role): INSERT + UPDATE (신뢰도 엔진)
CREATE POLICY meas_state_service_insert ON public.measurement_states
    FOR INSERT WITH CHECK (true);

CREATE POLICY meas_state_service_update ON public.measurement_states
    FOR UPDATE USING (true);

-- ============================
-- verification_queue: 프로 읽기/수정 + Edge Function INSERT
-- ============================
CREATE POLICY verif_pro_read ON public.verification_queue
    FOR SELECT USING (
        reviewer_id IN (SELECT id FROM public.pro_profiles WHERE user_id = auth.uid())
        OR measurement_state_id IN (
            SELECT ms.id FROM public.measurement_states ms
            JOIN public.swing_videos sv ON ms.session_id = sv.id
            JOIN public.pro_member_links pml ON sv.member_id = pml.member_id
            WHERE pml.pro_id IN (SELECT id FROM public.pro_profiles WHERE user_id = auth.uid())
            AND pml.status = 'active'
        )
    );

CREATE POLICY verif_pro_update ON public.verification_queue
    FOR UPDATE USING (
        reviewer_id IN (SELECT id FROM public.pro_profiles WHERE user_id = auth.uid())
    );

-- Edge Function (service_role): INSERT (검증 토큰 발급)
CREATE POLICY verif_service_insert ON public.verification_queue
    FOR INSERT WITH CHECK (true);

-- ============================
-- coaching_decisions: 프로 전체 + 회원 읽기 (DC-1 Layer C)
-- ============================
CREATE POLICY decisions_pro_all ON public.coaching_decisions
    FOR ALL USING (
        coach_profile_id IN (SELECT id FROM public.pro_profiles WHERE user_id = auth.uid())
    );

CREATE POLICY decisions_member_read ON public.coaching_decisions
    FOR SELECT USING (
        session_id IN (SELECT id FROM public.swing_videos WHERE member_id IN
            (SELECT id FROM public.member_profiles WHERE user_id = auth.uid()))
    );

-- ============================
-- edit_deltas: 프로 읽기 + Edge Function INSERT
-- ============================
CREATE POLICY deltas_pro_read ON public.edit_deltas
    FOR SELECT USING (
        decision_id IN (SELECT id FROM public.coaching_decisions
            WHERE coach_profile_id IN (SELECT id FROM public.pro_profiles WHERE user_id = auth.uid()))
    );

CREATE POLICY deltas_service_insert ON public.edit_deltas
    FOR INSERT WITH CHECK (true);

-- ============================
-- causal_graph_edges: 인증 사용자 읽기 + Edge Function INSERT/UPDATE
-- ============================
CREATE POLICY graph_read_all ON public.causal_graph_edges
    FOR SELECT USING (auth.uid() IS NOT NULL);

-- Edge Function / seed: INSERT (초기 시드 + 엔진 생성)
CREATE POLICY graph_service_insert ON public.causal_graph_edges
    FOR INSERT WITH CHECK (true);

-- Edge Function: UPDATE (간선 가중치 보정 — edge-weight-calibration)
CREATE POLICY graph_service_update ON public.causal_graph_edges
    FOR UPDATE USING (true);

-- ============================
-- voice_memo_cache: 프로만 (DC-5)
-- ============================
CREATE POLICY cache_pro_all ON public.voice_memo_cache
    FOR ALL USING (
        coach_profile_id IN (SELECT id FROM public.pro_profiles WHERE user_id = auth.uid())
    );

-- ============================
-- voice_memo_state_log: 프로 읽기 + 트리거 INSERT
-- ============================
CREATE POLICY state_log_pro_read ON public.voice_memo_state_log
    FOR SELECT USING (
        memo_id IN (SELECT id FROM public.voice_memos
            WHERE pro_id IN (SELECT id FROM public.pro_profiles WHERE user_id = auth.uid()))
    );

-- 트리거 함수(log_fsm_transition)가 INSERT 수행 — service_role이 아닌 경우 대비
CREATE POLICY state_log_trigger_insert ON public.voice_memo_state_log
    FOR INSERT WITH CHECK (true);

-- ============================
-- ROLLBACK
-- ============================
-- DROP POLICY IF EXISTS raw_meas_member_read ON public.raw_measurements;
-- DROP POLICY IF EXISTS raw_meas_pro_read ON public.raw_measurements;
-- DROP POLICY IF EXISTS raw_meas_service_insert ON public.raw_measurements;
-- DROP POLICY IF EXISTS derived_member_read ON public.derived_metrics;
-- DROP POLICY IF EXISTS derived_pro_read ON public.derived_metrics;
-- DROP POLICY IF EXISTS derived_service_insert ON public.derived_metrics;
-- DROP POLICY IF EXISTS derived_service_update ON public.derived_metrics;
-- DROP POLICY IF EXISTS meas_state_member ON public.measurement_states;
-- DROP POLICY IF EXISTS meas_state_pro ON public.measurement_states;
-- DROP POLICY IF EXISTS meas_state_service_insert ON public.measurement_states;
-- DROP POLICY IF EXISTS meas_state_service_update ON public.measurement_states;
-- DROP POLICY IF EXISTS verif_pro_read ON public.verification_queue;
-- DROP POLICY IF EXISTS verif_pro_update ON public.verification_queue;
-- DROP POLICY IF EXISTS verif_service_insert ON public.verification_queue;
-- DROP POLICY IF EXISTS decisions_pro_all ON public.coaching_decisions;
-- DROP POLICY IF EXISTS decisions_member_read ON public.coaching_decisions;
-- DROP POLICY IF EXISTS deltas_pro_read ON public.edit_deltas;
-- DROP POLICY IF EXISTS deltas_service_insert ON public.edit_deltas;
-- DROP POLICY IF EXISTS graph_read_all ON public.causal_graph_edges;
-- DROP POLICY IF EXISTS graph_service_insert ON public.causal_graph_edges;
-- DROP POLICY IF EXISTS graph_service_update ON public.causal_graph_edges;
-- DROP POLICY IF EXISTS cache_pro_all ON public.voice_memo_cache;
-- DROP POLICY IF EXISTS state_log_pro_read ON public.voice_memo_state_log;
-- DROP POLICY IF EXISTS state_log_trigger_insert ON public.voice_memo_state_log;
-- ALTER TABLE public.raw_measurements DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE public.derived_metrics DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE public.coaching_decisions DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE public.edit_deltas DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE public.causal_graph_edges DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE public.measurement_states DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE public.verification_queue DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE public.voice_memo_cache DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE public.voice_memo_state_log DISABLE ROW LEVEL SECURITY;

-- === 018_patent_hotfix.sql ===
/**
 * Migration 018: Patent Schema Hotfix
 *
 * 통합 검증에서 발견된 이슈 수정:
 * 1. 015 verification_queue.reviewer_id — ON DELETE SET NULL 추가
 * 2. 016 voice_memo_cache.target_id — ON DELETE SET NULL 추가
 * 3. 015 verification_queue — measurement_state_id 인덱스 추가
 * 4. 014 measurement_states — updated_at 자동 트리거 추가
 *
 * Dependencies: 015, 016, 014
 */

-- ============================================================
-- 1. verification_queue.reviewer_id: ON DELETE SET NULL 추가
--    (프로 프로필 삭제 시 reviewer_id를 NULL로 → 고아 큐 방지)
-- ============================================================
ALTER TABLE public.verification_queue
    DROP CONSTRAINT IF EXISTS verification_queue_reviewer_id_fkey;

ALTER TABLE public.verification_queue
    ADD CONSTRAINT verification_queue_reviewer_id_fkey
    FOREIGN KEY (reviewer_id) REFERENCES public.pro_profiles(id)
    ON DELETE SET NULL;

-- ============================================================
-- 2. voice_memo_cache.target_id: ON DELETE SET NULL 추가
--    (회원 프로필 삭제 시 target_id를 NULL로 → DC-5 FSM 상태는 유지)
-- ============================================================
ALTER TABLE public.voice_memo_cache
    DROP CONSTRAINT IF EXISTS voice_memo_cache_target_id_fkey;

ALTER TABLE public.voice_memo_cache
    ADD CONSTRAINT voice_memo_cache_target_id_fkey
    FOREIGN KEY (target_id) REFERENCES public.member_profiles(id)
    ON DELETE SET NULL;

-- ============================================================
-- 3. verification_queue: measurement_state_id FK 인덱스 추가
--    (RLS 정책의 JOIN 성능 개선)
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_verif_measurement_state
    ON public.verification_queue(measurement_state_id);

-- ============================================================
-- 4. measurement_states: updated_at 컬럼 + 자동 트리거 추가
--    (상태 전이 시각 자동 기록)
-- ============================================================
ALTER TABLE public.measurement_states
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

CREATE TRIGGER set_measurement_states_updated_at
    BEFORE UPDATE ON public.measurement_states
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- ROLLBACK:
-- DROP TRIGGER IF EXISTS set_measurement_states_updated_at ON public.measurement_states;
-- ALTER TABLE public.measurement_states DROP COLUMN IF EXISTS updated_at;
-- DROP INDEX IF EXISTS idx_verif_measurement_state;
-- ALTER TABLE public.voice_memo_cache DROP CONSTRAINT IF EXISTS voice_memo_cache_target_id_fkey;
-- ALTER TABLE public.voice_memo_cache ADD CONSTRAINT voice_memo_cache_target_id_fkey FOREIGN KEY (target_id) REFERENCES public.member_profiles(id);
-- ALTER TABLE public.verification_queue DROP CONSTRAINT IF EXISTS verification_queue_reviewer_id_fkey;
-- ALTER TABLE public.verification_queue ADD CONSTRAINT verification_queue_reviewer_id_fkey FOREIGN KEY (reviewer_id) REFERENCES public.pro_profiles(id);

SELECT 'Part 2 complete: Patent tables created' AS status;
