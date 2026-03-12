/**
 * Migration 001: Users and Profiles
 *
 * Creates the core user profile tables that extend Supabase Auth.
 * - pro_profiles: Golf professionals (coaches)
 * - member_profiles: Golf members (students)
 * - pro_member_links: Relationship mapping between pros and members
 *
 * Dependencies: auth.users (Supabase Auth built-in)
 */

-- ==========================================
-- Pro Profiles
-- ==========================================
CREATE TABLE public.pro_profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
    display_name TEXT NOT NULL,
    studio_name TEXT,
    specialty TEXT,
    tier TEXT NOT NULL DEFAULT 'starter'
        CHECK (tier IN ('starter', 'pro', 'academy')),
    plg_coupons_remaining INT NOT NULL DEFAULT 3
        CHECK (plg_coupons_remaining >= 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.pro_profiles IS 'Golf professional profiles extending auth.users';
COMMENT ON COLUMN public.pro_profiles.tier IS 'Subscription tier: starter (free), pro, academy';
COMMENT ON COLUMN public.pro_profiles.plg_coupons_remaining IS 'PLG coupon allocation remaining (starts at 3)';

CREATE INDEX idx_pro_profiles_user ON public.pro_profiles(user_id);

-- ==========================================
-- Member Profiles
-- ==========================================
CREATE TABLE public.member_profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
    display_name TEXT NOT NULL,
    is_premium BOOLEAN NOT NULL DEFAULT false,
    premium_expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.member_profiles IS 'Golf member profiles extending auth.users';
COMMENT ON COLUMN public.member_profiles.is_premium IS 'Whether member has active premium status via coupon';

CREATE INDEX idx_member_profiles_user ON public.member_profiles(user_id);

-- ==========================================
-- Pro-Member Links (Coaching Relationships)
-- ==========================================
CREATE TABLE public.pro_member_links (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pro_id UUID NOT NULL REFERENCES public.pro_profiles(id) ON DELETE CASCADE,
    member_id UUID REFERENCES public.member_profiles(id) ON DELETE SET NULL,
    invite_code TEXT NOT NULL UNIQUE,
    status TEXT NOT NULL DEFAULT 'invited'
        CHECK (status IN ('invited', 'active', 'removed')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.pro_member_links IS 'Coaching relationships between pros and members';
COMMENT ON COLUMN public.pro_member_links.invite_code IS 'Unique invitation code for member onboarding';

CREATE INDEX idx_links_pro_active ON public.pro_member_links(pro_id)
    WHERE status = 'active';
CREATE INDEX idx_links_member_active ON public.pro_member_links(member_id)
    WHERE status = 'active';
CREATE INDEX idx_links_invite_code ON public.pro_member_links(invite_code);

-- ==========================================
-- Auto-update updated_at trigger
-- ==========================================
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_pro_profiles_updated_at
    BEFORE UPDATE ON public.pro_profiles
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER set_member_profiles_updated_at
    BEFORE UPDATE ON public.member_profiles
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER set_pro_member_links_updated_at
    BEFORE UPDATE ON public.pro_member_links
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- ==========================================
-- Auto-create profile on user signup
-- ==========================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
    user_role TEXT;
BEGIN
    user_role := COALESCE(NEW.raw_user_meta_data->>'role', 'member');

    IF user_role = 'pro' THEN
        INSERT INTO public.pro_profiles (user_id, display_name)
        VALUES (
            NEW.id,
            COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1))
        );
    ELSE
        INSERT INTO public.member_profiles (user_id, display_name)
        VALUES (
            NEW.id,
            COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1))
        );
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ROLLBACK:
-- DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
-- DROP FUNCTION IF EXISTS public.handle_new_user();
-- DROP TRIGGER IF EXISTS set_pro_member_links_updated_at ON public.pro_member_links;
-- DROP TRIGGER IF EXISTS set_member_profiles_updated_at ON public.member_profiles;
-- DROP TRIGGER IF EXISTS set_pro_profiles_updated_at ON public.pro_profiles;
-- DROP FUNCTION IF EXISTS public.handle_updated_at();
-- DROP TABLE IF EXISTS public.pro_member_links;
-- DROP TABLE IF EXISTS public.member_profiles;
-- DROP TABLE IF EXISTS public.pro_profiles;
