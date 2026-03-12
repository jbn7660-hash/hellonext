/**
 * Test: Migration 007 — Error Patterns and Glossary Terms
 *
 * 검증 항목:
 * 1. 테이블 존재 확인
 * 2. error_patterns 22개 시드 데이터 검증
 * 3. error_patterns 위치 코드 (P1-P8) 검증
 * 4. glossary_terms 구조 및 제약 조건 검증
 * 5. RLS 정책 확인
 *
 * 전제: 마이그레이션 001 + 007 + 008 적용 완료
 */

-- ==========================================
-- 1. 테이블 존재 확인
-- ==========================================
DO $$
BEGIN
    ASSERT (SELECT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'error_patterns'
    )), 'FAIL: error_patterns 테이블 미존재';

    ASSERT (SELECT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'glossary_terms'
    )), 'FAIL: glossary_terms 테이블 미존재';

    RAISE NOTICE 'PASS: 테이블 존재 확인';
END $$;

-- ==========================================
-- 2. error_patterns 시드 데이터 검증
-- ==========================================
DO $$
DECLARE
    ep_count INT;
    missing_codes TEXT[];
BEGIN
    SELECT COUNT(*) INTO ep_count FROM public.error_patterns;
    ASSERT ep_count = 22, format('FAIL: error_patterns 수 불일치. expected=22, got=%s', ep_count);

    -- EP-001 ~ EP-022 모두 존재하는지 확인
    SELECT array_agg(expected_code) INTO missing_codes
    FROM (
        SELECT 'EP-' || lpad(n::text, 3, '0') AS expected_code
        FROM generate_series(1, 22) n
    ) expected
    LEFT JOIN public.error_patterns ep ON ep.code = expected.expected_code
    WHERE ep.code IS NULL;

    ASSERT missing_codes IS NULL OR array_length(missing_codes, 1) IS NULL,
        format('FAIL: 누락된 에러 패턴 코드: %s', missing_codes::text);

    RAISE NOTICE 'PASS: error_patterns 22개 시드 데이터 검증 완료';
END $$;

-- ==========================================
-- 3. error_patterns 위치 코드 (P1-P8) 분포 검증
-- ==========================================
DO $$
DECLARE
    positions_used TEXT[];
    invalid_positions TEXT[];
BEGIN
    -- 사용된 위치 코드 확인
    SELECT array_agg(DISTINCT position ORDER BY position) INTO positions_used
    FROM public.error_patterns;

    RAISE NOTICE 'positions used: %', positions_used;

    -- 모든 position이 P1-P8 범위인지
    SELECT array_agg(position) INTO invalid_positions
    FROM public.error_patterns
    WHERE position !~ '^P[1-8]$';

    ASSERT invalid_positions IS NULL OR array_length(invalid_positions, 1) IS NULL,
        format('FAIL: 잘못된 position 값: %s', invalid_positions::text);

    -- P1, P2, P3, P4, P5, P6, P7, P8 최소 1개씩 존재
    ASSERT array_length(positions_used, 1) = 8,
        format('FAIL: P1-P8 중 누락 존재. 사용된 위치: %s', positions_used::text);

    RAISE NOTICE 'PASS: position P1-P8 분포 검증 완료';
END $$;

-- ==========================================
-- 4. error_patterns causality_parents JSON 무결성
-- ==========================================
DO $$
DECLARE
    r RECORD;
    parent_code TEXT;
    parent_exists BOOLEAN;
BEGIN
    FOR r IN
        SELECT code, causality_parents
        FROM public.error_patterns
        WHERE causality_parents != '[]'::jsonb
    LOOP
        FOR parent_code IN
            SELECT jsonb_array_elements_text(r.causality_parents)
        LOOP
            SELECT EXISTS (
                SELECT 1 FROM public.error_patterns WHERE code = parent_code
            ) INTO parent_exists;

            ASSERT parent_exists,
                format('FAIL: %s의 부모 %s가 error_patterns에 미존재', r.code, parent_code);
        END LOOP;
    END LOOP;

    RAISE NOTICE 'PASS: causality_parents 참조 무결성 검증 완료';
