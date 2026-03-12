/**
 * Migration 007: Master Data (Error Patterns + Glossary)
 *
 * Reference tables for golf swing error taxonomy and pro-specific terminology.
 * - error_patterns: 22 standard golf swing error classifications (P1-P8 positions)
 * - glossary_terms: Pro-customized terminology mapping
 *
 * Dependencies: 001 (pro_profiles)
 */

-- ==========================================
-- Error Patterns (Master Data)
-- ==========================================
CREATE TABLE public.error_patterns (
    id SERIAL PRIMARY KEY,
    code TEXT NOT NULL UNIQUE,
    name_ko TEXT NOT NULL,
    name_en TEXT NOT NULL,
    description TEXT,
    position TEXT NOT NULL
        CHECK (position ~ '^P[1-8]$'),
    causality_parents JSONB DEFAULT '[]'
);

COMMENT ON TABLE public.error_patterns IS '22 standard golf swing error patterns mapped to P1-P8 positions';

-- ==========================================
-- Seed: 22 Error Patterns
-- ==========================================
INSERT INTO public.error_patterns (code, name_ko, name_en, description, position, causality_parents) VALUES
    ('EP-001', '그립 압력 과다', 'Excessive Grip Pressure', '그립을 너무 세게 잡아 손목 유연성이 감소하는 패턴', 'P1', '[]'),
    ('EP-002', '얼라인먼트 미스', 'Alignment Error', '타겟 라인 대비 어깨/발/힙 정렬 오류', 'P1', '[]'),
    ('EP-003', '과도한 어드레스 전경', 'Excessive Forward Tilt', '어드레스 시 상체가 너무 앞으로 기울어진 상태', 'P1', '[]'),
    ('EP-004', '테이크어웨이 인사이드', 'Inside Takeaway', '백스윙 시작 시 클럽이 과도하게 안쪽으로 빠지는 패턴', 'P2', '["EP-001"]'),
    ('EP-005', '테이크어웨이 아웃사이드', 'Outside Takeaway', '백스윙 시작 시 클럽이 과도하게 바깥으로 나가는 패턴', 'P2', '["EP-001"]'),
    ('EP-006', '얼리 힌지', 'Early Wrist Hinge', '테이크어웨이 초기에 손목이 너무 일찍 꺾이는 패턴', 'P2', '["EP-001"]'),
    ('EP-007', '오버 로테이션', 'Over Rotation', '백스윙 탑에서 어깨 회전이 과도한 패턴', 'P3', '["EP-004"]'),
    ('EP-008', '리버스 피봇', 'Reverse Pivot', '백스윙 시 체중이 왼발(오른손잡이)에 남는 패턴', 'P3', '["EP-003"]'),
    ('EP-009', '크로싱 라인', 'Crossing the Line', '백스윙 탑에서 클럽이 타겟 라인을 넘어가는 패턴', 'P3', '["EP-004", "EP-007"]'),
    ('EP-010', '플라잉 엘보', 'Flying Elbow', '백스윙 탑에서 오른팔꿈치가 과도하게 벌어지는 패턴', 'P3', '[]'),
    ('EP-011', '캐스팅', 'Casting', '다운스윙 초기에 손목 각도가 풀리는 패턴 (얼리 릴리스)', 'P4', '["EP-006", "EP-010"]'),
    ('EP-012', '오버 더 탑', 'Over The Top', '다운스윙 시 클럽이 아웃→인 궤도로 내려오는 패턴', 'P4', '["EP-005", "EP-009"]'),
    ('EP-013', '힙 슬라이드', 'Hip Slide', '다운스윙 시 힙이 회전하지 않고 옆으로 밀리는 패턴', 'P4', '["EP-008"]'),
    ('EP-014', '행잉 백', 'Hanging Back', '임팩트 시 체중이 뒷발에 남는 패턴', 'P5', '["EP-008", "EP-013"]'),
    ('EP-015', '얼리 익스텐션', 'Early Extension', '임팩트 시 골반이 볼 쪽으로 밀리는 패턴', 'P5', '["EP-003"]'),
    ('EP-016', '치킨 윙', 'Chicken Wing', '임팩트/팔로스루에서 왼팔이 접히는 패턴', 'P6', '["EP-015"]'),
    ('EP-017', '플립', 'Flip', '임팩트 직후 손목이 뒤집히는 패턴', 'P6', '["EP-011", "EP-014"]'),
    ('EP-018', '불완전 팔로스루', 'Incomplete Follow Through', '팔로스루가 축소되어 에너지 전달이 부족한 패턴', 'P7', '["EP-016"]'),
    ('EP-019', '리버스 C 피니시', 'Reverse C Finish', '피니시에서 허리가 과도하게 꺾이는 패턴', 'P8', '["EP-015"]'),
    ('EP-020', '불균형 피니시', 'Unbalanced Finish', '피니시에서 균형을 잃는 패턴', 'P8', '["EP-013", "EP-014"]'),
    ('EP-021', '템포 불균형', 'Tempo Imbalance', '백스윙:다운스윙 비율이 적정 범위(3:1)를 벗어난 패턴', 'P4', '[]'),
    ('EP-022', '그립 전환 오류', 'Grip Transition Error', '스윙 중 그립 위치가 변하는 패턴', 'P4', '["EP-001"]');

-- ==========================================
-- Glossary Terms (Pro-specific terminology)
-- ==========================================
CREATE TABLE public.glossary_terms (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pro_id UUID NOT NULL REFERENCES public.pro_profiles(id) ON DELETE CASCADE,
    original_term TEXT NOT NULL,
    standardized_term TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(pro_id, original_term)
);

COMMENT ON TABLE public.glossary_terms IS 'Pro-customized term mapping for AI transcript normalization';

CREATE INDEX idx_glossary_pro ON public.glossary_terms(pro_id);

-- ROLLBACK:
-- DROP TABLE IF EXISTS public.glossary_terms;
-- DELETE FROM public.error_patterns;
-- DROP TABLE IF EXISTS public.error_patterns;
