/**
 * Test: Migration 003 — Swing Videos and Pose Data
 *
 * 검증 항목:
 * 1. 테이블 존재 확인
 * 2. 컬럼 스키마 검증
 * 3. 제약 조건 (CHECK, FK, UNIQUE)
 * 4. INSERT/SELECT + 1:1 관계 검증
 * 5. RLS 정책 검증
 *
 * 전제: 마이그레이션 001 + 003 + 008 적용 완료
 */

-- ==========================================
-- 1. 테이블 존재 확인
-- ==========================================
DO $$
BEGIN
    ASSERT (SELECT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'swing_videos'
    )), 'FAIL: swing_videos 테이블 미존재';

    ASSERT (SELECT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'pose_data'
    )), 'FAIL: pose_data 테이블 미존재';

    RAISE NOTICE 'PASS: 테이블 존재 확인';
END $$;

-- ==========================================
-- 2. 컬럼 스키마 검증
-- ==========================================
DO $$
DECLARE
    col_count INT;
BEGIN
    -- swing_videos: 7 columns
    SELECT COUNT(*) INTO col_count
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'swing_videos'
    AND column_name IN ('id', 'member_id', 'cloudinary_id', 'video_url',
                        'thumbnail_url', 'duration_sec', 'source', 'created_at');
    ASSERT col_count = 8, format('FAIL: swing_videos 컬럼 수 불일치. expected=8, got=%s', col_count);

    -- pose_data: 5 columns
    SELECT COUNT(*) INTO col_count
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'pose_data'
    AND column_name IN ('id', 'video_id', 'keypoints', 'angles', 'metrics', 'created_at');
    ASSERT col_count = 6, format('FAIL: pose_data 컬럼 수 불일치. expected=6, got=%s', col_count);

    RAISE NOTICE 'PASS: 컬럼 스키마 검증 완료';
END $$;

-- ==========================================
-- 3. 제약 조건 검증
-- ==========================================
DO $$
BEGIN
    -- swing_videos.duration_sec CHECK
    ASSERT (SELECT EXISTS (
        SELECT 1 FROM information_schema.check_constraints cc
        JOIN information_schema.constraint_column_usage ccu
            ON cc.constraint_name = ccu.constraint_name
        WHERE ccu.table_name = 'swing_videos'
        AND cc.check_clause LIKE '%duration_sec%'
    )), 'FAIL: swing_videos.duration_sec CHECK 제약 미존재';

    -- swing_videos.source CHECK
    ASSERT (SELECT EXISTS (
        SELECT 1 FROM information_schema.check_constraints cc
        JOIN information_schema.constraint_column_usage ccu
            ON cc.constraint_name = ccu.constraint_name
        WHERE ccu.table_name = 'swing_videos'
        AND cc.check_clause LIKE '%camera%gallery%simulator%'
    )), 'FAIL: swing_videos.source CHECK 제약 미존재';

    -- pose_data.video_id UNIQUE (1:1 관계)
    ASSERT (SELECT EXISTS (
        SELECT 1 FROM information_schema.table_constraints tc
        JOIN information_schema.constraint_column_usage ccu
            ON tc.constraint_name = ccu.constraint_name
        WHERE tc.table_name = 'pose_data'
        AND tc.constraint_type = 'UNIQUE'
        AND ccu.column_name = 'video_id'
    )), 'FAIL: pose_data.video_id UNIQUE 제약 미존재 (1:1 관계 파손)';

    RAISE NOTICE 'PASS: 제약 조건 검증 완료';
END $$;

-- ==========================================
-- 4. INSERT/SELECT + 1:1 관계 검증
-- ==========================================
DO $$
DECLARE
    test_member_user_id UUID := gen_random_uuid();
    test_member_id UUID;
    test_video_id UUID;
    test_pose_id UUID;