END $$;

-- ==========================================
-- 5. error_patterns.code UNIQUE 제약 확인
-- ==========================================
DO $$
BEGIN
    ASSERT (SELECT EXISTS (
        SELECT 1 FROM information_schema.table_constraints tc
        JOIN information_schema.constraint_column_usage ccu
            ON tc.constraint_name = ccu.constraint_name
        WHERE tc.table_name = 'error_patterns'
        AND tc.constraint_type = 'UNIQUE'
        AND ccu.column_name = 'code'
    )), 'FAIL: error_patterns.code UNIQUE 제약 미존재';

    -- 중복 code 시도
    BEGIN
        INSERT INTO public.error_patterns (code, name_ko, name_en, position)
        VALUES ('EP-001', '중복테스트', 'Duplicate Test', 'P1');
        RAISE EXCEPTION 'FAIL: 중복 code가 허용됨';
    EXCEPTION WHEN unique_violation THEN
        NULL;
    END;

    RAISE NOTICE 'PASS: code UNIQUE 제약 확인 완료';
END $$;

-- ==========================================
-- 6. glossary_terms 구조 + UNIQUE 제약 확인
-- ==========================================
DO $$
DECLARE
    test_pro_user_id UUID := gen_random_uuid();
    test_pro_id UUID;
    test_term_id UUID;
BEGIN
    INSERT INTO public.pro_profiles (user_id, display_name)
    VALUES (test_pro_user_id, '용어테스트프로')
    RETURNING id INTO test_pro_id;

    -- 정상 INSERT
    INSERT INTO public.glossary_terms (pro_id, original_term, standardized_term)
    VALUES (test_pro_id, '다운블로', '다운 블로우')
    RETURNING id INTO test_term_id;
    ASSERT test_term_id IS NOT NULL, 'FAIL: glossary_terms INSERT 실패';

    -- (pro_id, original_term) UNIQUE 제약 위반
    BEGIN
        INSERT INTO public.glossary_terms (pro_id, original_term, standardized_term)
        VALUES (test_pro_id, '다운블로', '다른 매핑');
        RAISE EXCEPTION 'FAIL: glossary_terms (pro_id, original_term) UNIQUE 위반이 허용됨';
    EXCEPTION WHEN unique_violation THEN
        NULL;
    END;

    -- 정리
    DELETE FROM public.glossary_terms WHERE id = test_term_id;
    DELETE FROM public.pro_profiles WHERE id = test_pro_id;

    RAISE NOTICE 'PASS: glossary_terms 구조 + UNIQUE 제약 확인 완료';
END $$;

-- ==========================================
-- 7. RLS 정책 확인
-- ==========================================
DO $$
DECLARE
    policy_count INT;
BEGIN
    -- error_patterns: 공개 읽기 정책 (모든 인증 사용자)
    SELECT COUNT(*) INTO policy_count
    FROM pg_policies WHERE tablename = 'error_patterns';
    ASSERT policy_count >= 1, format('FAIL: error_patterns 정책 수 부족. got=%s', policy_count);

    -- glossary_terms: 프로 전용
    SELECT COUNT(*) INTO policy_count
    FROM pg_policies WHERE tablename = 'glossary_terms';
    ASSERT policy_count >= 1, format('FAIL: glossary_terms 정책 수 부족. got=%s', policy_count);

    RAISE NOTICE 'PASS: RLS 정책 확인 완료';
END $$;

-- ==========================================
-- Summary
-- ==========================================
DO $$
BEGIN
    RAISE NOTICE '========================================';
    RAISE NOTICE 'Migration 007 테스트 전체 완료';
    RAISE NOTICE '========================================';
END $$;
