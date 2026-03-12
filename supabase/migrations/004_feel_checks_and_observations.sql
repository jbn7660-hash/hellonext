/**
 * Migration 004: Feel Checks and AI Observations
 *
 * Tables for member self-assessment and AI coaching feedback (F-005, F-013).
 * - feel_checks: Member's subjective feel rating per swing
 * - ai_observations: AI-generated coaching observations
 * - ai_scope_settings: Pro-configured AI behavior per member
 *
 * Dependencies: 001 (profiles), 003 (swing_videos)
 */

-- ==========================================
-- Feel Checks
-- ==========================================
CREATE TABLE public.feel_checks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    video_id UUID NOT NULL REFERENCES public.swing_videos(id) ON DELETE CASCADE,
    member_id UUID NOT NULL REFERENCES public.member_profiles(id),
    feeling TEXT NOT NULL
        CHECK (feeling IN ('good', 'unsure', 'off')),
    feel_accuracy FLOAT
        CHECK (feel_accuracy IS NULL OR (feel_accuracy >= 0 AND feel_accuracy <= 1)),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.feel_checks IS 'Member self-assessment before seeing AI analysis (principle 4)';
COMMENT ON COLUMN public.feel_checks.feel_accuracy IS 'Computed accuracy: how well feel matches AI analysis (0-1)';

CREATE INDEX idx_feel_checks_member ON public.feel_checks(member_id, created_at DESC);
CREATE INDEX idx_feel_checks_video ON public.feel_checks(video_id);

-- ==========================================
-- AI Observations
-- ==========================================
CREATE TABLE public.ai_observations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    video_id UUID NOT NULL REFERENCES public.swing_videos(id) ON DELETE CASCADE,
    member_id UUID NOT NULL REFERENCES public.member_profiles(id),
    pro_id UUID REFERENCES public.pro_profiles(id),
    observation_text TEXT NOT NULL,
    tone TEXT NOT NULL DEFAULT 'observe'
        CHECK (tone IN ('observe', 'suggest', 'guide')),
    coach_consultation_flag BOOLEAN NOT NULL DEFAULT false,
    visible_tags JSONB NOT NULL DEFAULT '[]',
    hidden_tags JSONB NOT NULL DEFAULT '[]',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.ai_observations IS 'AI-generated swing observations respecting pro scope settings';
COMMENT ON COLUMN public.ai_observations.tone IS 'Communication tone set by pro: observe/suggest/guide';
COMMENT ON COLUMN public.ai_observations.coach_consultation_flag IS 'True when AI detects issue outside visible scope';
COMMENT ON COLUMN public.ai_observations.visible_tags IS 'Error patterns visible to member';
COMMENT ON COLUMN public.ai_observations.hidden_tags IS 'Error patterns hidden from member (pro-only)';

CREATE INDEX idx_observations_member ON public.ai_observations(member_id, created_at DESC);
CREATE INDEX idx_observations_video ON public.ai_observations(video_id);

-- ==========================================
-- AI Scope Settings (Pro configures per member)
-- ==========================================
CREATE TABLE public.ai_scope_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pro_id UUID NOT NULL REFERENCES public.pro_profiles(id) ON DELETE CASCADE,
    member_id UUID NOT NULL REFERENCES public.member_profiles(id),
    visible_error_patterns JSONB NOT NULL DEFAULT '[]',
    ai_tone TEXT NOT NULL DEFAULT 'observe'
        CHECK (ai_tone IN ('observe', 'suggest', 'guide')),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(pro_id, member_id)
);

COMMENT ON TABLE public.ai_scope_settings IS 'Per-member AI behavior configuration set by their pro';

CREATE TRIGGER set_ai_scope_updated_at
    BEFORE UPDATE ON public.ai_scope_settings
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- ROLLBACK:
-- DROP TRIGGER IF EXISTS set_ai_scope_updated_at ON public.ai_scope_settings;
-- DROP TABLE IF EXISTS public.ai_scope_settings;
-- DROP TABLE IF EXISTS public.ai_observations;
-- DROP TABLE IF EXISTS public.feel_checks;
