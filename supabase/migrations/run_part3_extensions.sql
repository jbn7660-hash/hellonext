-- ============================================================
-- HelloNext Migration Part 3: Extensions + Hotfix (019-021)
-- Supabase SQL Editor에서 실행 (Part 3 of 3)
-- ⚠️ Part 2 실행 완료 후 실행하세요
-- ============================================================

-- === 019_push_tokens.sql ===
-- ============================================================
-- Migration 019: Push Tokens Table
-- ============================================================
-- Stores Expo push tokens for mobile notifications.
-- Supports multiple devices per user.
-- ============================================================

CREATE TABLE IF NOT EXISTS push_tokens (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  token         TEXT NOT NULL,
  platform      TEXT NOT NULL CHECK (platform IN ('ios', 'android', 'web')),
  device_id     TEXT NOT NULL DEFAULT 'unknown',
  is_active     BOOLEAN DEFAULT true,
  created_at    TIMESTAMPTZ DEFAULT now(),
  updated_at    TIMESTAMPTZ DEFAULT now()
);

-- Unique constraint: one token per user+device
ALTER TABLE push_tokens
  ADD CONSTRAINT uq_push_tokens_user_device UNIQUE (user_id, device_id);

-- Index for fast lookup by user
CREATE INDEX idx_push_tokens_user_id ON push_tokens(user_id) WHERE is_active = true;

-- Index for token lookup (send notification)
CREATE INDEX idx_push_tokens_token ON push_tokens(token);

-- Updated_at trigger
CREATE OR REPLACE FUNCTION update_push_tokens_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_push_tokens_updated_at
  BEFORE UPDATE ON push_tokens
  FOR EACH ROW
  EXECUTE FUNCTION update_push_tokens_timestamp();

-- ============================================================
-- RLS Policies
-- ============================================================
ALTER TABLE push_tokens ENABLE ROW LEVEL SECURITY;

-- Users can only see/manage their own tokens
CREATE POLICY "push_tokens_select_own"
  ON push_tokens FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "push_tokens_insert_own"
  ON push_tokens FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "push_tokens_update_own"
  ON push_tokens FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "push_tokens_delete_own"
  ON push_tokens FOR DELETE
  USING (auth.uid() = user_id);

-- Service role can access all (for sending notifications)
CREATE POLICY "push_tokens_service_role"
  ON push_tokens FOR ALL
  USING (auth.role() = 'service_role');

COMMENT ON TABLE push_tokens IS 'Expo push notification tokens per user device';

-- === 020_transcription_jobs.sql ===
-- ============================================================
-- Migration 020: Transcription Jobs Table
-- ============================================================
-- Async transcription queue for voice memos.
-- Supports Patent 4 FSM: UNBOUND → PREPROCESSED transition.
-- ============================================================

CREATE TABLE IF NOT EXISTS transcription_jobs (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  voice_memo_id   UUID NOT NULL REFERENCES voice_memos(id) ON DELETE CASCADE,
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status          TEXT NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  audio_url       TEXT,
  audio_duration  INTEGER, -- milliseconds
  audio_format    TEXT DEFAULT 'm4a',

  -- Transcription result
  transcript      TEXT,
  confidence      NUMERIC(5,4) CHECK (confidence >= 0 AND confidence <= 1),
  language        TEXT DEFAULT 'ko',
  segments        JSONB DEFAULT '[]'::jsonb,

  -- Processing metadata
  provider        TEXT DEFAULT 'openai' CHECK (provider IN ('openai', 'google', 'whisper')),
  model           TEXT DEFAULT 'whisper-1',
  processing_ms   INTEGER, -- How long transcription took
  retry_count     INTEGER DEFAULT 0,
  error_message   TEXT,

  created_at      TIMESTAMPTZ DEFAULT now(),
  completed_at    TIMESTAMPTZ,
  updated_at      TIMESTAMPTZ DEFAULT now()
);

-- Indexes
CREATE INDEX idx_transcription_jobs_user ON transcription_jobs(user_id);
CREATE INDEX idx_transcription_jobs_status ON transcription_jobs(status) WHERE status IN ('pending', 'processing');
CREATE INDEX idx_transcription_jobs_memo ON transcription_jobs(voice_memo_id);

-- Updated_at trigger
CREATE TRIGGER trg_transcription_jobs_updated_at
  BEFORE UPDATE ON transcription_jobs
  FOR EACH ROW
  EXECUTE FUNCTION update_push_tokens_timestamp();

-- ============================================================
-- RLS Policies
-- ============================================================
ALTER TABLE transcription_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "transcription_jobs_select_own"
  ON transcription_jobs FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "transcription_jobs_insert_own"
  ON transcription_jobs FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "transcription_jobs_service_role"
  ON transcription_jobs FOR ALL
  USING (auth.role() = 'service_role');

COMMENT ON TABLE transcription_jobs IS 'Async voice memo transcription queue (Patent 4 FSM support)';

-- === 021_phase0_hotfix.sql ===
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


-- ============================================================
-- Verification
-- ============================================================
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public'
ORDER BY table_name;
