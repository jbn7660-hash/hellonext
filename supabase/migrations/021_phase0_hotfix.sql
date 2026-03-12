/**
 * Migration 021: Phase 0 Hotfix
 *
 * Phase 0-2 코드 리뷰에서 발견된 CRITICAL/HIGH 이슈 수정.
 *
 * Fixes:
 *   C2: 016 FSM enforce_fsm_transition() NULL 안전 가드 추가
 *   C3: 020 transcription_jobs trigger — handle_updated_at() 사용으로 교체
 *   H1: nullable FK에 ON DELETE SET NULL 추가 (4건)
 *
 * Dependencies: 001, 002, 004, 005, 016, 019, 020
 */

-- ==========================================
-- C2: FSM enforce_fsm_transition NULL 안전 가드
-- ==========================================
-- 기존 함수에서 valid_transitions에 없는 상태로 OLD.state가 오면
-- allowed가 NULL이 되어 ANY(NULL)이 NULL → NOT NULL = NULL → IF 미진입 → 전이 허용 버그.
-- FINALIZED는 별도 처리되므로 실제 발생 가능성은 낮으나 방어적으로 수정.

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
    -- 상태 변경 없으면 통과
    IF OLD.state = NEW.state THEN
        RETURN NEW;
    END IF;

    -- FINALIZED는 종단 상태
    IF OLD.state = 'FINALIZED' THEN
        RAISE EXCEPTION 'DC-5 VIOLATION: Cannot transition from FINALIZED state';
    END IF;

    -- 허용된 전이 목록 조회
    SELECT array_agg(elem::text)
    INTO allowed
    FROM jsonb_array_elements_text(valid_transitions -> OLD.state) AS elem;

    -- NULL 안전 가드: 알 수 없는 상태에서의 전이 차단
    IF allowed IS NULL OR NOT (NEW.state = ANY(allowed)) THEN
        RAISE EXCEPTION 'DC-5 VIOLATION: Invalid transition from % to % (Patent 4 Claim 1)', OLD.state, NEW.state;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ==========================================
-- C3: transcription_jobs trigger 수정
-- ==========================================
-- update_push_tokens_timestamp() 대신 handle_updated_at() 사용 (결합도 제거)

DROP TRIGGER IF EXISTS trg_transcription_jobs_updated_at ON public.transcription_jobs;

CREATE TRIGGER trg_transcription_jobs_updated_at
    BEFORE UPDATE ON public.transcription_jobs
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_updated_at();

-- ==========================================
-- H1: Nullable FK에 ON DELETE SET NULL 추가 (4건)
-- ==========================================
-- 패턴: nullable FK는 참조 대상 삭제 시 SET NULL (고아 레코드 방지)

-- H1-a: voice_memos.member_id → member_profiles (nullable, orphan memo 허용)
ALTER TABLE public.voice_memos
    DROP CONSTRAINT IF EXISTS voice_memos_member_id_fkey;
ALTER TABLE public.voice_memos
    ADD CONSTRAINT voice_memos_member_id_fkey
    FOREIGN KEY (member_id) REFERENCES public.member_profiles(id)
    ON DELETE SET NULL;

-- H1-b: reports.voice_memo_id → voice_memos (nullable)
ALTER TABLE public.reports
    DROP CONSTRAINT IF EXISTS reports_voice_memo_id_fkey;
ALTER TABLE public.reports
    ADD CONSTRAINT reports_voice_memo_id_fkey
    FOREIGN KEY (voice_memo_id) REFERENCES public.voice_memos(id)
    ON DELETE SET NULL;

-- H1-c: ai_observations.pro_id → pro_profiles (nullable)
ALTER TABLE public.ai_observations
    DROP CONSTRAINT IF EXISTS ai_observations_pro_id_fkey;
ALTER TABLE public.ai_observations
    ADD CONSTRAINT ai_observations_pro_id_fkey
    FOREIGN KEY (pro_id) REFERENCES public.pro_profiles(id)
    ON DELETE SET NULL;

-- H1-d: coupons.assigned_member_id → member_profiles (nullable)
ALTER TABLE public.coupons
    DROP CONSTRAINT IF EXISTS coupons_assigned_member_id_fkey;
ALTER TABLE public.coupons
    ADD CONSTRAINT coupons_assigned_member_id_fkey
    FOREIGN KEY (assigned_member_id) REFERENCES public.member_profiles(id)
    ON DELETE SET NULL;

-- ==========================================
-- ROLLBACK:
-- ==========================================
-- -- C2: 원래 함수로 복원 (016_voice_memo_cache.sql의 원본)
-- -- C3:
-- DROP TRIGGER IF EXISTS trg_transcription_jobs_updated_at ON public.transcription_jobs;
-- CREATE TRIGGER trg_transcription_jobs_updated_at
--     BEFORE UPDATE ON public.transcription_jobs
--     FOR EACH ROW EXECUTE FUNCTION update_push_tokens_timestamp();
-- -- H1: 원래 FK로 복원 (ON DELETE RESTRICT = 기본값)
-- ALTER TABLE public.voice_memos DROP CONSTRAINT voice_memos_member_id_fkey;
-- ALTER TABLE public.voice_memos ADD CONSTRAINT voice_memos_member_id_fkey
--     FOREIGN KEY (member_id) REFERENCES public.member_profiles(id);
-- (나머지 동일 패턴)
