/**
 * Seed Data for Local Development
 *
 * Creates test users, profiles, and sample data for development.
 * Run with: supabase db reset (applies migrations + seed)
 *
 * Test accounts:
 * - Pro 1: pro1@test.com (starter tier)
 * - Pro 2: pro2@test.com (pro tier)
 * - Pro 3: pro3@test.com (academy tier)
 * - Member 1-5: member{1-5}@test.com
 */

-- Note: In local dev, create users via Supabase Auth API or Dashboard.
-- The on_auth_user_created trigger auto-creates profiles.
-- Below seeds additional data assuming profiles exist.

-- ==========================================
-- Sample Pro-Member Links (after profiles are created)
-- ==========================================
-- These will be populated via the application after signup.
-- For manual seeding, use Supabase Dashboard or supabase/functions.

-- ==========================================
-- Sample Glossary Terms
-- ==========================================
-- Will be populated per-pro during onboarding.

-- ==========================================
-- Verify error_patterns seed (from migration 007)
-- ==========================================
DO $$
BEGIN
    IF (SELECT count(*) FROM public.error_patterns) != 22 THEN
        RAISE EXCEPTION 'Expected 22 error patterns, got %',
            (SELECT count(*) FROM public.error_patterns);
    END IF;
END $$;
