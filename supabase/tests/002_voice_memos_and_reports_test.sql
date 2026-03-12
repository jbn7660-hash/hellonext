/**
 * Test: Migration 002 — Voice Memos and Reports
 *
 * 검증 항목:
 * 1. 테이블 존재 확인
 * 2. 컬럼 스키마 검증
 * 3. 제약 조건 (CHECK, FK)
 * 4. INSERT/SELECT 기본 동작
 * 5. RLS 정책 검증
 *
 * 전제: 마이그레이션 001 + 002 + 008 적용 완료
 */

-- ==========================================
-- 1. 테이블 존재 확인
-- ==========================================
DO $$
BEGIN
    ASSERT (SELECT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'voice_memos'
    )), 'FAIL: voice_memos 테이블 미존재';

    ASSERT (SELECT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'reports'
    )), 'FAIL: reports 테이블 미존재';

    RAISE NOTICE 'PASS: 테이블 존재 확인';
END $$;

-- ==========================================
-- 2. 컬럼 스키마 검증
-- ==========================================
DO $$
DECLARE
    col_count INT;
BEGIN
    -- voice_memos: 9 columns
    SELECT COUNT(*) INTO col_count
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'voice_memos'
    AND column_name IN ('id', 'pro_id', 'member_id', 'audio_url', 'duration_sec',
                        'transcript', 'structured_json', 'status', 'created_at', 'updated_at');
    ASSERT col_count = 10, format('FAIL: voice_memos 컬럼 수 불일치. expected=10, got=%s', col_count);

    -- reports: 12 columns
    SELECT COUNT(*) INTO col_count
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'reports'
    AND column_name IN ('id', 'voice_memo_id', 'pro_id', 'member_id', 'link_id',
                        'title', 'content', 'error_tags', 'homework', 'status',
                        'published_at', 'read_at', 'created_at', 'updated_at');
    ASSERT col_count = 14, format('FAIL: reports 컬럼 수 불일치. expected=14, got=%s', col_count);

    RAISE NOTICE 'PASS: 컬럼 스키마 검증 완료';
END $$;

-- ==========================================
-- 3. 제약 조건 검증
-- ==========================================
DO $$
BEGIN
    -- voice_memos.duration_sec CHECK (> 0 AND <= 120)
    ASSERT (SELECT EXISTS (
        SELECT 1 FROM information_schema.check_constraints cc
        JOIN information_schema.constraint_column_usage ccu
            ON cc.constraint_name = ccu.constraint_name
        WHERE ccu.table_name = 'voice_memos'
        AND cc.check_clause LIKE '%duration_sec%'
    )), 'FAIL: voice_memos.duration_sec CHECK 제약 미존재';

    -- voice_memos.status CHECK
    ASSERT (SELECT EXISTS (
        SELECT 1 FROM information_schema.check_constraints cc
        JOIN information_schema.constraint_column_usage ccu
            ON cc.constraint_name = ccu.constraint_name
        WHERE ccu.table_name = 'voice_memos'
        AND cc.check_clause LIKE '%recording%transcribing%'
    )), 'FAIL: voice_memos.status CHECK 제약 미존재';

    -- reports.status CHECK
    ASSERT (SELECT EXISTS (
        SELECT 1 FROM information_schema.check_constraints cc
        JOIN information_schema.constraint_column_usage ccu
            ON cc.constraint_name = ccu.constraint_name
        WHERE ccu.table_name = 'reports'
        AND cc.check_clause LIKE '%draft%published%read%'
    )), 'FAIL: reports.status CHECK 제약 미존재';

    RAISE NOTICE 'PASS: 제약 조건 검증 완료';
END $$;

-- ==========================================
-- 4. 인덱스 확인
-- ==========================================
DO $$
BEGIN
    ASSERT (SELECT EXISTS (
        SELECT 1 FROM pg_indexes
        WHERE schemaname = 'public' AND indexname = 'idx_memos_pro_created'
    )), 'FAIL: idx_memos_pro_created 인덱스 미존재';

    ASSERT (SELECT EXISTS (
        SELECT 1 FROM pg_indexes
        WHERE schemaname = 'public' AND indexname = 'idx_memos_orphan'
    )), 'FAIL: idx_memos_orphan 인덱스 미존재';

    ASSERT (SELECT EXISTS (
        SELECT 1 FROM pg_indexes
        WHERE schemaname = 'public' AND indexname = 'idx_reports_member_created'
    )), 'FAIL: idx_reports_member_created 인덱스 미존재';

    RAISE NOTICE 'PASS: 인덱스 확인 완료';
END $$;

-- ==========================================
-- 5. INSERT/SELECT + CHECK 위반 테스트
-- ==========================================
DO $$
DECLARE
    test_pro_user_id UUID := gen_random_uuid();
    test_member_user_id UUID := gen_random_uuid();
    test_pro_id UUID;
    test_member_id UUID;
    test_link_id UUID;
    test_memo_id UUID;
    test_report_id UUID;
