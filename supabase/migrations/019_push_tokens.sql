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
