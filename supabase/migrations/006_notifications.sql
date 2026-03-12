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
