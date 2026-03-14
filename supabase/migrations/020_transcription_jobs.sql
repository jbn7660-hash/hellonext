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
  EXECUTE FUNCTION handle_updated_at();

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
