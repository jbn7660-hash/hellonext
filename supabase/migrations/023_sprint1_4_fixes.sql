/**
 * Migration 022: Sprint 1-4 E2E Fixes
 *
 * 1. member_profiles에 누락된 컬럼 추가 (avatar_url, handicap, golf_experience_months)
 * 2. pro_member_links에 member UPDATE 정책 추가 (초대 수락 시 필요)
 *
 * Dependencies: 001_users_and_profiles, 008_rls_policies
 */

-- ==========================================
-- 1. member_profiles 누락 컬럼 추가
-- ==========================================
ALTER TABLE public.member_profiles
    ADD COLUMN IF NOT EXISTS avatar_url TEXT,
    ADD COLUMN IF NOT EXISTS handicap INTEGER,
    ADD COLUMN IF NOT EXISTS golf_experience_months INTEGER;

COMMENT ON COLUMN public.member_profiles.avatar_url IS 'Profile avatar image URL';
COMMENT ON COLUMN public.member_profiles.handicap IS 'Golf handicap (0-54)';
COMMENT ON COLUMN public.member_profiles.golf_experience_months IS 'Total months of golf experience';

-- ==========================================
-- 2. pro_member_links: member UPDATE 정책
--    초대 수락 시 member가 자신의 link를 active로 변경할 수 있어야 함
-- ==========================================
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE tablename = 'pro_member_links'
        AND policyname = 'links_member_update'
    ) THEN
        CREATE POLICY links_member_update ON public.pro_member_links
            FOR UPDATE
            USING (member_id = public.get_my_member_id())
            WITH CHECK (member_id = public.get_my_member_id());
    END IF;
END $$;

-- ROLLBACK:
-- DROP POLICY IF EXISTS links_member_update ON public.pro_member_links;
-- ALTER TABLE public.member_profiles DROP COLUMN IF EXISTS golf_experience_months;
-- ALTER TABLE public.member_profiles DROP COLUMN IF EXISTS handicap;
-- ALTER TABLE public.member_profiles DROP COLUMN IF EXISTS avatar_url;
