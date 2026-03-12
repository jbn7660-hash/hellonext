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