BEGIN
    -- 사전 데이터: 프로 + 회원 + 링크
    INSERT INTO public.pro_profiles (user_id, display_name)
    VALUES (test_pro_user_id, '보이스테스트프로')
    RETURNING id INTO test_pro_id;

    INSERT INTO public.member_profiles (user_id, display_name)
    VALUES (test_member_user_id, '보이스테스트회원')
    RETURNING id INTO test_member_id;

    INSERT INTO public.pro_member_links (pro_id, member_id, invite_code, status)
    VALUES (test_pro_id, test_member_id, 'VOICE-' || substr(gen_random_uuid()::text, 1, 8), 'active')
    RETURNING id INTO test_link_id;

    -- voice_memos: 정상 INSERT (고아 메모)
    INSERT INTO public.voice_memos (pro_id, audio_url, duration_sec, status)
    VALUES (test_pro_id, 'https://storage.example.com/test.webm', 30, 'recording')
    RETURNING id INTO test_memo_id;
    ASSERT test_memo_id IS NOT NULL, 'FAIL: voice_memos INSERT 실패';

    -- voice_memos: duration_sec 범위 초과
    BEGIN
        INSERT INTO public.voice_memos (pro_id, audio_url, duration_sec)
        VALUES (test_pro_id, 'https://test.com/too_long.webm', 121);
        RAISE EXCEPTION 'FAIL: duration_sec > 120이 허용됨';
    EXCEPTION WHEN check_violation THEN
        NULL;
    END;

    -- voice_memos: duration_sec 0
    BEGIN
        INSERT INTO public.voice_memos (pro_id, audio_url, duration_sec)
        VALUES (test_pro_id, 'https://test.com/zero.webm', 0);
        RAISE EXCEPTION 'FAIL: duration_sec = 0이 허용됨';
    EXCEPTION WHEN check_violation THEN
        NULL;
    END;

    -- voice_memos: 잘못된 status
    BEGIN
        INSERT INTO public.voice_memos (pro_id, audio_url, duration_sec, status)
        VALUES (test_pro_id, 'https://test.com/bad.webm', 10, 'invalid');
        RAISE EXCEPTION 'FAIL: 잘못된 voice_memos status가 허용됨';
    EXCEPTION WHEN check_violation THEN
        NULL;
    END;

    -- reports: 정상 INSERT
    INSERT INTO public.reports (voice_memo_id, pro_id, member_id, link_id, title, content)
    VALUES (test_memo_id, test_pro_id, test_member_id, test_link_id, '테스트 리포트', '{"sections": []}')
    RETURNING id INTO test_report_id;
    ASSERT test_report_id IS NOT NULL, 'FAIL: reports INSERT 실패';

    -- reports 기본값 확인
    ASSERT (SELECT status FROM public.reports WHERE id = test_report_id) = 'draft',
        'FAIL: reports.status 기본값 불일치';
    ASSERT (SELECT error_tags FROM public.reports WHERE id = test_report_id) = '[]'::jsonb,
        'FAIL: reports.error_tags 기본값 불일치';

    -- 정리
    DELETE FROM public.reports WHERE id = test_report_id;
    DELETE FROM public.voice_memos WHERE id = test_memo_id;
    DELETE FROM public.pro_member_links WHERE id = test_link_id;
    DELETE FROM public.member_profiles WHERE id = test_member_id;
    DELETE FROM public.pro_profiles WHERE id = test_pro_id;

    RAISE NOTICE 'PASS: INSERT/SELECT + CHECK 위반 테스트 완료';
END $$;

-- ==========================================
-- 6. RLS 정책 존재 확인
-- ==========================================
DO $$
DECLARE
    policy_count INT;
BEGIN
    SELECT COUNT(*) INTO policy_count
    FROM pg_policies WHERE tablename = 'voice_memos';
    ASSERT policy_count >= 1, format('FAIL: voice_memos 정책 수 부족. got=%s', policy_count);

    SELECT COUNT(*) INTO policy_count
    FROM pg_policies WHERE tablename = 'reports';
    ASSERT policy_count >= 2, format('FAIL: reports 정책 수 부족. got=%s', policy_count);

    RAISE NOTICE 'PASS: RLS 정책 존재 확인 완료';
END $$;

-- ==========================================
-- 7. 트리거 확인
-- ==========================================
DO $$
BEGIN
    ASSERT (SELECT EXISTS (
        SELECT 1 FROM information_schema.triggers
        WHERE trigger_name = 'set_voice_memos_updated_at'
        AND event_object_table = 'voice_memos'
    )), 'FAIL: set_voice_memos_updated_at 트리거 미존재';

    ASSERT (SELECT EXISTS (
        SELECT 1 FROM information_schema.triggers
        WHERE trigger_name = 'set_reports_updated_at'
        AND event_object_table = 'reports'
    )), 'FAIL: set_reports_updated_at 트리거 미존재';

    RAISE NOTICE 'PASS: 트리거 확인 완료';
END $$;

-- ==========================================
-- Summary
-- ==========================================
DO $$
BEGIN
    RAISE NOTICE '========================================';
    RAISE NOTICE 'Migration 002 테스트 전체 완료';
    RAISE NOTICE '========================================';
END $$;
