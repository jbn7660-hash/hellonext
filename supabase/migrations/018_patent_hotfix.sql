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
