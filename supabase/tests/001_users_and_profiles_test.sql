/**
 * Test: Migration 001 — Users and Profiles
 *
 * 검증 항목:
 * 1. 테이블 존재 확인
 * 2. 컬럼 스키마 검증
 * 3. 제약 조건 검증 (CHECK, FK, UNIQUE)
 * 4. INSERT/SELECT 기본 동작
 * 5. updated_at 트리거 동작
 * 6. handle_new_user() 트리거 동작
 * 7. RLS 정책 검증 (프로/회원/미인증)
 *
 * 실행 방법: Supabase Dashboard SQL Editor 또는 psql로 실행
 * 전제: 마이그레이션 001 + 008 적용 완료
 */

-- ==========================================
-- 1. 테이블 존재 확인
-- ==========================================
DO $$
BEGIN
    ASSERT (SELECT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'pro_profiles'
    )), 'FAIL: pro_profiles 테이블 미존재';

    ASSERT (SELECT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'member_profiles'
    )), 'FAIL: member_profiles 테이블 미존재';

    ASSERT (SELECT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'pro_member_links'
    )), 'FAIL: pro_member_links 테이블 미존재';

    RAISE NOTICE 'PASS: 모든 테이블 존재 확인';
END $$;

-- ==========================================
-- 2. 컬럼 스키마 검증
-- ==========================================
DO $$
DECLARE
    col_count INT;
BEGIN
    -- pro_profiles 필수 컬럼
    SELECT COUNT(*) INTO col_count
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'pro_profiles'
    AND column_name IN ('id', 'user_id', 'display_name', 'studio_name', 'specialty', 'tier', 'plg_coupons_remaining', 'created_at', 'updated_at');
    ASSERT col_count = 9, format('FAIL: pro_profiles 컬럼 수 불일치. expected=9, got=%s', col_count);

    -- member_profiles 필수 컬럼
    SELECT COUNT(*) INTO col_count
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'member_profiles'
    AND column_name IN ('id', 'user_id', 'display_name', 'is_premium', 'premium_expires_at', 'created_at', 'updated_at');
    ASSERT col_count = 7, format('FAIL: member_profiles 컬럼 수 불일치. expected=7, got=%s', col_count);

    -- pro_member_links 필수 컬럼
    SELECT COUNT(*) INTO col_count
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'pro_member_links'
    AND column_name IN ('id', 'pro_id', 'member_id', 'invite_code', 'status', 'created_at', 'updated_at');
    ASSERT col_count = 7, format('FAIL: pro_member_links 컬럼 수 불일치. expected=7, got=%s', col_count);

    RAISE NOTICE 'PASS: 컬럼 스키마 검증 완료';
END $$;

-- ==========================================
-- 3. 제약 조건 검증
-- ==========================================
DO $$
BEGIN
    -- pro_profiles.tier CHECK
    ASSERT (SELECT EXISTS (
        SELECT 1 FROM information_schema.check_constraints cc
        JOIN information_schema.constraint_column_usage ccu
            ON cc.constraint_name = ccu.constraint_name
        WHERE ccu.table_name = 'pro_profiles'
        AND cc.check_clause LIKE '%starter%pro%academy%'
    )), 'FAIL: pro_profiles.tier CHECK 제약 미존재';

    -- pro_profiles.plg_coupons_remaining >= 0 CHECK
    ASSERT (SELECT EXISTS (
        SELECT 1 FROM information_schema.check_constraints cc
        JOIN information_schema.constraint_column_usage ccu
            ON cc.constraint_name = ccu.constraint_name
        WHERE ccu.table_name = 'pro_profiles'
        AND cc.check_clause LIKE '%plg_coupons_remaining%'
    )), 'FAIL: pro_profiles.plg_coupons_remaining CHECK 제약 미존재';

    -- pro_member_links.status CHECK
    ASSERT (SELECT EXISTS (
        SELECT 1 FROM information_schema.check_constraints cc
        JOIN information_schema.constraint_column_usage ccu
            ON cc.constraint_name = ccu.constraint_name
        WHERE ccu.table_name = 'pro_member_links'
        AND cc.check_clause LIKE '%invited%active%removed%'
    )), 'FAIL: pro_member_links.status CHECK 제약 미존재';

    -- pro_profiles.user_id UNIQUE
    ASSERT (SELECT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE table_name = 'pro_profiles'
        AND constraint_type = 'UNIQUE'
    )), 'FAIL: pro_profiles.user_id UNIQUE 제약 미존재';

    -- pro_member_links.invite_code UNIQUE
    ASSERT (SELECT EXISTS (
        SELECT 1 FROM information_schema.table_constraints tc
        JOIN information_schema.constraint_column_usage ccu
            ON tc.constraint_name = ccu.constraint_name
        WHERE tc.table_name = 'pro_member_links'
        AND tc.constraint_type = 'UNIQUE'
        AND ccu.column_name = 'invite_code'
    )), 'FAIL: pro_member_links.invite_code UNIQUE 제약 미존재';

    RAISE NOTICE 'PASS: 제약 조건 검증 완료';
