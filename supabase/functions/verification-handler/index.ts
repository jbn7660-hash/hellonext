/**
 * Verification Handler Edge Function
 *
 * Processes pro verification responses for pending measurements.
 *
 * Per Patent 3 Claim 1(e) AC-5: Handles confirm/correct/reject responses
 * to update measurement state appropriately.
 *
 * @edge-function verification-handler
 * @feature F-016 AC-5
 * @patent Patent 3 Claim 1(e)
 * @dependencies Supabase client
 */

import { serve } from 'https://deno.land/std@0.208.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

// ─── Types ───────────────────────────────────────────────────────

type VerificationResponseType = 'confirm' | 'correct' | 'reject';

interface VerificationQueueRecord {
  id: string;
  measurement_state_id: string;
  token: string;
  review_state: 'pending' | 'verified' | 'rejected';
  reviewer_id: string | null;
  response_type: string | null;
  reviewed_at: string | null;
  created_at: string;
}

interface MeasurementStateRecord {
  id: string;
  measurement_id: string;
  session_id: string;
  state: string;
  confidence_score: number;
  predicted_value: Record<string, unknown> | null;
  review_state: string;
  issued_at: string;
  updated_at: string;
}

interface CorrectedMeasurement {
  keypoint_visibility?: number;
  camera_angle_quality?: number;
  motion_blur_factor?: number;
  occlusion_factor?: number;
}

interface VerificationHandlerRequest {
  operation: 'handleVerification';
  token: string;
  response_type: VerificationResponseType;
  corrected_values?: CorrectedMeasurement;
}

interface VerificationResult {
  token: string;
  measurement_state_id: string;
  response_type: VerificationResponseType;
  measurement_state_updated: string;
  new_review_state: string;
  confidence_score?: number;
}

// ─── Constants ───────────────────────────────────────────────────

const CONFIDENCE_THRESHOLD_T1 = 0.7; // Threshold for 'confirmed'
const CONFIDENCE_THRESHOLD_T2 = 0.4; // Threshold for 'pending_verification' vs 'hidden'
const K_PARAMETER_DEFAULT = 0.85;
const TOKEN_VALIDITY_HOURS = 24;

// ─── Helpers ─────────────────────────────────────────────────────

function createSupabaseAdmin() {
  const url = Deno.env.get('SUPABASE_URL');
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) throw new Error('Missing Supabase environment variables');
  return createClient(url, key);
}

/**
 * Get K parameter from environment or use default.
 */
function getKParameter(): number {
  const k = Deno.env.get('MEASUREMENT_K_PARAMETER');
  return k ? parseFloat(k) : K_PARAMETER_DEFAULT;
}

/**
 * Validate verification token.
 * Per Patent 3 Claim 1(e): Authorization check and token validation.
 *
 * Note: verification_queue has no expires_at column.
 * Token expiry is checked by comparing created_at + TOKEN_VALIDITY_HOURS against now.
 *
 * @param supabase - Supabase admin client
 * @param token - Verification token
 * @param reviewerId - ID of pro submitting verification (for authorization check)
 * @returns Verification record if valid, null if invalid/expired/unauthorized
 */
async function validateToken(
  supabase: ReturnType<typeof createClient>,
  token: string,
  reviewerId?: string
): Promise<VerificationQueueRecord | null> {
  const { data: record, error } = await supabase
    .from('verification_queue')
    .select('*')
    .eq('token', token)
    .single();

  if (error || !record) {
    console.warn(`[verification-handler] Token not found or invalid: ${token}`);
    return null;
  }

  // Check expiration: created_at + TOKEN_VALIDITY_HOURS
  const createdAt = new Date(record.created_at);
  const expiresAt = new Date(createdAt.getTime() + TOKEN_VALIDITY_HOURS * 60 * 60 * 1000);
  const now = new Date();
  if (now > expiresAt) {
    console.warn(`[verification-handler] Token expired: ${token}, created at ${record.created_at}`);
    return null;
  }

  // Check review_state (should be 'pending')
  if (record.review_state !== 'pending') {
    console.warn(`[verification-handler] Token already processed: ${token}, review_state=${record.review_state}`);
    return null;
  }

  // Authorization check: only assigned pro can verify
  if (reviewerId && record.reviewer_id && record.reviewer_id !== reviewerId) {
    console.warn(
      `[verification-handler] Authorization failed: token assigned to ${record.reviewer_id}, not ${reviewerId}`
    );
    return null;
  }

  return record;
}

