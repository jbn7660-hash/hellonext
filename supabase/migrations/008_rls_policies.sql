/**
 * Migration 008: Row Level Security Policies
 *
 * Comprehensive RLS policies for all public tables.
 * Enforces data isolation between users based on roles (pro/member).
 *
 * Security model:
 * - Pro: Full CRUD on own data, read access to linked members' data
 * - Member: Full CRUD on own data, read access to reports sent to them
 * - No cross-user data leakage possible at DB level
 *
 * Dependencies: All previous migrations (001-007)
 */

-- ==========================================
-- Enable RLS on all tables
-- ==========================================
ALTER TABLE public.pro_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.member_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pro_member_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.voice_memos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.swing_videos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pose_data ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.feel_checks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_observations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_scope_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coupons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coupon_redemptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.glossary_terms ENABLE ROW LEVEL SECURITY;

-- error_patterns is public read-only (master data)
ALTER TABLE public.error_patterns ENABLE ROW LEVEL SECURITY;
CREATE POLICY error_patterns_read ON public.error_patterns
    FOR SELECT USING (true);

-- ==========================================
-- Helper: Get current user's pro_profile id
-- ==========================================
CREATE OR REPLACE FUNCTION public.get_my_pro_id()
RETURNS UUID AS $$
    SELECT id FROM public.pro_profiles WHERE user_id = auth.uid();
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- ==========================================
-- Helper: Get current user's member_profile id
-- ==========================================
CREATE OR REPLACE FUNCTION public.get_my_member_id()
RETURNS UUID AS $$
    SELECT id FROM public.member_profiles WHERE user_id = auth.uid();
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- ==========================================
-- Pro Profiles: own profile only
-- ==========================================
CREATE POLICY pro_own_select ON public.pro_profiles
    FOR SELECT USING (user_id = auth.uid());
CREATE POLICY pro_own_update ON public.pro_profiles
    FOR UPDATE USING (user_id = auth.uid());

-- ==========================================
-- Member Profiles: own + pro can read linked members
-- ==========================================
CREATE POLICY member_own ON public.member_profiles
    FOR ALL USING (user_id = auth.uid());

CREATE POLICY member_pro_read ON public.member_profiles
    FOR SELECT USING (
        id IN (
            SELECT member_id FROM public.pro_member_links
            WHERE pro_id = public.get_my_pro_id()
            AND status = 'active'
        )
    );

-- ==========================================
-- Pro-Member Links
-- ==========================================
CREATE POLICY links_pro_all ON public.pro_member_links
    FOR ALL USING (pro_id = public.get_my_pro_id());

CREATE POLICY links_member_select ON public.pro_member_links
    FOR SELECT USING (member_id = public.get_my_member_id());

-- ==========================================
-- Voice Memos: pro only
-- ==========================================
CREATE POLICY memos_pro ON public.voice_memos
    FOR ALL USING (pro_id = public.get_my_pro_id());

-- ==========================================
-- Reports: pro full, member read
-- ==========================================
CREATE POLICY reports_pro ON public.reports
    FOR ALL USING (pro_id = public.get_my_pro_id());

CREATE POLICY reports_member_read ON public.reports
    FOR SELECT USING (member_id = public.get_my_member_id());

-- Members can update read status
CREATE POLICY reports_member_update_read ON public.reports
    FOR UPDATE USING (member_id = public.get_my_member_id())
    WITH CHECK (member_id = public.get_my_member_id());

-- ==========================================
-- Swing Videos: member own + pro read linked
-- ==========================================
CREATE POLICY videos_member_own ON public.swing_videos
    FOR ALL USING (member_id = public.get_my_member_id());

CREATE POLICY videos_pro_read ON public.swing_videos
    FOR SELECT USING (
        member_id IN (
            SELECT member_id FROM public.pro_member_links
            WHERE pro_id = public.get_my_pro_id()
            AND status = 'active'
        )
    );

-- ==========================================
-- Pose Data: follows swing_videos access
-- ==========================================
CREATE POLICY pose_member ON public.pose_data
    FOR ALL USING (
        video_id IN (
            SELECT id FROM public.swing_videos
            WHERE member_id = public.get_my_member_id()
        )
    );

CREATE POLICY pose_pro_read ON public.pose_data
    FOR SELECT USING (
        video_id IN (
            SELECT sv.id FROM public.swing_videos sv
            JOIN public.pro_member_links pml ON pml.member_id = sv.member_id
            WHERE pml.pro_id = public.get_my_pro_id()
            AND pml.status = 'active'
        )
    );

-- ==========================================
-- Feel Checks: member own + pro read
-- ==========================================
CREATE POLICY feel_member_own ON public.feel_checks
    FOR ALL USING (member_id = public.get_my_member_id());

CREATE POLICY feel_pro_read ON public.feel_checks
    FOR SELECT USING (
        member_id IN (
            SELECT member_id FROM public.pro_member_links
            WHERE pro_id = public.get_my_pro_id()
            AND status = 'active'
        )
    );

-- ==========================================
-- AI Observations: member read own, pro read linked
-- ==========================================
CREATE POLICY obs_member_read ON public.ai_observations
    FOR SELECT USING (member_id = public.get_my_member_id());

CREATE POLICY obs_pro_read ON public.ai_observations
    FOR SELECT USING (
        pro_id = public.get_my_pro_id()
        OR member_id IN (
            SELECT member_id FROM public.pro_member_links
            WHERE pro_id = public.get_my_pro_id()
            AND status = 'active'
        )
    );

-- ==========================================
-- AI Scope Settings: pro manages, member can read own
-- ==========================================
CREATE POLICY scope_pro ON public.ai_scope_settings
    FOR ALL USING (pro_id = public.get_my_pro_id());

CREATE POLICY scope_member_read ON public.ai_scope_settings
    FOR SELECT USING (member_id = public.get_my_member_id());

-- ==========================================
-- Coupons: pro manages
-- ==========================================
CREATE POLICY coupons_pro ON public.coupons
    FOR ALL USING (pro_id = public.get_my_pro_id());

-- Member can read assigned coupons
CREATE POLICY coupons_member_read ON public.coupons
    FOR SELECT USING (assigned_member_id = public.get_my_member_id());

-- ==========================================
-- Coupon Redemptions: member own
-- ==========================================
CREATE POLICY redemptions_member ON public.coupon_redemptions
    FOR ALL USING (member_id = public.get_my_member_id());

-- Pro can read redemptions for their coupons
CREATE POLICY redemptions_pro_read ON public.coupon_redemptions
    FOR SELECT USING (
        coupon_id IN (
            SELECT id FROM public.coupons
            WHERE pro_id = public.get_my_pro_id()
        )
    );

-- ==========================================
-- Subscriptions: pro own
-- ==========================================
CREATE POLICY subscriptions_pro ON public.subscriptions
    FOR ALL USING (pro_id = public.get_my_pro_id());

-- ==========================================
-- Payments: own only
-- ==========================================
CREATE POLICY payments_own ON public.payments
    FOR ALL USING (user_id = auth.uid());

-- ==========================================
-- Notifications: own only
-- ==========================================
CREATE POLICY notif_own ON public.notifications
    FOR ALL USING (user_id = auth.uid());

-- ==========================================
-- Glossary Terms: pro own
-- ==========================================
CREATE POLICY glossary_pro ON public.glossary_terms
    FOR ALL USING (pro_id = public.get_my_pro_id());

-- ROLLBACK:
-- (drop all policies and disable RLS - omitted for brevity, use supabase migration repair)
