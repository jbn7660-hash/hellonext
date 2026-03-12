/**
 * Migration 002: Voice Memos and Reports
 *
 * Core tables for the voice-to-report pipeline (F-001).
 * - voice_memos: Pro's voice recordings with transcription status
 * - reports: Structured coaching reports generated from voice memos
 *
 * Dependencies: 001_users_and_profiles (pro_profiles, member_profiles, pro_member_links)
 */

-- ==========================================
-- Voice Memos
-- ==========================================
CREATE TABLE public.voice_memos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pro_id UUID NOT NULL REFERENCES public.pro_profiles(id) ON DELETE CASCADE,
    member_id UUID REFERENCES public.member_profiles(id),
    audio_url TEXT NOT NULL,
    duration_sec INT NOT NULL
        CHECK (duration_sec > 0 AND duration_sec <= 120),
    transcript TEXT,
    structured_json JSONB,
    status TEXT NOT NULL DEFAULT 'recording'
        CHECK (status IN ('recording', 'transcribing', 'structuring', 'draft', 'published')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.voice_memos IS 'Pro voice recordings for coaching reports (max 2min)';
COMMENT ON COLUMN public.voice_memos.member_id IS 'Null when memo is orphan (not yet assigned to member)';
COMMENT ON COLUMN public.voice_memos.structured_json IS 'AI-parsed structured data from transcript';

CREATE INDEX idx_memos_pro_created ON public.voice_memos(pro_id, created_at DESC);
CREATE INDEX idx_memos_orphan ON public.voice_memos(pro_id)
    WHERE member_id IS NULL AND status != 'published';
CREATE INDEX idx_memos_status ON public.voice_memos(status)
    WHERE status IN ('recording', 'transcribing', 'structuring');

-- ==========================================
-- Reports
-- ==========================================
CREATE TABLE public.reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    voice_memo_id UUID REFERENCES public.voice_memos(id),
    pro_id UUID NOT NULL REFERENCES public.pro_profiles(id) ON DELETE CASCADE,
    member_id UUID NOT NULL REFERENCES public.member_profiles(id),
    link_id UUID NOT NULL REFERENCES public.pro_member_links(id),
    title TEXT NOT NULL,
    content JSONB NOT NULL DEFAULT '{}',
    error_tags JSONB NOT NULL DEFAULT '[]',
    homework TEXT,
    status TEXT NOT NULL DEFAULT 'draft'
        CHECK (status IN ('draft', 'published', 'read')),
    published_at TIMESTAMPTZ,
    read_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.reports IS 'Coaching reports sent from pros to members';
COMMENT ON COLUMN public.reports.content IS 'Structured report content as JSON (sections, bullets, etc.)';
COMMENT ON COLUMN public.reports.error_tags IS 'Array of error pattern codes identified in session';

CREATE INDEX idx_reports_member_created ON public.reports(member_id, created_at DESC);
CREATE INDEX idx_reports_pro_created ON public.reports(pro_id, created_at DESC);
CREATE INDEX idx_reports_status ON public.reports(status)
    WHERE status = 'draft';

-- Triggers
CREATE TRIGGER set_voice_memos_updated_at
    BEFORE UPDATE ON public.voice_memos
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER set_reports_updated_at
    BEFORE UPDATE ON public.reports
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- ROLLBACK:
-- DROP TRIGGER IF EXISTS set_reports_updated_at ON public.reports;
-- DROP TRIGGER IF EXISTS set_voice_memos_updated_at ON public.voice_memos;
-- DROP TABLE IF EXISTS public.reports;
-- DROP TABLE IF EXISTS public.voice_memos;
