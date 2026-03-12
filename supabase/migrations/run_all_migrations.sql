-- ============================================================
-- HelloNext: 전체 마이그레이션 통합 스크립트
-- 생성일: 2026-03-12
-- 대상: Supabase SQL Editor에서 실행
-- 순서: 001 → 021 (21개 마이그레이션 순차 실행)
-- ============================================================
-- ⚠️ 이 스크립트는 빈 데이터베이스에서 1회만 실행하세요.
-- ⚠️ Supabase Dashboard → SQL Editor → 전체 붙여넣기 → Run
-- ============================================================


-- ===========================================================
-- Migration: 001_users_and_profiles.sql
-- ===========================================================
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


-- ===========================================================
-- Migration: 002_voice_memos_and_reports.sql
-- ===========================================================
/**
 * Migration 002: Voice Memos and Reports
 *
 * Core tables for the voice-to-report pipeline (F-001).
 * - voice_memos: Pro's voice recordings with transcription status
 * - reports: Structured coaching reports generated from voice memos
 *
 * Dependencies: 001_users_and_profiles (pro_profiles, member_profiles, pro_member_links)
 */

-- ==========================================
-- Voice Memos
-- ==========================================
CREATE TABLE public.voice_memos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pro_id UUID NOT NULL REFERENCES public.pro_profiles(id) ON DELETE CASCADE,
    member_id UUID REFERENCES public.member_profiles(id),
    audio_url TEXT NOT NULL,
    duration_sec INT NOT NULL
        CHECK (duration_sec > 0 AND duration_sec <= 120),
    transcript TEXT,
    structured_json JSONB,
    status TEXT NOT NULL DEFAULT 'recording'
        CHECK (status IN ('recording', 'transcribing', 'structuring', 'draft', 'published')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.voice_memos IS 'Pro voice recordings for coaching reports (max 2min)';
COMMENT ON COLUMN public.voice_memos.member_id IS 'Null when memo is orphan (not yet assigned to member)';
COMMENT ON COLUMN public.voice_memos.structured_json IS 'AI-parsed structured data from transcript';

CREATE INDEX idx_memos_pro_created ON public.voice_memos(pro_id, created_at DESC);
CREATE INDEX idx_memos_orphan ON public.voice_memos(pro_id)
    WHERE member_id IS NULL AND status != 'published';
CREATE INDEX idx_memos_status ON public.voice_memos(status)
    WHERE status IN ('recording', 'transcribing', 'structuring');

-- ==========================================
-- Reports
-- ==========================================
CREATE TABLE public.reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    voice_memo_id UUID REFERENCES public.voice_memos(id),
    pro_id UUID NOT NULL REFERENCES public.pro_profiles(id) ON DELETE CASCADE,
    member_id UUID NOT NULL REFERENCES public.member_profiles(id),
    link_id UUID NOT NULL REFERENCES public.pro_member_links(id),
    title TEXT NOT NULL,
    content JSONB NOT NULL DEFAULT '{}',
    error_tags JSONB NOT NULL DEFAULT '[]',
    homework TEXT,
    status TEXT NOT NULL DEFAULT 'draft'
        CHECK (status IN ('draft', 'published', 'read')),
    published_at TIMESTAMPTZ,
    read_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.reports IS 'Coaching reports sent from pros to members';
COMMENT ON COLUMN public.reports.content IS 'Structured report content as JSON (sections, bullets, etc.)';
COMMENT ON COLUMN public.reports.error_tags IS 'Array of error pattern codes identified in session';

CREATE INDEX idx_reports_member_created ON public.reports(member_id, created_at DESC);
CREATE INDEX idx_reports_pro_created ON public.reports(pro_id, created_at DESC);
CREATE INDEX idx_reports_status ON public.reports(status)
    WHERE status = 'draft';

-- Triggers
CREATE TRIGGER set_voice_memos_updated_at
    BEFORE UPDATE ON public.voice_memos
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER set_reports_updated_at
    BEFORE UPDATE ON public.reports
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- ROLLBACK:
-- DROP TRIGGER IF EXISTS set_reports_updated_at ON public.reports;
-- DROP TRIGGER IF EXISTS set_voice_memos_updated_at ON public.voice_memos;
-- DROP TABLE IF EXISTS public.reports;
-- DROP TABLE IF EXISTS public.voice_memos;


-- ===========================================================
-- Migration: 003_swing_videos_and_pose.sql
-- ===========================================================
/**
 * Migration 003: Swing Videos and Pose Data
 *
 * Tables for member swing recording and MediaPipe pose analysis (F-005).
 * - swing_videos: Uploaded swing recordings via Cloudinary
 * - pose_data: MediaPipe BlazePose analysis results per video
 *
 * Dependencies: 001_users_and_profiles (member_profiles)
 */

-- ==========================================
-- Swing Videos
-- ==========================================
CREATE TABLE public.swing_videos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    member_id UUID NOT NULL REFERENCES public.member_profiles(id) ON DELETE CASCADE,
    cloudinary_id TEXT NOT NULL,
    video_url TEXT NOT NULL,
    thumbnail_url TEXT,
    duration_sec INT
        CHECK (duration_sec IS NULL OR (duration_sec > 0 AND duration_sec <= 60)),
    source TEXT NOT NULL DEFAULT 'camera'
        CHECK (source IN ('camera', 'gallery', 'simulator')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.swing_videos IS 'Member swing recordings stored in Cloudinary (max 60s)';

CREATE INDEX idx_videos_member_created ON public.swing_videos(member_id, created_at DESC);

-- ==========================================
-- Pose Data (1:1 with swing_videos)
-- ==========================================
CREATE TABLE public.pose_data (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    video_id UUID NOT NULL UNIQUE REFERENCES public.swing_videos(id) ON DELETE CASCADE,
    keypoints JSONB NOT NULL,
    angles JSONB NOT NULL,
    metrics JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.pose_data IS 'MediaPipe BlazePose analysis results per swing video';
COMMENT ON COLUMN public.pose_data.keypoints IS '2D joint coordinates array per frame';
COMMENT ON COLUMN public.pose_data.angles IS 'Computed joint angles per swing position (P1-P8)';
COMMENT ON COLUMN public.pose_data.metrics IS 'Derived metrics (tempo, hip rotation, etc.)';

-- ROLLBACK:
-- DROP TABLE IF EXISTS public.pose_data;
-- DROP TABLE IF EXISTS public.swing_videos;


-- ===========================================================
-- Migration: 004_feel_checks_and_observations.sql
-- ===========================================================
/**
 * Migration 004: Feel Checks and AI Observations
 *
 * Tables for member self-assessment and AI coaching feedback (F-005, F-013).
 * - feel_checks: Member's subjective feel rating per swing
 * - ai_observations: AI-generated coaching observations
 * - ai_scope_settings: Pro-configured AI behavior per member
 *
 * Dependencies: 001 (profiles), 003 (swing_videos)
 */

-- ==========================================
-- Feel Checks
-- ==========================================
CREATE TABLE public.feel_checks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    video_id UUID NOT NULL REFERENCES public.swing_videos(id) ON DELETE CASCADE,
    member_id UUID NOT NULL REFERENCES public.member_profiles(id),
    feeling TEXT NOT NULL
        CHECK (feeling IN ('good', 'unsure', 'off')),
    feel_accuracy FLOAT
        CHECK (feel_accuracy IS NULL OR (feel_accuracy >= 0 AND feel_accuracy <= 1)),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.feel_checks IS 'Member self-assessment before seeing AI analysis (principle 4)';
COMMENT ON COLUMN public.feel_checks.feel_accuracy IS 'Computed accuracy: how well feel matches AI analysis (0-1)';

CREATE INDEX idx_feel_checks_member ON public.feel_checks(member_id, created_at DESC);
CREATE INDEX idx_feel_checks_video ON public.feel_checks(video_id);

-- ==========================================
-- AI Observations
-- ==========================================
CREATE TABLE public.ai_observations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    video_id UUID NOT NULL REFERENCES public.swing_videos(id) ON DELETE CASCADE,
    member_id UUID NOT NULL REFERENCES public.member_profiles(id),
    pro_id UUID REFERENCES public.pro_profiles(id),
    observation_text TEXT NOT NULL,
    tone TEXT NOT NULL DEFAULT 'observe'
        CHECK (tone IN ('observe', 'suggest', 'guide')),
    coach_consultation_flag BOOLEAN NOT NULL DEFAULT false,
    visible_tags JSONB NOT NULL DEFAULT '[]',
    hidden_tags JSONB NOT NULL DEFAULT '[]',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.ai_observations IS 'AI-generated swing observations respecting pro scope settings';
COMMENT ON COLUMN public.ai_observations.tone IS 'Communication tone set by pro: observe/suggest/guide';
COMMENT ON COLUMN public.ai_observations.coach_consultation_flag IS 'True when AI detects issue outside visible scope';
COMMENT ON COLUMN public.ai_observations.visible_tags IS 'Error patterns visible to member';
COMMENT ON COLUMN public.ai_observations.hidden_tags IS 'Error patterns hidden from member (pro-only)';

CREATE INDEX idx_observations_member ON public.ai_observations(member_id, created_at DESC);
CREATE INDEX idx_observations_video ON public.ai_observations(video_id);

-- ==========================================
-- AI Scope Settings (Pro configures per member)
-- ==========================================
CREATE TABLE public.ai_scope_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pro_id UUID NOT NULL REFERENCES public.pro_profiles(id) ON DELETE CASCADE,
    member_id UUID NOT NULL REFERENCES public.member_profiles(id),
    visible_error_patterns JSONB NOT NULL DEFAULT '[]',
    ai_tone TEXT NOT NULL DEFAULT 'observe'
        CHECK (ai_tone IN ('observe', 'suggest', 'guide')),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(pro_id, member_id)
);

COMMENT ON TABLE public.ai_scope_settings IS 'Per-member AI behavior configuration set by their pro';

CREATE TRIGGER set_ai_scope_updated_at
    BEFORE UPDATE ON public.ai_scope_settings
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- ROLLBACK:
-- DROP TRIGGER IF EXISTS set_ai_scope_updated_at ON public.ai_scope_settings;
-- DROP TABLE IF EXISTS public.ai_scope_settings;
-- DROP TABLE IF EXISTS public.ai_observations;
-- DROP TABLE IF EXISTS public.feel_checks;


-- ===========================================================
-- Migration: 005_coupons_and_payments.sql
-- ===========================================================
/**
 * Migration 005: Coupons, Payments, and Subscriptions
 *
 * Monetization tables for the PLG funnel and Toss Payments integration.
 * - coupons: PLG and purchased premium coupons
 * - coupon_redemptions: Coupon activation records
 * - subscriptions: Pro subscription billing
 * - payments: Payment transaction records
 *
 * Dependencies: 001 (profiles)
 */

-- ==========================================
-- Coupons
-- ==========================================
CREATE TABLE public.coupons (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pro_id UUID NOT NULL REFERENCES public.pro_profiles(id) ON DELETE CASCADE,
    code TEXT NOT NULL UNIQUE
        CHECK (length(code) = 8 AND code ~ '^[A-Z0-9]{8}$'),
    type TEXT NOT NULL
        CHECK (type IN ('plg', 'purchased')),
    status TEXT NOT NULL DEFAULT 'unused'
        CHECK (status IN ('unused', 'assigned', 'redeemed', 'expired')),
    assigned_member_id UUID REFERENCES public.member_profiles(id),
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.coupons IS 'Premium coupons: PLG (free 3 per pro) and purchased bundles';
COMMENT ON COLUMN public.coupons.code IS 'Unique 8-character alphanumeric redemption code';

CREATE INDEX idx_coupons_code ON public.coupons(code);
CREATE INDEX idx_coupons_pro_status ON public.coupons(pro_id, status);
CREATE INDEX idx_coupons_expires ON public.coupons(expires_at)
    WHERE status IN ('unused', 'assigned');

-- ==========================================
-- Coupon Redemptions
-- ==========================================
CREATE TABLE public.coupon_redemptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    coupon_id UUID NOT NULL UNIQUE REFERENCES public.coupons(id),
    member_id UUID NOT NULL REFERENCES public.member_profiles(id),
    premium_days INT NOT NULL DEFAULT 90
        CHECK (premium_days > 0),
    redeemed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.coupon_redemptions IS 'Records of coupon activations granting premium access';

CREATE INDEX idx_redemptions_member ON public.coupon_redemptions(member_id);

-- ==========================================
-- Subscriptions (Pro billing)
-- ==========================================
CREATE TABLE public.subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pro_id UUID NOT NULL REFERENCES public.pro_profiles(id) ON DELETE CASCADE,
    tier TEXT NOT NULL
        CHECK (tier IN ('pro', 'academy')),
    status TEXT NOT NULL DEFAULT 'active'
        CHECK (status IN ('active', 'past_due', 'cancelled')),
    toss_billing_key TEXT,
    current_period_start TIMESTAMPTZ NOT NULL,
    current_period_end TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.subscriptions IS 'Pro subscription management via Toss Payments billing';

CREATE INDEX idx_subscriptions_pro ON public.subscriptions(pro_id);
CREATE INDEX idx_subscriptions_renewal ON public.subscriptions(current_period_end)
    WHERE status = 'active';

CREATE TRIGGER set_subscriptions_updated_at
    BEFORE UPDATE ON public.subscriptions
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- ==========================================
-- Payments (Transaction records)
-- ==========================================
CREATE TABLE public.payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id),
    toss_payment_key TEXT UNIQUE,
    amount INT NOT NULL
        CHECK (amount > 0),
    type TEXT NOT NULL
        CHECK (type IN ('subscription', 'coupon_bundle')),
    status TEXT NOT NULL DEFAULT 'completed'
        CHECK (status IN ('completed', 'refunded', 'failed')),
    metadata JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.payments IS 'All payment transactions via Toss Payments';

CREATE INDEX idx_payments_user ON public.payments(user_id, created_at DESC);
CREATE INDEX idx_payments_toss ON public.payments(toss_payment_key)
    WHERE toss_payment_key IS NOT NULL;

-- ROLLBACK:
-- DROP TABLE IF EXISTS public.payments;
-- DROP TRIGGER IF EXISTS set_subscriptions_updated_at ON public.subscriptions;
-- DROP TABLE IF EXISTS public.subscriptions;
-- DROP TABLE IF EXISTS public.coupon_redemptions;
-- DROP TABLE IF EXISTS public.coupons;


-- ===========================================================
-- Migration: 006_notifications.sql
-- ===========================================================
/**
 * Migration 006: Notifications
 *
 * In-app notification system supporting multiple channels (F-011, F-014).
 *
 * Dependencies: auth.users
 */

CREATE TABLE public.notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    type TEXT NOT NULL
        CHECK (type IN ('report', 'reminder', 'coupon', 'system')),
    title TEXT NOT NULL,
    body TEXT,
    data JSONB,
    is_read BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.notifications IS 'In-app notification center entries';
COMMENT ON COLUMN public.notifications.data IS 'Structured payload (e.g., report_id, coupon_code, deep_link)';

CREATE INDEX idx_notif_user_unread ON public.notifications(user_id, is_read, created_at DESC);
CREATE INDEX idx_notif_created ON public.notifications(created_at DESC)
    WHERE is_read = false;

-- ROLLBACK:
-- DROP TABLE IF EXISTS public.notifications;


-- ===========================================================
-- Migration: 007_error_patterns_and_glossary.sql
-- ===========================================================
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


-- ===========================================================
-- Migration: 008_rls_policies.sql
-- ===========================================================
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


-- ===========================================================
-- Migration: 009_raw_measurements.sql
-- ===========================================================
/**
 * Migration 009: Raw Measurements (Layer A — Immutable)
 *
 * Patent 1 Claim 1(a): 제1 논리 계층 — 원시 측정값 저장
 * DC-1: 3계층 데이터 논리 분리
 * DC-3: 원시 측정값 불변성 (UPDATE 차단)
 *
 * Dependencies: 003_swing_videos_and_pose (swing_videos)
 */

CREATE TABLE public.raw_measurements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES public.swing_videos(id) ON DELETE CASCADE,
    frame_index INT NOT NULL CHECK (frame_index >= 0),
    spatial_data JSONB NOT NULL,
    measurement_confidence FLOAT CHECK (measurement_confidence >= 0 AND measurement_confidence <= 1),
    source_model TEXT NOT NULL DEFAULT 'mediapipe_blazepose',
    source_version TEXT NOT NULL DEFAULT '0.10.14',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    UNIQUE(session_id, frame_index)
);

COMMENT ON TABLE public.raw_measurements IS 'Layer A (Patent 1): Immutable raw pose measurements. UPDATE prohibited by DC-3.';
COMMENT ON COLUMN public.raw_measurements.spatial_data IS 'Raw keypoints, joint coordinates, visibility scores from pose estimation';
COMMENT ON COLUMN public.raw_measurements.measurement_confidence IS 'DC-2: Composite confidence = keypoint_vis × cam_angle × motion_blur × occlusion × K';

CREATE INDEX idx_raw_meas_session ON public.raw_measurements(session_id, frame_index);
CREATE INDEX idx_raw_meas_confidence ON public.raw_measurements(session_id, measurement_confidence);

-- DC-3: Layer A 불변성 강제 — UPDATE 차단 트리거
CREATE OR REPLACE FUNCTION public.prevent_raw_measurement_update()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'DC-3 VIOLATION: raw_measurements table is immutable. UPDATE operations are prohibited.';
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER enforce_raw_measurement_immutability
    BEFORE UPDATE ON public.raw_measurements
    FOR EACH ROW EXECUTE FUNCTION public.prevent_raw_measurement_update();

-- ROLLBACK:
-- DROP TRIGGER IF EXISTS enforce_raw_measurement_immutability ON public.raw_measurements;
-- DROP FUNCTION IF EXISTS public.prevent_raw_measurement_update();
-- DROP TABLE IF EXISTS public.raw_measurements;


-- ===========================================================
-- Migration: 010_derived_metrics.sql
-- ===========================================================
/**
 * Migration 010: Derived Metrics (Layer B — Recalculable)
 *
 * Patent 1 Claim 1(b): 제2 논리 계층 — 파생 지표
 * DC-1: 3계층 데이터 논리 분리
 *
 * Dependencies: 003_swing_videos_and_pose, 009_raw_measurements
 */

CREATE TABLE public.derived_metrics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES public.swing_videos(id) ON DELETE CASCADE,
    compound_metrics JSONB NOT NULL DEFAULT '{}',
    auto_detected_symptoms JSONB NOT NULL DEFAULT '[]',
    dependency_edges JSONB NOT NULL DEFAULT '[]',
    formula_id TEXT NOT NULL DEFAULT 'v1.0',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    recalculated_at TIMESTAMPTZ
);

