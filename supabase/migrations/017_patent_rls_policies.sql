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
