-- ============================================================
-- HelloNext Migration Part 1: Core Tables + RLS (001-008)
-- Supabase SQL Editor에서 실행 (Part 1 of 3)
-- ============================================================

-- === 001_users_and_profiles.sql ===
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

-- === 002_voice_memos_and_reports.sql ===
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

-- === 003_swing_videos_and_pose.sql ===
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

-- === 004_feel_checks_and_observations.sql ===
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

-- === 005_coupons_and_payments.sql ===
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

-- === 006_notifications.sql ===
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

-- === 007_error_patterns_and_glossary.sql ===
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

-- === 008_rls_policies.sql ===
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

SELECT 'Part 1 complete: Core tables created' AS status;