BEGIN
    -- 사전 데이터: 회원
    INSERT INTO public.member_profiles (user_id, display_name)
    VALUES (test_member_user_id, '스윙테스트회원')
    RETURNING id INTO test_member_id;

    -- swing_videos: 정상 INSERT
    INSERT INTO public.swing_videos (member_id, cloudinary_id, video_url, duration_sec, source)
    VALUES (test_member_id, 'test_cloud_id_123', 'https://res.cloudinary.com/test/video.mp4', 15, 'camera')
    RETURNING id INTO test_video_id;
    ASSERT test_video_id IS NOT NULL, 'FAIL: swing_videos INSERT 실패';

    -- 기본값 확인
    ASSERT (SELECT source FROM public.swing_videos WHERE id = test_video_id) = 'camera',
        'FAIL: swing_videos.source 기본값 불일치';

    -- pose_data: 정상 INSERT (1:1)
    INSERT INTO public.pose_data (video_id, keypoints, angles)
    VALUES (test_video_id,
        '{"frames": [{"P1": {"left_shoulder": [100, 200]}}]}',
        '{"P1": {"left_elbow": 90, "right_elbow": 85}}')
    RETURNING id INTO test_pose_id;
    ASSERT test_pose_id IS NOT NULL, 'FAIL: pose_data INSERT 실패';

    -- pose_data: 1:1 UNIQUE 위반 (같은 video_id로 두 번째 INSERT)
    BEGIN
        INSERT INTO public.pose_data (video_id, keypoints, angles)
        VALUES (test_video_id, '{"duplicate": true}', '{"duplicate": true}');
        RAISE EXCEPTION 'FAIL: pose_data 1:1 UNIQUE 제약 위반이 허용됨';
    EXCEPTION WHEN unique_violation THEN
        NULL;
    END;

    -- swing_videos: duration_sec 범위 초과
    BEGIN
        INSERT INTO public.swing_videos (member_id, cloudinary_id, video_url, duration_sec)
        VALUES (test_member_id, 'too_long', 'https://test.com/too_long.mp4', 61);
        RAISE EXCEPTION 'FAIL: duration_sec > 60이 허용됨';
    EXCEPTION WHEN check_violation THEN
        NULL;
    END;

    -- swing_videos: 잘못된 source
    BEGIN
        INSERT INTO public.swing_videos (member_id, cloudinary_id, video_url, source)
        VALUES (test_member_id, 'bad_src', 'https://test.com/bad.mp4', 'invalid_source');
        RAISE EXCEPTION 'FAIL: 잘못된 source가 허용됨';
    EXCEPTION WHEN check_violation THEN
        NULL;
    END;

    -- 정리
    DELETE FROM public.pose_data WHERE id = test_pose_id;
    DELETE FROM public.swing_videos WHERE id = test_video_id;
    DELETE FROM public.member_profiles WHERE id = test_member_id;

    RAISE NOTICE 'PASS: INSERT/SELECT + 1:1 관계 검증 완료';
END $$;

-- ==========================================
-- 5. RLS 정책 확인
-- ==========================================
DO $$
DECLARE
    policy_count INT;
BEGIN
    SELECT COUNT(*) INTO policy_count
    FROM pg_policies WHERE tablename = 'swing_videos';
    ASSERT policy_count >= 2, format('FAIL: swing_videos 정책 수 부족. got=%s', policy_count);

    SELECT COUNT(*) INTO policy_count
    FROM pg_policies WHERE tablename = 'pose_data';
    ASSERT policy_count >= 2, format('FAIL: pose_data 정책 수 부족. got=%s', policy_count);

    RAISE NOTICE 'PASS: RLS 정책 확인 완료';
END $$;

-- ==========================================
-- 6. 인덱스 확인
-- ==========================================
DO $$
BEGIN
    ASSERT (SELECT EXISTS (
        SELECT 1 FROM pg_indexes
        WHERE schemaname = 'public' AND indexname = 'idx_videos_member_created'
    )), 'FAIL: idx_videos_member_created 인덱스 미존재';

    RAISE NOTICE 'PASS: 인덱스 확인 완료';
END $$;

-- ==========================================
-- 7. FK CASCADE 동작 확인
-- ==========================================
DO $$
DECLARE
    test_member_user_id UUID := gen_random_uuid();
    test_member_id UUID;
    test_video_id UUID;
    pose_exists BOOLEAN;
BEGIN
    INSERT INTO public.member_profiles (user_id, display_name)
    VALUES (test_member_user_id, 'CASCADE테스트회원')
    RETURNING id INTO test_member_id;

    INSERT INTO public.swing_videos (member_id, cloudinary_id, video_url, duration_sec)
    VALUES (test_member_id, 'cascade_test', 'https://test.com/cascade.mp4', 10)
    RETURNING id INTO test_video_id;

    INSERT INTO public.pose_data (video_id, keypoints, angles)
    VALUES (test_video_id, '{"test": true}', '{"test": true}');

    -- swing_video 삭제 → pose_data CASCADE 삭제
    DELETE FROM public.swing_videos WHERE id = test_video_id;

    SELECT EXISTS (SELECT 1 FROM public.pose_data WHERE video_id = test_video_id) INTO pose_exists;
    ASSERT pose_exists = false, 'FAIL: swing_videos 삭제 시 pose_data CASCADE 미동작';

    -- 정리
    DELETE FROM public.member_profiles WHERE id = test_member_id;

    RAISE NOTICE 'PASS: FK CASCADE 동작 확인 완료';
END $$;

-- ==========================================
-- Summary
-- ==========================================
DO $$
BEGIN
    RAISE NOTICE '========================================';
    RAISE NOTICE 'Migration 003 테스트 전체 완료';
    RAISE NOTICE '========================================';
END $$;