/**
 * Recalculate confidence with corrected values.
 * Uses spatial_data factors from raw_measurements as base, overrides with corrected values.
 */
function recalculateConfidence(
  baseSpatialData: Record<string, number>,
  correctedValues: CorrectedMeasurement,
  k: number
): number {
  const keypointVis = correctedValues.keypoint_visibility ?? (Number(baseSpatialData.keypoint_visibility) || 0);
  const camAngle = correctedValues.camera_angle_quality ?? (Number(baseSpatialData.camera_angle_quality) || 0);
  const motionBlur =
    1 - (correctedValues.motion_blur_factor ?? (Number(baseSpatialData.motion_blur_factor) || 0));
  const occlusion = 1 - (correctedValues.occlusion_factor ?? (Number(baseSpatialData.occlusion_factor) || 0));

  const rawConfidence = keypointVis * camAngle * motionBlur * occlusion;
  const confidence = rawConfidence * k;

  return Math.min(Math.max(confidence, 0), 1);
}

/**
 * Classify measurement into confirmed/pending_verification/hidden based on thresholds.
 */
function classifyMeasurement(
  confidenceScore: number
): 'confirmed' | 'pending_verification' | 'hidden' {
  if (confidenceScore >= CONFIDENCE_THRESHOLD_T1) {
    return 'confirmed';
  } else if (confidenceScore >= CONFIDENCE_THRESHOLD_T2) {
    return 'pending_verification';
  } else {
    return 'hidden';
  }
}

/**
 * Handle verification response (Patent 3 Claim 1(e) AC-5).
 *
 * Operations:
 * - confirm: Mark measurement_states as confirmed, update verification_queue
 * - correct: Accept corrected values, recalculate confidence, store corrections
 *            in measurement_states.predicted_value (DC-1: Layer A immutable)
 * - reject: Mark measurement_states as hidden, update verification_queue
 */
