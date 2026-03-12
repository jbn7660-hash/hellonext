/** Layer C: Coaching Decision (DC-1, DC-4 — Coach-Editable) */
export interface CoachingDecision {
  id: string;
  session_id: string;
  coach_profile_id: string;
  primary_fix: string | null; // DC-4: scalar (single node only)
  auto_draft: AutoDraft;
  coach_edited: AutoDraft | null;
  data_quality_tier: 'tier_1' | 'tier_2' | 'tier_3';
  created_at: string;
  updated_at: string;
}

/** Extended CoachingDecision with related edit deltas (DC-1 compliance) */
export interface CoachingDecisionWithDeltas extends CoachingDecision {
  edit_deltas: Array<{
    id: string;
    edited_fields: string[];
    data_quality_tier: 'tier_1' | 'tier_2' | 'tier_3';
    created_at: string;
  }>;
}

export interface AutoDraft {
  detected_symptoms: string[];
  primary_fix_candidate: string; // DC-4: scalar only (not array)
  iis_scores: Record<string, number>;
  causal_path: string[];
  recommendations: string[];
}

/** Analysis progress tracking for realtime updates */
export interface AnalysisProgress {
  stage:
    | 'initializing'
    | 'symptom_detection'
    | 'graph_construction'
    | 'iis_calculation'
    | 'primary_fix_selection'
    | 'complete';
  percentage: number; // 0-100
  message: string; // Human-readable status
}

/** DC-4 Validation: primary_fix must be scalar (single node only) */
export const DC4_PRIMARY_FIX_VALIDATION = {
  fieldName: 'primary_fix',
  description: 'Must be a scalar string representing a single error pattern node',
  constraints: {
    type: 'string',
    canBeArray: false,
    canBeNull: true,
  },
} as const;

/**
 * Validate that primary_fix is a scalar per DC-4
 * Returns error message if invalid, null if valid
 */
export function validateDC4PrimaryFix(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null; // null is allowed
  }

  if (typeof value !== 'string') {
    return `primary_fix must be a string (scalar), received ${typeof value}`;
  }

  if (Array.isArray(value)) {
    return 'primary_fix must be a scalar string, not an array (DC-4 violation)';
  }

  if (value.trim().length === 0) {
    return 'primary_fix cannot be empty if provided';
  }

  return null;
}
