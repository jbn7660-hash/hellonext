/**
 * Measurement Confidence Calculator Edge Function
 *
 * Calculates confidence scores for motion capture measurements and classifies
 * into confirmed/pending_verification/hidden states.
 *
 * Per Patent 3 Claim 1(e): 5-factor confidence formula with thresholds T1=0.7 and T2=0.4.
 * Issues verification tokens for pending_verification measurements.
 *
 * @edge-function measurement-confidence
 * @feature F-016
 * @patent Patent 3 Claim 1(e)
 * @dependencies Supabase client
 */

import { serve } from 'https://deno.land/std@0.208.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

// ─── Types ───────────────────────────────────────────────────────

interface MeasurementData {
  id: string;
  swing_id: string;
  member_id: string;
  keypoint_id: string;
  keypoint_visibility: number; // 0.0 - 1.0
  camera_angle_quality: number; // 0.0 - 1.0
  motion_blur_factor: number; // 0.0 - 1.0 (inverse: lower is better)
  occlusion_factor: number; // 0.0 - 1.0 (inverse: lower is better)
  value: number;
  timestamp: string;
}

interface ConfidenceResult {
  measurement_id: string;
  confidence_score: number;
  classification: 'confirmed' | 'pending_verification' | 'hidden';
  factors: {
    keypoint_vis: number;
    cam_angle: number;
    motion_blur: number;
    occlusion: number;
    k_factor: number;
  };
}

interface MeasurementState {
  id: string;
  measurement_id: string;
  state: 'confirmed' | 'pending_verification' | 'hidden';
  confidence_score: number;
  created_at: string;
}

interface VerificationToken {
  id: string;
  measurement_id: string;
  token: string;
  state: 'pending' | 'verified' | 'rejected';
  created_at: string;
  expires_at: string;
}

interface MeasurementConfidenceRequest {
  operation: 'calculateConfidence' | 'classifyAndStore' | 'issueVerificationTokens';
  measurement_id?: string;
  swing_id?: string;
  member_id?: string;
}

// ─── Constants ───────────────────────────────────────────────────

const CONFIDENCE_THRESHOLD_T1 = 0.7; // Threshold for 'confirmed'
const CONFIDENCE_THRESHOLD_T2 = 0.4; // Threshold for 'pending_verification' vs 'hidden'
const K_PARAMETER_DEFAULT = 0.85; // Base reliability coefficient
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
 * Generate a cryptographically secure verification token.
 * Uses crypto.getRandomValues for better randomness in Deno.
 */
function generateVerificationToken(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  let token = '';
  for (let i = 0; i < 32; i++) {
    token += chars[array[i]! % chars.length];
  }
  return token;
}

/**
 * Calculate confidence score using 5-factor formula.
 *
 * Confidence = (keypoint_visibility × camera_angle × (1 - motion_blur) × (1 - occlusion)) × K
 *
 * Where:
 * - keypoint_visibility: visibility score [0,1]
 * - camera_angle: angle quality [0,1]
 * - motion_blur_factor: blur [0,1] (inverted: 1 - blur)
 * - occlusion_factor: occlusion [0,1] (inverted: 1 - occlusion)
 * - K: reliability coefficient from env
 */