async function handleVerification(
  supabase: ReturnType<typeof createClient>,
  token: string,
  responseType: VerificationResponseType,
  correctedValues?: CorrectedMeasurement,
  reviewerId?: string
): Promise<VerificationResult> {
  console.info(
    `[verification-handler] handleVerification: token=${token}, type=${responseType}, reviewerId=${reviewerId}`
  );

  // Validate token with authorization check
  const verificationRecord = await validateToken(supabase, token, reviewerId);
  if (!verificationRecord) {
    throw new Error('Invalid, expired, or unauthorized verification token');
  }

  const measurementStateId = verificationRecord.measurement_state_id;

  // Fetch current measurement state by its id
  const { data: currentState, error: stateError } = await supabase
    .from('measurement_states')
    .select('*')
    .eq('id', measurementStateId)
    .single();

  if (stateError || !currentState) {
    throw new Error(`Measurement state not found: ${measurementStateId}`);
  }

  let newReviewState: 'confirmed' | 'pending_verification' | 'hidden';
  let newConfidenceScore = currentState.confidence_score;
  let predictedValue = currentState.predicted_value;

  switch (responseType) {
    case 'confirm':
      // Pro confirms measurement is correct
      // Patent 3 Claim 1(e): Update measurement_states to 'confirmed'
      newReviewState = 'confirmed';
      console.info(`[verification-handler] Confirmed measurement_state ${measurementStateId}`);
      break;

    case 'correct': {
      // Pro provides corrected values
      // Patent 3 Claim 1(e): Accept corrected values, recalculate confidence, update state
      if (!correctedValues) {
        throw new Error('Corrected values required for correct response');
      }

      // Fetch original measurement's spatial_data from raw_measurements (Layer A, read-only)
      const { data: measurement, error: measurementError } = await supabase
        .from('raw_measurements')
        .select('spatial_data')
        .eq('id', currentState.measurement_id)
        .single();

      if (measurementError || !measurement) {
        throw new Error(`Raw measurement not found: ${currentState.measurement_id}`);
      }

      // Recalculate confidence with corrected values (DC-2 formula)
      const k = getKParameter();
      newConfidenceScore = recalculateConfidence(measurement.spatial_data, correctedValues, k);
      newReviewState = classifyMeasurement(newConfidenceScore);

      // Store corrected values in predicted_value (DC-1: Layer A immutable, corrections go to Layer C)
      predictedValue = {
        ...(predictedValue || {}),
        corrected_factors: correctedValues,
        corrected_by: reviewerId || null,
        corrected_at: new Date().toISOString(),
      };

      console.info(
        `[verification-handler] Corrected measurement_state ${measurementStateId}, new confidence=${newConfidenceScore.toFixed(3)}, new review_state=${newReviewState}`
      );
      break;
    }

    case 'reject':
      // Pro rejects the measurement
      // Patent 3 Claim 1(e): Mark as 'hidden'
      newReviewState = 'hidden';
      console.info(`[verification-handler] Rejected measurement_state ${measurementStateId}`);
      break;

    default: {
      // Exhaustive check - TypeScript won't compile if cases missing
      const _exhaustiveCheck: never = responseType;
      throw new Error(`Unknown response type: ${_exhaustiveCheck}`);
    }
  }

  // Update measurement_states
  const { data: updatedState, error: updateStateError } = await supabase
    .from('measurement_states')
    .update({
      state: newReviewState,
      confidence_score: newConfidenceScore,
      review_state: 'reviewed',
      predicted_value: predictedValue,
      updated_at: new Date().toISOString(),
    })
    .eq('id', measurementStateId)
    .select()
    .single();

  if (updateStateError) {
    throw new Error(`Failed to update measurement state: ${updateStateError.message}`);
  }

  // Update verification_queue (Patent 3 Claim 1(e))
  const { error: tokenError } = await supabase
    .from('verification_queue')
    .update({
      review_state: responseType === 'reject' ? 'rejected' : (responseType === 'correct' ? 'corrected' : 'confirmed'),
      response_type: responseType,
      reviewer_id: reviewerId || null,
      reviewed_at: new Date().toISOString(),
    })
    .eq('token', token);

  if (tokenError) {
    console.warn(`[verification-handler] Failed to mark token as verified: ${tokenError.message}`);
  }

  // TODO: Trigger notification to member on verification completion
  // This will be implemented in Sprint 3.5 with notification service
  console.info(
    `[verification-handler] Verification complete: ${measurementStateId} → ${newReviewState} (token marked, should notify member)`
  );

  return {
    token,
    measurement_state_id: measurementStateId,
    response_type: responseType,
    measurement_state_updated: updatedState?.id || '',
    new_review_state: newReviewState,
    confidence_score: newConfidenceScore,
  };
}

// ─── Main Handler ────────────────────────────────────────────────

serve(async (req: Request) => {
  const corsHeaders = {
    'Access-Control-Allow-Origin': Deno.env.get('ALLOWED_ORIGIN') ?? 'https://hellonext.app',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  };

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const body = (await req.json()) as VerificationHandlerRequest;
    const { operation, token, response_type, corrected_values } = body;

    // Get reviewer ID from request headers or body
    const authHeader = req.headers.get('authorization');
    const reviewerId = authHeader?.replace('Bearer ', '') || undefined;

    if (operation !== 'handleVerification') {
      console.warn(`[verification-handler] Unknown operation: ${operation}`);
      return new Response(
        JSON.stringify({ error: { code: 'UNKNOWN_OP', message: 'Unknown operation' } }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!token || !response_type) {
      console.warn('[verification-handler] Missing required fields: token or response_type');
      return new Response(
        JSON.stringify({ error: { code: 'MISSING_PARAM', message: 'token and response_type are required' } }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.info(`[verification-handler] Processing verification: token=${token}, response_type=${response_type}`);
    const supabase = createSupabaseAdmin();

    const result = await handleVerification(
      supabase,
      token,
      response_type,
      corrected_values,
      reviewerId
    );

    return new Response(
      JSON.stringify({ success: true, result }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : JSON.stringify(error);
    const statusCode = message.includes('Invalid') || message.includes('expired')
      ? 401
      : 500;

    console.error(
      `[verification-handler] Error (${statusCode}): ${message}`,
      error instanceof Error ? error.stack : ''
    );

    return new Response(
      JSON.stringify({
        error: {
          code: statusCode === 401 ? 'AUTH_FAILED' : 'VERIFICATION_FAILED',
          message: 'Verification processing failed',
          details: message,
        },
      }),
      { status: statusCode, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
