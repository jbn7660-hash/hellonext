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
  measurement_id: string;
  token: string;
  state: 'pending' | 'verified' | 'rejected';
  created_at: string;
  expires_at: string;
  reviewer_id?: string | null;
}

interface MeasurementStateRecord {
  id: string;
  measurement_id: string;
  state: 'confirmed' | 'pending_verification' | 'hidden';
  confidence_score: number;
  created_at: string;
  updated_at?: string;
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
  measurement_id: string;
  response_type: VerificationResponseType;
  measurement_state_updated: string;
  new_state: string;
  confidence_score?: number;
}

// ─── Constants ───────────────────────────────────────────────────

const CONFIDENCE_THRESHOLD_T1 = 0.7; // Threshold for 'confirmed'
const CONFIDENCE_THRESHOLD_T2 = 0.4; // Threshold for 'pending_verification' vs 'hidden'
const K_PARAMETER_DEFAULT = 0.85;

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
 * Validate verification token and check expiration (24h).
 * Per Patent 3 Claim 1(e): Authorization check and token validation.
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

  // Check expiration (24h from creation)
  const expiresAt = new Date(record.expires_at);
  const now = new Date();
  if (now > expiresAt) {
    console.warn(`[verification-handler] Token expired: ${token}, expired at ${record.expires_at}`);
    return null;
  }

  // Check state (should be 'pending')
  if (record.state !== 'pending') {
    console.warn(`[verification-handler] Token already processed: ${token}, state=${record.state}`);
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
 */
function recalculateConfidence(
  baseMeasurement: Record<string, number>,
  correctedValues: CorrectedMeasurement,
  k: number
): number {
  const keypointVis = correctedValues.keypoint_visibility ?? baseMeasurement.keypoint_visibility;
  const camAngle = correctedValues.camera_angle_quality ?? baseMeasurement.camera_angle_quality;
  const motionBlur =
    1 - (correctedValues.motion_blur_factor ?? baseMeasurement.motion_blur_factor);
  const occlusion = 1 - (correctedValues.occlusion_factor ?? baseMeasurement.occlusion_factor);

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
 * - confirm: Mark measurement_states as confirmed, update verification_queue status
 * - correct: Accept corrected values, recalculate confidence, update states
 * - reject: Mark measurement_states as hidden, update verification_queue status
 *
 * @param supabase - Supabase admin client
 * @param token - Verification token
 * @param responseType - Response type (confirm/correct/reject)
 * @param correctedValues - Corrected measurement values (for 'correct' operation)
 * @param reviewerId - ID of pro performing verification (for authorization)
 * @returns Verification result with updated measurement state
 * @throws Error if token invalid, authorization fails, or database operations fail
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

  const measurementId = verificationRecord.measurement_id;

  // Fetch current measurement state
  const { data: currentState, error: stateError } = await supabase
    .from('measurement_states')
    .select('*')
    .eq('measurement_id', measurementId)
    .single();

  if (stateError || !currentState) {
    throw new Error(`Measurement state not found: ${measurementId}`);
  }

  let newState: 'confirmed' | 'pending_verification' | 'hidden';
  let newConfidenceScore = currentState.confidence_score;

  switch (responseType) {
    case 'confirm':
      // Pro confirms measurement is correct
      // Patent 3 Claim 1(e): Update measurement_states to 'confirmed'
      newState = 'confirmed';
      console.info(`[verification-handler] Confirmed measurement ${measurementId}`);
      break;

    case 'correct':
      // Pro provides corrected values
      // Patent 3 Claim 1(e): Accept corrected values, recalculate confidence, update state
      if (!correctedValues) {
        throw new Error('Corrected values required for correct response');
      }

      // Fetch original measurement data
      const { data: measurement, error: measurementError } = await supabase
        .from('measurement_data')
        .select('*')
        .eq('id', measurementId)
        .single();

      if (measurementError || !measurement) {
        throw new Error(`Measurement data not found: ${measurementId}`);
      }

      // Recalculate confidence with corrected values (DC-2 formula)
      const k = getKParameter();
      newConfidenceScore = recalculateConfidence(measurement, correctedValues, k);
      newState = classifyMeasurement(newConfidenceScore);

      // Update measurement_data with corrected values
      const updatePayload: Record<string, number> = {};
      if (correctedValues.keypoint_visibility !== undefined) {
        updatePayload.keypoint_visibility = correctedValues.keypoint_visibility;
      }
      if (correctedValues.camera_angle_quality !== undefined) {
        updatePayload.camera_angle_quality = correctedValues.camera_angle_quality;
      }
      if (correctedValues.motion_blur_factor !== undefined) {
        updatePayload.motion_blur_factor = correctedValues.motion_blur_factor;
      }
      if (correctedValues.occlusion_factor !== undefined) {
        updatePayload.occlusion_factor = correctedValues.occlusion_factor;
      }

      const { error: updateError } = await supabase
        .from('measurement_data')
        .update(updatePayload)
        .eq('id', measurementId);

      if (updateError) {
        console.warn(
          `[verification-handler] Failed to update measurement data: ${updateError.message}`
        );
      }

      console.info(
        `[verification-handler] Corrected measurement ${measurementId}, new confidence=${newConfidenceScore.toFixed(3)}, new state=${newState}`
      );
      break;

    case 'reject':
      // Pro rejects the measurement
      // Patent 3 Claim 1(e): Mark as 'hidden'
      newState = 'hidden';
      console.info(`[verification-handler] Rejected measurement ${measurementId}`);
      break;

    default:
      // Exhaustive check - TypeScript won't compile if cases missing
      const _exhaustiveCheck: never = responseType;
      throw new Error(`Unknown response type: ${_exhaustiveCheck}`);
  }

  // Update measurement_states
  const { data: updatedState, error: updateStateError } = await supabase
    .from('measurement_states')
    .update({
      state: newState,
      confidence_score: newConfidenceScore,
      updated_at: new Date().toISOString(),
    })
    .eq('measurement_id', measurementId)
    .select()
    .single();

  if (updateStateError) {
    throw new Error(`Failed to update measurement state: ${updateStateError.message}`);
  }

  // Update verification_queue status (Patent 3 Claim 1(e))
  const { error: tokenError } = await supabase
    .from('verification_queue')
    .update({
      state: 'verified',
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
    `[verification-handler] Verification complete: ${measurementId} → ${newState} (token marked verified, should notify member)`
  );

  return {
    token,
    measurement_id: measurementId,
    response_type: responseType,
    measurement_state_updated: updatedState?.id || '',
    new_state: newState,
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
        JSON.stringify({ error: 'Unknown operation' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!token || !response_type) {
      console.warn('[verification-handler] Missing required fields: token or response_type');
      return new Response(
        JSON.stringify({ error: 'token and response_type are required' }),
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
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const statusCode = errorMessage.includes('Invalid') || errorMessage.includes('expired')
      ? 401
      : 500;

    console.error(
      `[verification-handler] Error (${statusCode}): ${errorMessage}`,
      error instanceof Error ? error.stack : ''
    );

    return new Response(
      JSON.stringify({
        error: 'Verification processing failed',
        message: errorMessage,
      }),
      { status: statusCode, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