COMMENT ON TABLE public.derived_metrics IS 'Layer B (Patent 1): Derived metrics computed from Layer A. Recalculable, not human-editable.';
COMMENT ON COLUMN public.derived_metrics.compound_metrics IS 'X-Factor, swing tempo, hip rotation etc.';
COMMENT ON COLUMN public.derived_metrics.auto_detected_symptoms IS 'Auto-detected error pattern nodes from analysis';
COMMENT ON COLUMN public.derived_metrics.dependency_edges IS 'Symptom-to-symptom dependency edges for causal graph input';
COMMENT ON COLUMN public.derived_metrics.formula_id IS 'Version of calculation logic for reproducibility';

CREATE INDEX idx_derived_session ON public.derived_metrics(session_id);

-- ROLLBACK:
-- DROP TABLE IF EXISTS public.derived_metrics;


-- ===========================================================
-- Migration: 011_coaching_decisions.sql
-- ===========================================================
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


-- ===========================================================
-- Migration: 012_edit_deltas.sql
-- ===========================================================
/**
 * Migration 012: Edit Deltas
 *
 * Patent 1 Claims 1(d), 3: 수정 델타 레코드
 * 프로가 자동 진단을 수정할 때 before/after 차이를 영구 기록
 *
 * Dependencies: 011_coaching_decisions
 */

