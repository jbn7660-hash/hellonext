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
