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
