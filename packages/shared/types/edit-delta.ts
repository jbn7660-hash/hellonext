/** Edit Delta Record (Patent 1 Claim 3) */
export interface EditDelta {
  id: string;
  decision_id: string;
  edited_fields: string[];
  original_value: Record<string, unknown>;
  edited_value: Record<string, unknown>;
  delta_value: Record<string, unknown>;
  data_quality_tier: 'tier_1' | 'tier_2' | 'tier_3';
  created_at: string;
  edited_by?: string;
}

/** Input type for creating an edit delta via API */
export interface EditDeltaCreateInput {
  decision_id: string;
  original_value: Record<string, unknown>;
  edited_value: Record<string, unknown>;
  data_quality_tier: 'tier_1' | 'tier_2' | 'tier_3';
}

/** Summary type for list views with computed fields */
export interface EditDeltaSummary {
  id: string;
  decision_id: string;
  fieldName: string;
  beforeValue: unknown;
  afterValue: unknown;
  data_quality_tier: 'tier_1' | 'tier_2' | 'tier_3';
  timestamp: string;
  relativeTime: string; // e.g., "방금 전", "5분 전", "1시간 전", "어제"
  edited_by?: string;
}

/** DC-1 Compliance: List of editable coaching_decision fields */
export const EDITABLE_FIELDS = [
  'primary_fix',
  'recommendations',
  'causal_path',
  'iis_scores',
  'detected_symptoms',
] as const;

export type EditableField = (typeof EDITABLE_FIELDS)[number];

/** Compute edit delta between original and edited coaching decisions */
export function computeEditDelta(
  original: Record<string, unknown>,
  edited: Record<string, unknown>,
  allowlistFields?: EditableField[]
): { edited_fields: string[]; delta_value: Record<string, unknown> } {
  const edited_fields: string[] = [];
  const delta_value: Record<string, unknown> = {};
  const fieldsToCheck = allowlistFields || EDITABLE_FIELDS;

  for (const key of fieldsToCheck) {
    const origVal = original[key];
    const editVal = edited[key];

    if (JSON.stringify(origVal) !== JSON.stringify(editVal)) {
      edited_fields.push(key);
      delta_value[key] = { from: origVal, to: editVal };
    }
  }

  return { edited_fields, delta_value };
}

/** Validate that edited fields are in the allowlist (DC-1 compliance) */
export function validateEditDelta(editedFields: string[]): {
  valid: boolean;
  invalidFields?: string[];
} {
  const invalid = editedFields.filter((field) => !EDITABLE_FIELDS.includes(field as EditableField));

  return {
    valid: invalid.length === 0,
    invalidFields: invalid.length > 0 ? invalid : undefined,
  };
}