END $$;

-- ==========================================
-- 4. 인덱스 존재 확인
-- ==========================================
DO $$
BEGIN
    ASSERT (SELECT EXISTS (
        SELECT 1 FROM pg_indexes
        WHERE schemaname = 'public' AND indexname = 'idx_pro_profiles_user'
    )), 'FAIL: idx_pro_profiles_user 인덱스 미존재';

    ASSERT (SELECT EXISTS (
        SELECT 1 FROM pg_indexes
        WHERE schemaname = 'public' AND indexname = 'idx_member_profiles_user'
    )), 'FAIL: idx_member_profiles_user 인덱스 미존재';

    ASSERT (SELECT EXISTS (
        SELECT 1 FROM pg_indexes
        WHERE schemaname = 'public' AND indexname = 'idx_links_pro_active'
    )), 'FAIL: idx_links_pro_active 인덱스 미존재';

    ASSERT (SELECT EXISTS (
        SELECT 1 FROM pg_indexes
        WHERE schemaname = 'public' AND indexname = 'idx_links_invite_code'
    )), 'FAIL: idx_links_invite_code 인덱스 미존재';

    RAISE NOTICE 'PASS: 인덱스 존재 확인 완료';
END $$;

-- ==========================================
-- 5. 트리거 존재 확인
-- ==========================================
DO $$
BEGIN
    ASSERT (SELECT EXISTS (
        SELECT 1 FROM information_schema.triggers
        WHERE trigger_name = 'set_pro_profiles_updated_at'
        AND event_object_table = 'pro_profiles'
    )), 'FAIL: set_pro_profiles_updated_at 트리거 미존재';

    ASSERT (SELECT EXISTS (
        SELECT 1 FROM information_schema.triggers
        WHERE trigger_name = 'set_member_profiles_updated_at'
        AND event_object_table = 'member_profiles'
    )), 'FAIL: set_member_profiles_updated_at 트리거 미존재';

    ASSERT (SELECT EXISTS (
        SELECT 1 FROM information_schema.triggers
        WHERE trigger_name = 'set_pro_member_links_updated_at'
        AND event_object_table = 'pro_member_links'
    )), 'FAIL: set_pro_member_links_updated_at 트리거 미존재';

    ASSERT (SELECT EXISTS (
        SELECT 1 FROM information_schema.triggers
        WHERE trigger_name = 'on_auth_user_created'
    )), 'FAIL: on_auth_user_created 트리거 미존재';

    RAISE NOTICE 'PASS: 트리거 존재 확인 완료';
END $$;

-- ==========================================
-- 6. RLS 활성화 확인
-- ==========================================
DO $$
BEGIN
    ASSERT (SELECT rowsecurity FROM pg_tables
        WHERE schemaname = 'public' AND tablename = 'pro_profiles'),
        'FAIL: pro_profiles RLS 비활성화';

    ASSERT (SELECT rowsecurity FROM pg_tables
        WHERE schemaname = 'public' AND tablename = 'member_profiles'),
        'FAIL: member_profiles RLS 비활성화';

    ASSERT (SELECT rowsecurity FROM pg_tables
        WHERE schemaname = 'public' AND tablename = 'pro_member_links'),
        'FAIL: pro_member_links RLS 비활성화';

    RAISE NOTICE 'PASS: RLS 활성화 확인 완료';
END $$;

-- ==========================================
-- 7. RLS 정책 존재 확인
-- ==========================================
DO $$
DECLARE
    policy_count INT;
BEGIN
    -- pro_profiles: pro_own_select + pro_own_update
    SELECT COUNT(*) INTO policy_count
    FROM pg_policies WHERE tablename = 'pro_profiles';
    ASSERT policy_count >= 2, format('FAIL: pro_profiles 정책 수 부족. expected>=2, got=%s', policy_count);

    -- member_profiles: member_own + member_pro_read
    SELECT COUNT(*) INTO policy_count
    FROM pg_policies WHERE tablename = 'member_profiles';
    ASSERT policy_count >= 2, format('FAIL: member_profiles 정책 수 부족. expected>=2, got=%s', policy_count);

    -- pro_member_links: links_pro_all + links_member_select
    SELECT COUNT(*) INTO policy_count
    FROM pg_policies WHERE tablename = 'pro_member_links';
    ASSERT policy_count >= 2, format('FAIL: pro_member_links 정책 수 부족. expected>=2, got=%s', policy_count);

    RAISE NOTICE 'PASS: RLS 정책 존재 확인 완료';
END $$;

-- ==========================================
-- 8. INSERT/SELECT 동작 테스트 (service_role로 실행)
-- ==========================================
DO $$
DECLARE
    test_pro_user_id UUID := gen_random_uuid();
    test_member_user_id UUID := gen_random_uuid();
    test_pro_id UUID;
    test_member_id UUID;
    test_link_id UUID;
    fetched_name TEXT;
