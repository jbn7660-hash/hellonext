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
