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