CREATE TABLE public.edit_deltas (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    decision_id UUID NOT NULL REFERENCES public.coaching_decisions(id) ON DELETE CASCADE,
    edited_fields TEXT[] NOT NULL,
    original_value JSONB NOT NULL,
    edited_value JSONB NOT NULL,
    delta_value JSONB NOT NULL,
    data_quality_tier TEXT NOT NULL
        CHECK (data_quality_tier IN ('tier_1', 'tier_2', 'tier_3')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.edit_deltas IS 'Patent 1 Claim 3: Edit delta records for RLHF and edge weight calibration';
COMMENT ON COLUMN public.edit_deltas.edited_fields IS 'Array of field names that were modified';
COMMENT ON COLUMN public.edit_deltas.delta_value IS 'Computed difference between original and edited values';

CREATE INDEX idx_deltas_decision ON public.edit_deltas(decision_id);
CREATE INDEX idx_deltas_tier ON public.edit_deltas(data_quality_tier)
    WHERE data_quality_tier IN ('tier_2', 'tier_3');
CREATE INDEX idx_deltas_created ON public.edit_deltas(created_at DESC);

-- ROLLBACK:
-- DROP TABLE IF EXISTS public.edit_deltas;


-- ===========================================================
-- Migration: 013_causal_graph_edges.sql
-- ===========================================================
/**
 * Migration 013: Causal Graph Edges
 *
 * Patent 1 Claims 1(b), 1(e): 인과 그래프 DAG 간선 + 부분 보정
 *
 * Dependencies: 007_error_patterns_seed (error_patterns)
 */

CREATE TABLE public.causal_graph_edges (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    from_node TEXT NOT NULL,
    to_node TEXT NOT NULL,
    edge_type TEXT NOT NULL DEFAULT 'causes'
        CHECK (edge_type IN ('causes', 'aggravates', 'correlates')),
    weight FLOAT NOT NULL DEFAULT 0.5
        CHECK (weight >= 0.0 AND weight <= 1.0),
    calibrated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    calibration_count INT NOT NULL DEFAULT 0,

    UNIQUE(from_node, to_node, edge_type)
);

COMMENT ON TABLE public.causal_graph_edges IS 'Patent 1: Causal graph DAG edges between error pattern nodes. Weights partially calibrated via edit deltas.';
COMMENT ON COLUMN public.causal_graph_edges.from_node IS 'Source error pattern code (cause)';
COMMENT ON COLUMN public.causal_graph_edges.to_node IS 'Target error pattern code (effect/symptom)';
COMMENT ON COLUMN public.causal_graph_edges.weight IS 'Edge weight [0,1] calibrated by edit deltas';

CREATE INDEX idx_graph_from ON public.causal_graph_edges(from_node);
CREATE INDEX idx_graph_to ON public.causal_graph_edges(to_node);

-- 초기 시드: 22개 에러 패턴 기반 6개 인과 체인
-- (seed.sql에서 INSERT)

-- ROLLBACK:
-- DROP TABLE IF EXISTS public.causal_graph_edges;


-- ===========================================================
-- Migration: 014_measurement_states.sql
-- ===========================================================
/**
 * Migration 014: Measurement States
 *
 * Patent 3 Claims 1(b)-(c): 3단계 신뢰도 상태 분류
 *
 * Dependencies: 009_raw_measurements
 */

CREATE TABLE public.measurement_states (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    measurement_id UUID NOT NULL UNIQUE REFERENCES public.raw_measurements(id) ON DELETE CASCADE,
    session_id UUID NOT NULL REFERENCES public.swing_videos(id) ON DELETE CASCADE,
    state TEXT NOT NULL DEFAULT 'pending_verification'
        CHECK (state IN ('confirmed', 'pending_verification', 'hidden')),
    confidence_score FLOAT NOT NULL
        CHECK (confidence_score >= 0 AND confidence_score <= 1),
    predicted_value JSONB,
    review_state TEXT NOT NULL DEFAULT 'pending'
        CHECK (review_state IN ('pending', 'reviewed')),
    issued_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.measurement_states IS 'Patent 3: 3-tier state classification for each measurement based on confidence score';
COMMENT ON COLUMN public.measurement_states.state IS 'confirmed(>=0.7), pending_verification(0.4~0.7), hidden(<0.4)';

CREATE INDEX idx_meas_state_session ON public.measurement_states(session_id, state);
CREATE INDEX idx_meas_state_pending ON public.measurement_states(session_id)
    WHERE state = 'pending_verification' AND review_state = 'pending';
CREATE INDEX idx_meas_state_hidden ON public.measurement_states(session_id)
    WHERE state = 'hidden';

-- ROLLBACK:
-- DROP TABLE IF EXISTS public.measurement_states;


-- ===========================================================
-- Migration: 015_verification_queue.sql
-- ===========================================================
/**
 * Migration 015: Verification Queue
 *
 * Patent 3 Claims 1(c), 1(e): 검증 대기 객체 및 비동기 검증 큐
 *
 * Dependencies: 014_measurement_states, 001_users_and_profiles
 */

CREATE TABLE public.verification_queue (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    measurement_state_id UUID NOT NULL UNIQUE REFERENCES public.measurement_states(id) ON DELETE CASCADE,
    token TEXT NOT NULL UNIQUE DEFAULT gen_random_uuid()::text,
    review_state TEXT NOT NULL DEFAULT 'pending'
        CHECK (review_state IN ('pending', 'confirmed', 'corrected', 'rejected')),
    reviewer_id UUID REFERENCES public.pro_profiles(id),
    reviewed_at TIMESTAMPTZ,
    response_type TEXT
        CHECK (response_type IS NULL OR response_type IN ('confirm', 'correct', 'reject')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.verification_queue IS 'Patent 3: Async verification queue for pending_verification measurements. Tokens issued only for pending state.';

CREATE INDEX idx_verif_pending ON public.verification_queue(review_state)
    WHERE review_state = 'pending';
CREATE INDEX idx_verif_reviewer ON public.verification_queue(reviewer_id)
    WHERE review_state = 'pending';

-- ROLLBACK:
-- DROP TABLE IF EXISTS public.verification_queue;


-- ===========================================================
-- Migration: 016_voice_memo_cache.sql
-- ===========================================================
/**
 * Migration 016: Voice Memo Cache (FSM State Management)
 *
 * Patent 4 Claims 1(a)-(e): 4단계 FSM + 캐시 재사용
 * DC-5: 엄격한 상태 전이 규칙
 *
 * Dependencies: 002_voice_memos_and_reports, 001_users_and_profiles
 */

CREATE TABLE public.voice_memo_cache (
    memo_id UUID PRIMARY KEY REFERENCES public.voice_memos(id) ON DELETE CASCADE,
    coach_profile_id UUID NOT NULL REFERENCES public.pro_profiles(id),
    target_id UUID REFERENCES public.member_profiles(id),
    state TEXT NOT NULL DEFAULT 'UNBOUND'
        CHECK (state IN ('UNBOUND', 'PREPROCESSED', 'LINKED', 'FINALIZED')),
    transcription_job_id TEXT UNIQUE,
    audio_blob_ref TEXT NOT NULL,
    transcript TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.voice_memo_cache IS 'Patent 4 DC-5: 4-state FSM for voice memo lifecycle. Cache reuse prevents duplicate transcription.';
COMMENT ON COLUMN public.voice_memo_cache.state IS 'UNBOUND→PREPROCESSED→LINKED→FINALIZED. No state skips allowed.';
COMMENT ON COLUMN public.voice_memo_cache.target_id IS 'Patent 4 Claim 2: Must be NULL in UNBOUND and PREPROCESSED states.';

CREATE INDEX idx_cache_state ON public.voice_memo_cache(state)
    WHERE state IN ('UNBOUND', 'PREPROCESSED', 'LINKED');
CREATE INDEX idx_cache_coach ON public.voice_memo_cache(coach_profile_id, state);

-- DC-5: target_id NULL 불변조건 강제
CREATE OR REPLACE FUNCTION public.enforce_target_id_null_invariant()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.state IN ('UNBOUND', 'PREPROCESSED') AND NEW.target_id IS NOT NULL THEN
        RAISE EXCEPTION 'DC-5 VIOLATION: target_id must be NULL in state % (Patent 4 Claim 2)', NEW.state;
    END IF;
    IF NEW.state IN ('LINKED', 'FINALIZED') AND NEW.target_id IS NULL THEN
        RAISE EXCEPTION 'DC-5 VIOLATION: target_id must NOT be NULL in state %', NEW.state;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER enforce_voice_cache_target_invariant
    BEFORE INSERT OR UPDATE ON public.voice_memo_cache
    FOR EACH ROW EXECUTE FUNCTION public.enforce_target_id_null_invariant();

-- DC-5: 상태 전이 guard (스킵 방지)
CREATE OR REPLACE FUNCTION public.enforce_fsm_transition()
RETURNS TRIGGER AS $$
DECLARE
    valid_transitions JSONB := '{
        "UNBOUND": ["PREPROCESSED"],
        "PREPROCESSED": ["LINKED"],
        "LINKED": ["FINALIZED"]
    }'::JSONB;
    allowed TEXT[];
BEGIN
    IF OLD.state = NEW.state THEN
        RETURN NEW;
    END IF;

    IF OLD.state = 'FINALIZED' THEN
        RAISE EXCEPTION 'DC-5 VIOLATION: Cannot transition from FINALIZED state';
    END IF;

    SELECT array_agg(elem::text)
    INTO allowed
    FROM jsonb_array_elements_text(valid_transitions -> OLD.state) AS elem;

    IF NOT (NEW.state = ANY(allowed)) THEN
        RAISE EXCEPTION 'DC-5 VIOLATION: Invalid transition from % to % (Patent 4 Claim 1)', OLD.state, NEW.state;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER enforce_voice_cache_fsm
    BEFORE UPDATE ON public.voice_memo_cache
    FOR EACH ROW EXECUTE FUNCTION public.enforce_fsm_transition();

-- 상태 전이 로그 (감사 추적)
CREATE TABLE public.voice_memo_state_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    memo_id UUID NOT NULL REFERENCES public.voice_memos(id),
    from_state TEXT NOT NULL,
    to_state TEXT NOT NULL,
    transitioned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    metadata JSONB
);

CREATE OR REPLACE FUNCTION public.log_fsm_transition()
RETURNS TRIGGER AS $$
BEGIN
    IF OLD.state != NEW.state THEN
        INSERT INTO public.voice_memo_state_log (memo_id, from_state, to_state, metadata)
        VALUES (NEW.memo_id, OLD.state, NEW.state,
                jsonb_build_object('target_id', NEW.target_id, 'job_id', NEW.transcription_job_id));
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER log_voice_cache_transition
    AFTER UPDATE ON public.voice_memo_cache
    FOR EACH ROW EXECUTE FUNCTION public.log_fsm_transition();

CREATE TRIGGER set_voice_memo_cache_updated_at
    BEFORE UPDATE ON public.voice_memo_cache
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- ROLLBACK:
-- DROP TRIGGER IF EXISTS set_voice_memo_cache_updated_at ON public.voice_memo_cache;
-- DROP TRIGGER IF EXISTS log_voice_cache_transition ON public.voice_memo_cache;
-- DROP TRIGGER IF EXISTS enforce_voice_cache_fsm ON public.voice_memo_cache;
-- DROP TRIGGER IF EXISTS enforce_voice_cache_target_invariant ON public.voice_memo_cache;
-- DROP TABLE IF EXISTS public.voice_memo_state_log;
-- DROP TABLE IF EXISTS public.voice_memo_cache;
-- DROP FUNCTION IF EXISTS public.log_fsm_transition();
-- DROP FUNCTION IF EXISTS public.enforce_fsm_transition();
-- DROP FUNCTION IF EXISTS public.enforce_target_id_null_invariant();


-- ===========================================================
-- Migration: 017_patent_rls_policies.sql
-- ===========================================================
/**
 * Migration 017: RLS Policies for Patent Tables (v2.0 수정)
 *
 * Row Level Security for all v2.0 patent-derived tables.
 * Key policy: raw_measurements has NO UPDATE policy (DC-3 immutability).
 * Hidden measurement_states are excluded from member access path (Patent 3 Claim 1(d)).
 *
 * Note: service_role 키로 호출되는 Edge Function은 RLS를 우회하지만,
 *       anon/authenticated 키를 사용하는 경우를 대비한 방어적 정책 포함.
 *
 * Dependencies: 009~016 patent tables
 */

-- Enable RLS on all patent tables
ALTER TABLE public.raw_measurements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.derived_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coaching_decisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.edit_deltas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.causal_graph_edges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.measurement_states ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.verification_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.voice_memo_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.voice_memo_state_log ENABLE ROW LEVEL SECURITY;

-- ============================
-- raw_measurements: DC-3 불변 — SELECT + INSERT only, NO UPDATE
-- ============================
-- 회원: 자기 세션만 읽기
CREATE POLICY raw_meas_member_read ON public.raw_measurements
    FOR SELECT USING (
        session_id IN (SELECT id FROM public.swing_videos WHERE member_id IN
            (SELECT id FROM public.member_profiles WHERE user_id = auth.uid()))
    );

-- 프로: 연결된 회원 세션 읽기
CREATE POLICY raw_meas_pro_read ON public.raw_measurements
    FOR SELECT USING (
        session_id IN (SELECT sv.id FROM public.swing_videos sv
            JOIN public.pro_member_links pml ON sv.member_id = pml.member_id
            WHERE pml.pro_id IN (SELECT id FROM public.pro_profiles WHERE user_id = auth.uid())
            AND pml.status = 'active')
    );

-- Edge Function (service_role): INSERT만
CREATE POLICY raw_meas_service_insert ON public.raw_measurements
    FOR INSERT WITH CHECK (true);
-- Note: UPDATE policy 없음 = DC-3 RLS 강제

-- ============================
-- derived_metrics: 회원/프로 읽기 + Edge Function INSERT/UPDATE (DC-1 Layer B)
-- ============================
-- 회원: 자기 세션 메트릭 읽기
CREATE POLICY derived_member_read ON public.derived_metrics
    FOR SELECT USING (
        session_id IN (SELECT id FROM public.swing_videos WHERE member_id IN
            (SELECT id FROM public.member_profiles WHERE user_id = auth.uid()))
    );

-- 프로: 연결된 회원 세션 메트릭 읽기
CREATE POLICY derived_pro_read ON public.derived_metrics
    FOR SELECT USING (
        session_id IN (SELECT sv.id FROM public.swing_videos sv
            JOIN public.pro_member_links pml ON sv.member_id = pml.member_id
            WHERE pml.pro_id IN (SELECT id FROM public.pro_profiles WHERE user_id = auth.uid())
            AND pml.status = 'active')
    );

-- Edge Function (service_role): INSERT + UPDATE
CREATE POLICY derived_service_insert ON public.derived_metrics
    FOR INSERT WITH CHECK (true);

CREATE POLICY derived_service_update ON public.derived_metrics
    FOR UPDATE USING (true);

-- ============================
-- measurement_states: 회원은 hidden 제외 (Patent 3 Claim 1(d))
-- ============================
-- 회원: confirmed + pending만 (데이터 접근 경로 분리)
CREATE POLICY meas_state_member ON public.measurement_states
    FOR SELECT USING (
        state != 'hidden' AND
        session_id IN (SELECT id FROM public.swing_videos WHERE member_id IN
            (SELECT id FROM public.member_profiles WHERE user_id = auth.uid()))
    );

-- 프로: 전체 (hidden 포함 — 참조 레코드 접근 가능)
CREATE POLICY meas_state_pro ON public.measurement_states
    FOR SELECT USING (
        session_id IN (SELECT sv.id FROM public.swing_videos sv
            JOIN public.pro_member_links pml ON sv.member_id = pml.member_id
            WHERE pml.pro_id IN (SELECT id FROM public.pro_profiles WHERE user_id = auth.uid())
            AND pml.status = 'active')
    );

-- Edge Function (service_role): INSERT + UPDATE (신뢰도 엔진)
CREATE POLICY meas_state_service_insert ON public.measurement_states
    FOR INSERT WITH CHECK (true);

CREATE POLICY meas_state_service_update ON public.measurement_states
    FOR UPDATE USING (true);

-- ============================
-- verification_queue: 프로 읽기/수정 + Edge Function INSERT
-- ============================
CREATE POLICY verif_pro_read ON public.verification_queue
    FOR SELECT USING (
        reviewer_id IN (SELECT id FROM public.pro_profiles WHERE user_id = auth.uid())
        OR measurement_state_id IN (
            SELECT ms.id FROM public.measurement_states ms
            JOIN public.swing_videos sv ON ms.session_id = sv.id
            JOIN public.pro_member_links pml ON sv.member_id = pml.member_id
            WHERE pml.pro_id IN (SELECT id FROM public.pro_profiles WHERE user_id = auth.uid())
            AND pml.status = 'active'
        )
    );

CREATE POLICY verif_pro_update ON public.verification_queue
    FOR UPDATE USING (
        reviewer_id IN (SELECT id FROM public.pro_profiles WHERE user_id = auth.uid())
    );

-- Edge Function (service_role): INSERT (검증 토큰 발급)
CREATE POLICY verif_service_insert ON public.verification_queue
    FOR INSERT WITH CHECK (true);

-- ============================
-- coaching_decisions: 프로 전체 + 회원 읽기 (DC-1 Layer C)
-- ============================
CREATE POLICY decisions_pro_all ON public.coaching_decisions
    FOR ALL USING (
        coach_profile_id IN (SELECT id FROM public.pro_profiles WHERE user_id = auth.uid())
    );

CREATE POLICY decisions_member_read ON public.coaching_decisions
    FOR SELECT USING (
        session_id IN (SELECT id FROM public.swing_videos WHERE member_id IN
            (SELECT id FROM public.member_profiles WHERE user_id = auth.uid()))
    );

-- ============================
-- edit_deltas: 프로 읽기 + Edge Function INSERT
-- ============================
CREATE POLICY deltas_pro_read ON public.edit_deltas
    FOR SELECT USING (
        decision_id IN (SELECT id FROM public.coaching_decisions
            WHERE coach_profile_id IN (SELECT id FROM public.pro_profiles WHERE user_id = auth.uid()))
    );

CREATE POLICY deltas_service_insert ON public.edit_deltas
    FOR INSERT WITH CHECK (true);

-- ============================
-- causal_graph_edges: 인증 사용자 읽기 + Edge Function INSERT/UPDATE
-- ============================
CREATE POLICY graph_read_all ON public.causal_graph_edges
    FOR SELECT USING (auth.uid() IS NOT NULL);

-- Edge Function / seed: INSERT (초기 시드 + 엔진 생성)
CREATE POLICY graph_service_insert ON public.causal_graph_edges
    FOR INSERT WITH CHECK (true);

-- Edge Function: UPDATE (간선 가중치 보정 — edge-weight-calibration)
CREATE POLICY graph_service_update ON public.causal_graph_edges
    FOR UPDATE USING (true);

-- ============================
-- voice_memo_cache: 프로만 (DC-5)
-- ============================
CREATE POLICY cache_pro_all ON public.voice_memo_cache
    FOR ALL USING (
        coach_profile_id IN (SELECT id FROM public.pro_profiles WHERE user_id = auth.uid())
    );

-- ============================
-- voice_memo_state_log: 프로 읽기 + 트리거 INSERT
-- ============================
CREATE POLICY state_log_pro_read ON public.voice_memo_state_log
    FOR SELECT USING (
        memo_id IN (SELECT id FROM public.voice_memos
            WHERE pro_id IN (SELECT id FROM public.pro_profiles WHERE user_id = auth.uid()))
    );

-- 트리거 함수(log_fsm_transition)가 INSERT 수행 — service_role이 아닌 경우 대비
CREATE POLICY state_log_trigger_insert ON public.voice_memo_state_log
    FOR INSERT WITH CHECK (true);

-- ============================
-- ROLLBACK
-- ============================
-- DROP POLICY IF EXISTS raw_meas_member_read ON public.raw_measurements;
-- DROP POLICY IF EXISTS raw_meas_pro_read ON public.raw_measurements;
-- DROP POLICY IF EXISTS raw_meas_service_insert ON public.raw_measurements;
-- DROP POLICY IF EXISTS derived_member_read ON public.derived_metrics;
-- DROP POLICY IF EXISTS derived_pro_read ON public.derived_metrics;
-- DROP POLICY IF EXISTS derived_service_insert ON public.derived_metrics;
-- DROP POLICY IF EXISTS derived_service_update ON public.derived_metrics;
-- DROP POLICY IF EXISTS meas_state_member ON public.measurement_states;
-- DROP POLICY IF EXISTS meas_state_pro ON public.measurement_states;
-- DROP POLICY IF EXISTS meas_state_service_insert ON public.measurement_states;
-- DROP POLICY IF EXISTS meas_state_service_update ON public.measurement_states;
-- DROP POLICY IF EXISTS verif_pro_read ON public.verification_queue;
-- DROP POLICY IF EXISTS verif_pro_update ON public.verification_queue;
-- DROP POLICY IF EXISTS verif_service_insert ON public.verification_queue;
-- DROP POLICY IF EXISTS decisions_pro_all ON public.coaching_decisions;
-- DROP POLICY IF EXISTS decisions_member_read ON public.coaching_decisions;
-- DROP POLICY IF EXISTS deltas_pro_read ON public.edit_deltas;
-- DROP POLICY IF EXISTS deltas_service_insert ON public.edit_deltas;
-- DROP POLICY IF EXISTS graph_read_all ON public.causal_graph_edges;
-- DROP POLICY IF EXISTS graph_service_insert ON public.causal_graph_edges;
-- DROP POLICY IF EXISTS graph_service_update ON public.causal_graph_edges;
-- DROP POLICY IF EXISTS cache_pro_all ON public.voice_memo_cache;
-- DROP POLICY IF EXISTS state_log_pro_read ON public.voice_memo_state_log;
-- DROP POLICY IF EXISTS state_log_trigger_insert ON public.voice_memo_state_log;
-- ALTER TABLE public.raw_measurements DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE public.derived_metrics DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE public.coaching_decisions DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE public.edit_deltas DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE public.causal_graph_edges DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE public.measurement_states DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE public.verification_queue DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE public.voice_memo_cache DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE public.voice_memo_state_log DISABLE ROW LEVEL SECURITY;


-- ===========================================================
-- Migration: 018_patent_hotfix.sql
-- ===========================================================
/**
 * Migration 018: Patent Schema Hotfix
 *
 * 통합 검증에서 발견된 이슈 수정:
 * 1. 015 verification_queue.reviewer_id — ON DELETE SET NULL 추가
 * 2. 016 voice_memo_cache.target_id — ON DELETE SET NULL 추가
 * 3. 015 verification_queue — measurement_state_id 인덱스 추가
 * 4. 014 measurement_states — updated_at 자동 트리거 추가
 *
 * Dependencies: 015, 016, 014
 */

-- ============================================================
-- 1. verification_queue.reviewer_id: ON DELETE SET NULL 추가
--    (프로 프로필 삭제 시 reviewer_id를 NULL로 → 고아 큐 방지)
-- ============================================================
ALTER TABLE public.verification_queue
    DROP CONSTRAINT IF EXISTS verification_queue_reviewer_id_fkey;

ALTER TABLE public.verification_queue
    ADD CONSTRAINT verification_queue_reviewer_id_fkey
    FOREIGN KEY (reviewer_id) REFERENCES public.pro_profiles(id)
    ON DELETE SET NULL;

-- ============================================================
-- 2. voice_memo_cache.target_id: ON DELETE SET NULL 추가
--    (회원 프로필 삭제 시 target_id를 NULL로 → DC-5 FSM 상태는 유지)
-- ============================================================
ALTER TABLE public.voice_memo_cache
    DROP CONSTRAINT IF EXISTS voice_memo_cache_target_id_fkey;

ALTER TABLE public.voice_memo_cache
    ADD CONSTRAINT voice_memo_cache_target_id_fkey
    FOREIGN KEY (target_id) REFERENCES public.member_profiles(id)
    ON DELETE SET NULL;

-- ============================================================
-- 3. verification_queue: measurement_state_id FK 인덱스 추가
--    (RLS 정책의 JOIN 성능 개선)
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_verif_measurement_state
    ON public.verification_queue(measurement_state_id);

-- ============================================================
-- 4. measurement_states: updated_at 컬럼 + 자동 트리거 추가
--    (상태 전이 시각 자동 기록)
-- ============================================================
ALTER TABLE public.measurement_states
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

CREATE TRIGGER set_measurement_states_updated_at
    BEFORE UPDATE ON public.measurement_states
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- ROLLBACK:
-- DROP TRIGGER IF EXISTS set_measurement_states_updated_at ON public.measurement_states;
-- ALTER TABLE public.measurement_states DROP COLUMN IF EXISTS updated_at;
-- DROP INDEX IF EXISTS idx_verif_measurement_state;
-- ALTER TABLE public.voice_memo_cache DROP CONSTRAINT IF EXISTS voice_memo_cache_target_id_fkey;
-- ALTER TABLE public.voice_memo_cache ADD CONSTRAINT voice_memo_cache_target_id_fkey FOREIGN KEY (target_id) REFERENCES public.member_profiles(id);
-- ALTER TABLE public.verification_queue DROP CONSTRAINT IF EXISTS verification_queue_reviewer_id_fkey;
-- ALTER TABLE public.verification_queue ADD CONSTRAINT verification_queue_reviewer_id_fkey FOREIGN KEY (reviewer_id) REFERENCES public.pro_profiles(id);


-- ===========================================================
-- Migration: 019_push_tokens.sql
-- ===========================================================
-- ============================================================
-- Migration 019: Push Tokens Table
-- ============================================================
-- Stores Expo push tokens for mobile notifications.
-- Supports multiple devices per user.
-- ============================================================

CREATE TABLE IF NOT EXISTS push_tokens (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  token         TEXT NOT NULL,
  platform      TEXT NOT NULL CHECK (platform IN ('ios', 'android', 'web')),
  device_id     TEXT NOT NULL DEFAULT 'unknown',
  is_active     BOOLEAN DEFAULT true,
  created_at    TIMESTAMPTZ DEFAULT now(),
  updated_at    TIMESTAMPTZ DEFAULT now()
);

-- Unique constraint: one token per user+device
ALTER TABLE push_tokens
  ADD CONSTRAINT uq_push_tokens_user_device UNIQUE (user_id, device_id);

-- Index for fast lookup by user
CREATE INDEX idx_push_tokens_user_id ON push_tokens(user_id) WHERE is_active = true;

-- Index for token lookup (send notification)
CREATE INDEX idx_push_tokens_token ON push_tokens(token);

-- Updated_at trigger
CREATE OR REPLACE FUNCTION update_push_tokens_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_push_tokens_updated_at
  BEFORE UPDATE ON push_tokens
  FOR EACH ROW
  EXECUTE FUNCTION update_push_tokens_timestamp();

-- ============================================================
-- RLS Policies
-- ============================================================
ALTER TABLE push_tokens ENABLE ROW LEVEL SECURITY;

-- Users can only see/manage their own tokens
CREATE POLICY "push_tokens_select_own"
  ON push_tokens FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "push_tokens_insert_own"
  ON push_tokens FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "push_tokens_update_own"
  ON push_tokens FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "push_tokens_delete_own"
  ON push_tokens FOR DELETE
  USING (auth.uid() = user_id);

-- Service role can access all (for sending notifications)
CREATE POLICY "push_tokens_service_role"
  ON push_tokens FOR ALL
  USING (auth.role() = 'service_role');

COMMENT ON TABLE push_tokens IS 'Expo push notification tokens per user device';


-- ===========================================================
-- Migration: 020_transcription_jobs.sql
-- ===========================================================
-- ============================================================
-- Migration 020: Transcription Jobs Table
-- ============================================================
-- Async transcription queue for voice memos.
-- Supports Patent 4 FSM: UNBOUND → PREPROCESSED transition.
-- ============================================================

CREATE TABLE IF NOT EXISTS transcription_jobs (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  voice_memo_id   UUID NOT NULL REFERENCES voice_memos(id) ON DELETE CASCADE,
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status          TEXT NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  audio_url       TEXT,
  audio_duration  INTEGER, -- milliseconds
  audio_format    TEXT DEFAULT 'm4a',

  -- Transcription result
  transcript      TEXT,
  confidence      NUMERIC(5,4) CHECK (confidence >= 0 AND confidence <= 1),
  language        TEXT DEFAULT 'ko',
  segments        JSONB DEFAULT '[]'::jsonb,

  -- Processing metadata
  provider        TEXT DEFAULT 'openai' CHECK (provider IN ('openai', 'google', 'whisper')),
  model           TEXT DEFAULT 'whisper-1',
  processing_ms   INTEGER, -- How long transcription took
  retry_count     INTEGER DEFAULT 0,
  error_message   TEXT,

  created_at      TIMESTAMPTZ DEFAULT now(),
  completed_at    TIMESTAMPTZ,
  updated_at      TIMESTAMPTZ DEFAULT now()
);

-- Indexes
CREATE INDEX idx_transcription_jobs_user ON transcription_jobs(user_id);
CREATE INDEX idx_transcription_jobs_status ON transcription_jobs(status) WHERE status IN ('pending', 'processing');
CREATE INDEX idx_transcription_jobs_memo ON transcription_jobs(voice_memo_id);

-- Updated_at trigger
CREATE TRIGGER trg_transcription_jobs_updated_at
  BEFORE UPDATE ON transcription_jobs
  FOR EACH ROW
  EXECUTE FUNCTION update_push_tokens_timestamp();

-- ============================================================
-- RLS Policies
-- ============================================================
ALTER TABLE transcription_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "transcription_jobs_select_own"
  ON transcription_jobs FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "transcription_jobs_insert_own"
  ON transcription_jobs FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "transcription_jobs_service_role"
  ON transcription_jobs FOR ALL
  USING (auth.role() = 'service_role');

COMMENT ON TABLE transcription_jobs IS 'Async voice memo transcription queue (Patent 4 FSM support)';


-- ===========================================================
-- Migration: 021_phase0_hotfix.sql
-- ===========================================================
/**
 * Migration 021: Phase 0 Hotfix
 *
 * Phase 0-2 코드 리뷰에서 발견된 CRITICAL/HIGH 이슈 수정.
 *
 * Fixes:
 *   C2: 016 FSM enforce_fsm_transition() NULL 안전 가드 추가
 *   C3: 020 transcription_jobs trigger — handle_updated_at() 사용으로 교체
 *   H1: nullable FK에 ON DELETE SET NULL 추가 (4건)
 *
 * Dependencies: 001, 002, 004, 005, 016, 019, 020
 */

-- ==========================================
-- C2: FSM enforce_fsm_transition NULL 안전 가드
-- ==========================================
-- 기존 함수에서 valid_transitions에 없는 상태로 OLD.state가 오면
-- allowed가 NULL이 되어 ANY(NULL)이 NULL → NOT NULL = NULL → IF 미진입 → 전이 허용 버그.
-- FINALIZED는 별도 처리되므로 실제 발생 가능성은 낮으나 방어적으로 수정.

CREATE OR REPLACE FUNCTION public.enforce_fsm_transition()
RETURNS TRIGGER AS $$
DECLARE
    valid_transitions JSONB := '{
        "UNBOUND": ["PREPROCESSED"],
        "PREPROCESSED": ["LINKED"],
        "LINKED": ["FINALIZED"]
    }'::JSONB;
    allowed TEXT[];
BEGIN
    -- 상태 변경 없으면 통과
    IF OLD.state = NEW.state THEN
        RETURN NEW;
    END IF;

    -- FINALIZED는 종단 상태
    IF OLD.state = 'FINALIZED' THEN
        RAISE EXCEPTION 'DC-5 VIOLATION: Cannot transition from FINALIZED state';
    END IF;

    -- 허용된 전이 목록 조회
    SELECT array_agg(elem::text)
    INTO allowed
    FROM jsonb_array_elements_text(valid_transitions -> OLD.state) AS elem;

    -- NULL 안전 가드: 알 수 없는 상태에서의 전이 차단
    IF allowed IS NULL OR NOT (NEW.state = ANY(allowed)) THEN
        RAISE EXCEPTION 'DC-5 VIOLATION: Invalid transition from % to % (Patent 4 Claim 1)', OLD.state, NEW.state;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ==========================================
-- C3: transcription_jobs trigger 수정
-- ==========================================
-- update_push_tokens_timestamp() 대신 handle_updated_at() 사용 (결합도 제거)

DROP TRIGGER IF EXISTS trg_transcription_jobs_updated_at ON public.transcription_jobs;

CREATE TRIGGER trg_transcription_jobs_updated_at
    BEFORE UPDATE ON public.transcription_jobs
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_updated_at();

-- ==========================================
-- H1: Nullable FK에 ON DELETE SET NULL 추가 (4건)
-- ==========================================
-- 패턴: nullable FK는 참조 대상 삭제 시 SET NULL (고아 레코드 방지)

-- H1-a: voice_memos.member_id → member_profiles (nullable, orphan memo 허용)
ALTER TABLE public.voice_memos
    DROP CONSTRAINT IF EXISTS voice_memos_member_id_fkey;
ALTER TABLE public.voice_memos
    ADD CONSTRAINT voice_memos_member_id_fkey
    FOREIGN KEY (member_id) REFERENCES public.member_profiles(id)
    ON DELETE SET NULL;

-- H1-b: reports.voice_memo_id → voice_memos (nullable)
ALTER TABLE public.reports
    DROP CONSTRAINT IF EXISTS reports_voice_memo_id_fkey;
ALTER TABLE public.reports
    ADD CONSTRAINT reports_voice_memo_id_fkey
    FOREIGN KEY (voice_memo_id) REFERENCES public.voice_memos(id)
    ON DELETE SET NULL;

-- H1-c: ai_observations.pro_id → pro_profiles (nullable)
ALTER TABLE public.ai_observations
    DROP CONSTRAINT IF EXISTS ai_observations_pro_id_fkey;
ALTER TABLE public.ai_observations
    ADD CONSTRAINT ai_observations_pro_id_fkey
    FOREIGN KEY (pro_id) REFERENCES public.pro_profiles(id)
    ON DELETE SET NULL;

-- H1-d: coupons.assigned_member_id → member_profiles (nullable)
ALTER TABLE public.coupons
    DROP CONSTRAINT IF EXISTS coupons_assigned_member_id_fkey;
ALTER TABLE public.coupons
    ADD CONSTRAINT coupons_assigned_member_id_fkey
    FOREIGN KEY (assigned_member_id) REFERENCES public.member_profiles(id)
    ON DELETE SET NULL;

-- ==========================================
-- ROLLBACK:
-- ==========================================
-- -- C2: 원래 함수로 복원 (016_voice_memo_cache.sql의 원본)
-- -- C3:
-- DROP TRIGGER IF EXISTS trg_transcription_jobs_updated_at ON public.transcription_jobs;
-- CREATE TRIGGER trg_transcription_jobs_updated_at
--     BEFORE UPDATE ON public.transcription_jobs
--     FOR EACH ROW EXECUTE FUNCTION update_push_tokens_timestamp();
-- -- H1: 원래 FK로 복원 (ON DELETE RESTRICT = 기본값)
-- ALTER TABLE public.voice_memos DROP CONSTRAINT voice_memos_member_id_fkey;
-- ALTER TABLE public.voice_memos ADD CONSTRAINT voice_memos_member_id_fkey
--     FOREIGN KEY (member_id) REFERENCES public.member_profiles(id);
-- (나머지 동일 패턴)


-- ============================================================
-- Verification: 테이블 개수 확인
-- ============================================================
SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name;