function calculateConfidenceScore(measurement: MeasurementData, k: number): ConfidenceResult {
  const keypointVis = measurement.keypoint_visibility;
  const camAngle = measurement.camera_angle_quality;
  const motionBlur = 1 - measurement.motion_blur_factor; // Invert: lower blur = higher score
  const occlusion = 1 - measurement.occlusion_factor; // Invert: lower occlusion = higher score

  const rawConfidence = keypointVis * camAngle * motionBlur * occlusion;
  const confidence = rawConfidence * k;

  // Clamp to [0, 1]
  const confidenceScore = Math.min(Math.max(confidence, 0), 1);

  return {
    measurement_id: measurement.id,
    confidence_score: confidenceScore,
    classification: 'confirmed', // Placeholder, will be set in classifyAndStore
    factors: {
      keypoint_vis: keypointVis,
      cam_angle: camAngle,
      motion_blur: motionBlur,
      occlusion: occlusion,
      k_factor: k,
    },
  };
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
 * Calculate confidence for a single measurement.
 */
async function calculateConfidence(
  supabase: ReturnType<typeof createClient>,
  measurementId: string
): Promise<ConfidenceResult> {
  console.info(`[measurement-confidence] calculateConfidence: ${measurementId}`);

  // Fetch measurement data
  const { data: measurement, error: fetchError } = await supabase
    .from('measurement_data')
    .select('*')
    .eq('id', measurementId)
    .single();

  if (fetchError || !measurement) {
    throw new Error(`Measurement not found: ${measurementId}`);
  }

  const k = getKParameter();
  const result = calculateConfidenceScore(measurement, k);

  // Classify based on thresholds
  result.classification = classifyMeasurement(result.confidence_score);

  console.info(
    `[measurement-confidence] Score=${result.confidence_score.toFixed(3)}, Classification=${result.classification}`
  );

  return result;
}

/**
 * Classify all measurements for a swing and store in measurement_states.
 */
async function classifyAndStore(
  supabase: ReturnType<typeof createClient>,
  swingId: string,
  memberId: string
): Promise<MeasurementState[]> {
  console.info(
    `[measurement-confidence] classifyAndStore: swing=${swingId}, member=${memberId}`
  );

  // Fetch all measurements for the swing
  const { data: measurements, error: fetchError } = await supabase
    .from('measurement_data')
    .select('*')
    .eq('swing_id', swingId)
    .eq('member_id', memberId);

  if (fetchError || !measurements) {
    throw new Error(`Failed to fetch measurements: ${fetchError?.message}`);
  }

  console.info(`[measurement-confidence] Processing ${measurements.length} measurements`);

  const k = getKParameter();
  const states: MeasurementState[] = [];

  for (const measurement of measurements) {
    const result = calculateConfidenceScore(measurement, k);
    const classification = classifyMeasurement(result.confidence_score);

    // Insert into measurement_states
    const { data: state, error: insertError } = await supabase
      .from('measurement_states')
      .insert({
        measurement_id: measurement.id,
        state: classification,
        confidence_score: result.confidence_score,
        created_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (insertError) {
      console.warn(
        `[measurement-confidence] Failed to insert state for ${measurement.id}: ${insertError.message}`
      );
      continue;
    }

    if (state) {
      states.push(state);
    }
  }

  console.info(`[measurement-confidence] Stored ${states.length} measurement states`);

  return states;
}

/**
 * Issue verification tokens for measurements in pending_verification state.
 */
async function issueVerificationTokens(
  supabase: ReturnType<typeof createClient>,
  swingId: string,
  memberId: string
): Promise<VerificationToken[]> {
  console.info(
    `[measurement-confidence] issueVerificationTokens: swing=${swingId}, member=${memberId}`
  );

  // Fetch all pending_verification measurements for this swing and member
  const { data: pendingStates, error: fetchError } = await supabase
    .from('measurement_states')
    .select('m:measurement_id(id, swing_id, member_id)')
    .eq('state', 'pending_verification')
    .eq('m.swing_id', swingId)
    .eq('m.member_id', memberId);

  if (fetchError) {
    console.warn(`[measurement-confidence] Failed to fetch pending measurements: ${fetchError.message}`);
    return [];
  }

  if (!pendingStates || pendingStates.length === 0) {
    console.info('[measurement-confidence] No pending measurements to verify');
    return [];
  }

  console.info(
    `[measurement-confidence] Found ${pendingStates.length} measurements awaiting verification`
  );

  const tokens: VerificationToken[] = [];
  const expiresAt = new Date();
  expiresAt.setHours(expiresAt.getHours() + TOKEN_VALIDITY_HOURS);

  for (const state of pendingStates) {
    const token = generateVerificationToken();
    const now = new Date().toISOString();

    const { data: verificationToken, error: insertError } = await supabase
      .from('verification_queue')
      .insert({
        measurement_id: state.measurement_id,
        token,
        state: 'pending',
        created_at: now,
        expires_at: expiresAt.toISOString(),
      })
      .select()
      .single();

    if (insertError) {
      console.warn(
        `[measurement-confidence] Failed to issue token for ${state.measurement_id}: ${insertError.message}`
      );
      continue;
    }

    if (verificationToken) {
      tokens.push(verificationToken);
    }
  }

  console.info(`[measurement-confidence] Issued ${tokens.length} verification tokens`);

  return tokens;
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
    const body = (await req.json()) as MeasurementConfidenceRequest;
    const { operation, measurement_id, swing_id, member_id } = body;

    console.info(`[measurement-confidence] Operation: ${operation}`);
    const supabase = createSupabaseAdmin();

    let result: unknown;

    switch (operation) {
      case 'calculateConfidence':
        if (!measurement_id) {
          return new Response(
            JSON.stringify({ error: 'measurement_id is required for calculateConfidence' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        result = await calculateConfidence(supabase, measurement_id);
        break;

      case 'classifyAndStore':
        if (!swing_id || !member_id) {
          return new Response(
            JSON.stringify({ error: 'swing_id and member_id are required for classifyAndStore' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        result = await classifyAndStore(supabase, swing_id, member_id);
        break;

      case 'issueVerificationTokens':
        if (!swing_id || !member_id) {
          return new Response(
            JSON.stringify({
              error: 'swing_id and member_id are required for issueVerificationTokens',
            }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        result = await issueVerificationTokens(supabase, swing_id, member_id);
        break;

      default:
        return new Response(
          JSON.stringify({ error: 'Unknown operation' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }

    return new Response(
      JSON.stringify({ success: true, operation, result }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('[measurement-confidence] Error:', error);

    return new Response(
      JSON.stringify({
        error: 'Confidence calculation failed',
        message: error instanceof Error ? error.message : 'Unknown error',
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
