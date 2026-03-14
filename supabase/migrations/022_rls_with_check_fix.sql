/**
 * Migration 022: RLS WITH CHECK 보강
 *
 * C1 수정: FOR ALL USING(...) 정책에 WITH CHECK 누락된 케이스 추가
 * + pro_profiles INSERT 정책 추가 (프로 프로필 생성 허용)
 *
 * Dependencies: 008_rls_policies
 */

-- ==========================================
-- C1-a: pose_data — FOR ALL에 WITH CHECK 추가
-- ==========================================
-- 기존 정책 삭제 후 WITH CHECK 포함 재생성
DROP POLICY IF EXISTS pose_member ON public.pose_data;

CREATE POLICY pose_member ON public.pose_data
    FOR ALL
    USING (
        video_id IN (
            SELECT id FROM public.swing_videos
            WHERE member_id = public.get_my_member_id()
        )
    )
    WITH CHECK (
        video_id IN (
            SELECT id FROM public.swing_videos
            WHERE member_id = public.get_my_member_id()
        )
    );

-- ==========================================
-- pro_profiles INSERT 정책 추가
-- ==========================================
-- 기존: SELECT + UPDATE만 있어서 프로 프로필 생성 불가
-- 수정: 본인 user_id로만 INSERT 허용
CREATE POLICY pro_own_insert ON public.pro_profiles
    FOR INSERT
    WITH CHECK (user_id = auth.uid());

-- ==========================================
-- ROLLBACK:
-- ==========================================
-- DROP POLICY IF EXISTS pose_member ON public.pose_data;
-- CREATE POLICY pose_member ON public.pose_data
--     FOR ALL USING (video_id IN (SELECT id FROM public.swing_videos WHERE member_id = public.get_my_member_id()));
-- DROP POLICY IF EXISTS pro_own_insert ON public.pro_profiles;