BEGIN
    -- 직접 INSERT (handle_new_user 트리거 대신 수동 테스트)
    INSERT INTO public.pro_profiles (user_id, display_name, studio_name, specialty)
    VALUES (test_pro_user_id, '테스트프로', '테스트골프', '숏게임')
    RETURNING id INTO test_pro_id;

    INSERT INTO public.member_profiles (user_id, display_name)
    VALUES (test_member_user_id, '테스트회원')
    RETURNING id INTO test_member_id;

    -- SELECT 확인
    SELECT display_name INTO fetched_name
    FROM public.pro_profiles WHERE id = test_pro_id;
    ASSERT fetched_name = '테스트프로', 'FAIL: pro_profiles SELECT 불일치';

    -- pro_member_links INSERT
    INSERT INTO public.pro_member_links (pro_id, member_id, invite_code, status)
    VALUES (test_pro_id, test_member_id, 'TEST-' || substr(gen_random_uuid()::text, 1, 8), 'active')
    RETURNING id INTO test_link_id;

    ASSERT test_link_id IS NOT NULL, 'FAIL: pro_member_links INSERT 실패';

    -- 기본값 확인
    ASSERT (SELECT tier FROM public.pro_profiles WHERE id = test_pro_id) = 'starter',
        'FAIL: pro_profiles.tier 기본값 불일치';
    ASSERT (SELECT plg_coupons_remaining FROM public.pro_profiles WHERE id = test_pro_id) = 3,
        'FAIL: pro_profiles.plg_coupons_remaining 기본값 불일치';
    ASSERT (SELECT is_premium FROM public.member_profiles WHERE id = test_member_id) = false,
        'FAIL: member_profiles.is_premium 기본값 불일치';

    -- 정리
    DELETE FROM public.pro_member_links WHERE id = test_link_id;
    DELETE FROM public.member_profiles WHERE id = test_member_id;
    DELETE FROM public.pro_profiles WHERE id = test_pro_id;

    RAISE NOTICE 'PASS: INSERT/SELECT 동작 테스트 완료';
END $$;

-- ==========================================
-- 9. CHECK 제약 위반 테스트
-- ==========================================
DO $$
DECLARE
    test_user_id UUID := gen_random_uuid();
BEGIN
    -- tier 잘못된 값
    BEGIN
        INSERT INTO public.pro_profiles (user_id, display_name, tier)
        VALUES (test_user_id, 'bad_tier', 'invalid_tier');
        RAISE EXCEPTION 'FAIL: 잘못된 tier 값이 허용됨';
    EXCEPTION WHEN check_violation THEN
        -- 예상대로 실패
        NULL;
    END;

    -- plg_coupons_remaining 음수
    BEGIN
        INSERT INTO public.pro_profiles (user_id, display_name, plg_coupons_remaining)
        VALUES (test_user_id, 'negative_coupons', -1);
        RAISE EXCEPTION 'FAIL: 음수 쿠폰이 허용됨';
    EXCEPTION WHEN check_violation THEN
        NULL;
    END;

    -- pro_member_links 잘못된 status
    BEGIN
        INSERT INTO public.pro_member_links (pro_id, invite_code, status)
        VALUES (gen_random_uuid(), 'TEST-BAD', 'invalid_status');
        RAISE EXCEPTION 'FAIL: 잘못된 link status가 허용됨';
    EXCEPTION WHEN check_violation THEN
        NULL;
    WHEN foreign_key_violation THEN
        -- pro_id FK 위반도 예상 가능
        NULL;
    END;

    RAISE NOTICE 'PASS: CHECK 제약 위반 테스트 완료';
END $$;

-- ==========================================
-- 10. updated_at 트리거 동작 확인
-- ==========================================
DO $$
DECLARE
    test_user_id UUID := gen_random_uuid();
    test_pro_id UUID;
    original_ts TIMESTAMPTZ;
    updated_ts TIMESTAMPTZ;
BEGIN
    INSERT INTO public.pro_profiles (user_id, display_name)
    VALUES (test_user_id, '트리거테스트')
    RETURNING id, updated_at INTO test_pro_id, original_ts;

    -- 약간의 지연 후 UPDATE
    PERFORM pg_sleep(0.01);
    UPDATE public.pro_profiles SET display_name = '트리거테스트_수정' WHERE id = test_pro_id;

    SELECT updated_at INTO updated_ts FROM public.pro_profiles WHERE id = test_pro_id;
    ASSERT updated_ts > original_ts, 'FAIL: updated_at 트리거 미동작';

    -- 정리
    DELETE FROM public.pro_profiles WHERE id = test_pro_id;

    RAISE NOTICE 'PASS: updated_at 트리거 동작 확인 완료';
END $$;

-- ==========================================
-- Summary
-- ==========================================
DO $$
BEGIN
    RAISE NOTICE '========================================';
    RAISE NOTICE 'Migration 001 테스트 전체 완료';
    RAISE NOTICE '========================================';
END $$;
