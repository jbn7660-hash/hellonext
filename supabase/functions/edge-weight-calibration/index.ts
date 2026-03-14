/**
 * Edge Weight Calibration Edge Function (Sprint 5 Enhanced)
 *
 * Runs batch calibration of causal graph edge weights based on edit deltas.
 *
 * Per Patent 1 Claim 1(e) AC-4: Loads recent edit_deltas (since last calibration),
 * derives causal edges from edited_fields, applies tier-weighted coefficients
 * (tier_1=0, tier_2=1.0, tier_3=0.5), and updates edge weights in the causal graph.
 *
 * DB tables used:
 * - edit_deltas (decision_id, original_value, edited_value, edited_fields, delta_value, data_quality_tier, created_at)
 * - causal_graph_edges (from_node, to_node, weight, edge_type, calibration_count, calibrated_at)
 * - calibration_runs (timestamp, deltas_processed, edges_updated, avg_weight_change, converged, outliers_flagged)
 *
 * @edge-function edge-weight-calibration
 * @feature F-015 AC-4
 * @patent Patent 1 Claim 1(e)
 * @dependencies Supabase client
 */

import { serve } from 'https://deno.land/std@0.208.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

// ─── Types ───────────────────────────────────────────────────────

interface EditDelta {
  id: string;
  decision_id: string;
  original_value: Record<string, unknown>;
  edited_value: Record<string, unknown>;
  edited_fields: string[];
  delta_value: Record<string, unknown>; // jsonb — e.g. { magnitude: 0.15, direction: "increase" }
  data_quality_tier: string; // 'tier_1', 'tier_2', 'tier_3'
  created_at: string;
}

interface CausalGraphEdge {
  id: string;
  from_node: string;
  to_node: string;
  weight: number;
  edge_type: string;
  calibration_count: number;
  calibrated_at: string;
}

interface CalibrationResult {
  from_node: string;
  to_node: string;
  delta_count: number;
  data_quality_tier: string;
  coefficient: number;
  old_weight: number;
  new_weight: number;
  processed_delta_ids: string[];
}

interface EdgeWeightCalibrationRequest {
  operation: 'calibrate';
  batch_size?: number;
  dry_run?: boolean;
}

interface CalibrationBatchResult {
  total_edges_updated: number;
  total_deltas_processed: number;
  edges_skipped_converged: number;
  outliers_flagged: number;
  calibration_results: CalibrationResult[];
  batch_timestamp: string;
  avg_weight_change: number;
  converged: boolean;
  dry_run: boolean;
}

// ─── Constants ───────────────────────────────────────────────────

// Tier-based coefficients per Patent 1 Claim 1(e)
const TIER_COEFFICIENTS: Record<string, number> = {
  'tier_1': 0.0, // No calibration for tier 1 (foundational metrics)
  'tier_2': 1.0, // Standard calibration for tier 2
  'tier_3': 0.5, // Conservative calibration for tier 3 (speculative)
};

const DEFAULT_BATCH_SIZE = 100;
const MAX_BATCH_SIZE = 500;
const CALIBRATION_WINDOW_DAYS = 90;
const WEIGHT_CONVERGENCE_THRESHOLD = 0.001;
const SIGMA_OUTLIER_THRESHOLD = 2.0;
const EDGE_WEIGHT_MIN = 0.0;
const EDGE_WEIGHT_MAX = 2.0;

// ─── Helpers ─────────────────────────────────────────────────────

function createSupabaseAdmin() {
  const url = Deno.env.get('SUPABASE_URL');
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) throw new Error('Missing Supabase environment variables');
  return createClient(url, key);
}

function serializeError(error: unknown): string {
  if (error instanceof Error) return error.message;
  return JSON.stringify(error);
}

function calculateStats(values: number[]): { mean: number; stdDev: number } {
  if (values.length === 0) return { mean: 0, stdDev: 0 };
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length;
  return { mean, stdDev: Math.sqrt(variance) };
}

function isOutlier(value: number, mean: number, stdDev: number): boolean {
  if (stdDev === 0) return false;
  return Math.abs(value - mean) > SIGMA_OUTLIER_THRESHOLD * stdDev;
}

function getTierCoefficient(tier: string): number {
  return TIER_COEFFICIENTS[tier] ?? 0.0;
}

/**
 * Extract numeric magnitude from delta_value jsonb.
 * Supports formats: { magnitude: number }, { value: number }, or direct number encoding.
 */
function extractDeltaMagnitude(deltaValue: Record<string, unknown>): number {
  if (typeof deltaValue === 'number') return deltaValue as unknown as number;
  if (deltaValue.magnitude !== undefined && typeof deltaValue.magnitude === 'number') return deltaValue.magnitude;
  if (deltaValue.value !== undefined && typeof deltaValue.value === 'number') return deltaValue.value;
  // If it's a diff object, compute average absolute change across fields
  const numericValues = Object.values(deltaValue).filter((v): v is number => typeof v === 'number');
  if (numericValues.length > 0) {
    return numericValues.reduce((sum, v) => sum + Math.abs(v), 0) / numericValues.length;
  }
  return 0;
}

/**
 * Derive causal edge pairs from edited_fields.
 * Adjacent fields in edited_fields are treated as potential causal edges.
 * e.g. ["swing_plane", "clubhead_speed"] → [{from: "swing_plane", to: "clubhead_speed"}]
 */
function deriveEdgePairsFromFields(fields: string[]): Array<{ from_node: string; to_node: string }> {
  if (!fields || fields.length < 2) return [];
  const edges: Array<{ from_node: string; to_node: string }> = [];
  for (let i = 0; i < fields.length - 1; i++) {
    edges.push({ from_node: fields[i], to_node: fields[i + 1] });
  }
  return edges;
}

function calculateAdjustedWeight(
  currentWeight: number,
  deltaValue: number,
  coefficient: number
): number {
  const adjustment = deltaValue * coefficient;
  const newWeight = currentWeight + adjustment;
  return Math.max(EDGE_WEIGHT_MIN, Math.min(EDGE_WEIGHT_MAX, newWeight));
}

/**
 * Get the timestamp of the last calibration run to determine which deltas are new.
 */
async function getLastCalibrationTimestamp(
  supabase: ReturnType<typeof createClient>
): Promise<string | null> {
  const { data, error } = await supabase
    .from('calibration_runs')
    .select('timestamp')
    .order('timestamp', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data) return null;
  return data.timestamp;
}

// ─── Core Calibration ────────────────────────────────────────────

async function calibrate(
  supabase: ReturnType<typeof createClient>,
  batchSize: number = DEFAULT_BATCH_SIZE,
  dryRun: boolean = false
): Promise<CalibrationBatchResult> {
  const startTime = Date.now();

  if (!Number.isInteger(batchSize) || batchSize <= 0) {
    throw new Error('CALIB_VALIDATION_ERROR: batch_size must be a positive integer');
  }
  if (batchSize > MAX_BATCH_SIZE) {
    throw new Error(`CALIB_VALIDATION_ERROR: batch_size cannot exceed ${MAX_BATCH_SIZE}`);
  }

  console.info(`[edge-weight-calibration] calibrate: batch_size=${batchSize}, dry_run=${dryRun}`);

  // Calculate cutoff date (90 days ago)
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - CALIBRATION_WINDOW_DAYS);
  const cutoffISO = cutoffDate.toISOString();

  // Get last calibration timestamp to find unprocessed deltas (no 'processed' column)
  const lastCalibration = await getLastCalibrationTimestamp(supabase);
  const sinceTimestamp = lastCalibration && lastCalibration > cutoffISO ? lastCalibration : cutoffISO;

  // Fetch edit deltas created since last calibration (within window)
  const { data: deltas, error: deltaError } = await supabase
    .from('edit_deltas')
    .select('id, decision_id, original_value, edited_value, edited_fields, delta_value, data_quality_tier, created_at')
    .gte('created_at', sinceTimestamp)
    .order('created_at', { ascending: true })
    .limit(batchSize);

  if (deltaError) {
    throw new Error(`Failed to fetch edit deltas: ${deltaError.message}`);
  }

  if (!deltas || deltas.length === 0) {
    console.info(`[edge-weight-calibration] No new deltas since ${sinceTimestamp}`);
    return {
      total_edges_updated: 0,
      total_deltas_processed: 0,
      edges_skipped_converged: 0,
      outliers_flagged: 0,
      calibration_results: [],
      batch_timestamp: new Date().toISOString(),
      avg_weight_change: 0,
      converged: true,
      dry_run: dryRun,
    };
  }

  console.info(
    `[edge-weight-calibration] Fetched ${deltas.length} deltas since ${sinceTimestamp}`
  );

  // Group deltas by edge pair (derived from edited_fields)
  const deltasByEdge: Record<string, { deltas: EditDelta[]; from_node: string; to_node: string }> = {};

  for (const delta of deltas as EditDelta[]) {
    const edgePairs = deriveEdgePairsFromFields(delta.edited_fields);
    for (const pair of edgePairs) {
      const edgeKey = `${pair.from_node}->${pair.to_node}`;
      if (!deltasByEdge[edgeKey]) {
        deltasByEdge[edgeKey] = { deltas: [], from_node: pair.from_node, to_node: pair.to_node };
      }
      deltasByEdge[edgeKey].deltas.push(delta);
    }
  }

  console.info(
    `[edge-weight-calibration] Grouped into ${Object.keys(deltasByEdge).length} edge pairs`
  );

  const calibrationResults: CalibrationResult[] = [];
  const processedDeltaIds = new Set<string>();
  let totalEdgesUpdated = 0;
  let edgesSkippedConverged = 0;
  let outliersFlagged = 0;
  const weightChanges: number[] = [];

  // Process each edge pair
  for (const [edgeKey, { deltas: edgeDeltas, from_node, to_node }] of Object.entries(deltasByEdge)) {
    // Determine tier from first delta's data_quality_tier
    const tier = edgeDeltas[0]?.data_quality_tier || 'tier_2';
    const coefficient = getTierCoefficient(tier);

    console.info(
      `[edge-weight-calibration] Processing edge: ${edgeKey}, tier=${tier}, coefficient=${coefficient}`
    );

    // Fetch current edge from causal_graph_edges
    const { data: graphEdge, error: edgeError } = await supabase
      .from('causal_graph_edges')
      .select('id, from_node, to_node, weight, edge_type, calibration_count, calibrated_at')
      .eq('from_node', from_node)
      .eq('to_node', to_node)
      .maybeSingle();

    if (edgeError) {
      console.warn(
        `[edge-weight-calibration] Error fetching edge ${edgeKey}: ${serializeError(edgeError)}`
      );
      continue;
    }

    const currentWeight = graphEdge?.weight ?? 1.0;
    const oldWeight = currentWeight;

    // Calculate average delta magnitude across all deltas for this edge
    const avgDelta = edgeDeltas.reduce((sum, d) => sum + extractDeltaMagnitude(d.delta_value), 0) / edgeDeltas.length;

    // Calculate adjusted weight
    const newWeight = calculateAdjustedWeight(currentWeight, avgDelta, coefficient);
    const changeAmount = Math.abs(newWeight - oldWeight);
    weightChanges.push(changeAmount);

    // Check for convergence
    if (changeAmount < WEIGHT_CONVERGENCE_THRESHOLD && graphEdge !== null) {
      console.info(
        `[edge-weight-calibration] Edge ${edgeKey} converged (change=${changeAmount.toFixed(4)})`
      );
      edgesSkippedConverged++;
      // Still mark deltas as processed
      edgeDeltas.forEach(d => processedDeltaIds.add(d.id));
      continue;
    }

    // Statistical validation: 2-sigma outlier detection
    if (graphEdge) {
      const { data: historicalEdges } = await supabase
        .from('causal_graph_edges')
        .select('weight')
        .eq('from_node', from_node)
        .eq('to_node', to_node);

      if (historicalEdges && historicalEdges.length > 2) {
        const weights = historicalEdges.map((w: { weight: number }) => w.weight);
        const { mean, stdDev } = calculateStats(weights);

        if (isOutlier(newWeight, mean, stdDev)) {
          console.warn(
            `[edge-weight-calibration] Outlier detected: ${edgeKey}, weight=${newWeight.toFixed(3)} (mean=${mean.toFixed(3)}, σ=${stdDev.toFixed(3)})`
          );
          outliersFlagged++;
        }
      }
    }

    console.info(
      `[edge-weight-calibration] Edge: ${edgeKey}, weight: ${oldWeight.toFixed(3)} → ${newWeight.toFixed(3)} (Δ=${changeAmount.toFixed(4)})`
    );

    // Update or insert edge (unless dry_run)
    if (!dryRun) {
      const now = new Date().toISOString();
      if (graphEdge) {
        const { error: updateError } = await supabase
          .from('causal_graph_edges')
          .update({
            weight: newWeight,
            calibration_count: (graphEdge.calibration_count || 0) + 1,
            calibrated_at: now,
          })
          .eq('id', graphEdge.id);

        if (updateError) {
          console.warn(
            `[edge-weight-calibration] Failed to update edge ${graphEdge.id}: ${serializeError(updateError)}`
          );
          continue;
        }
      } else {
        // Insert new edge
        const { error: insertError } = await supabase
          .from('causal_graph_edges')
          .insert({
            from_node,
            to_node,
            weight: newWeight,
            edge_type: 'calibrated',
            calibration_count: 1,
            calibrated_at: now,
          });

        if (insertError) {
          console.warn(
            `[edge-weight-calibration] Failed to insert edge ${edgeKey}: ${serializeError(insertError)}`
          );
          continue;
        }
      }
    }

    totalEdgesUpdated++;

    calibrationResults.push({
      from_node,
      to_node,
      delta_count: edgeDeltas.length,
      data_quality_tier: tier,
      coefficient,
      old_weight: oldWeight,
      new_weight: newWeight,
      processed_delta_ids: edgeDeltas.map(d => d.id),
    });

    edgeDeltas.forEach(d => processedDeltaIds.add(d.id));
  }

  // Check convergence
  const avgWeightChange = weightChanges.length > 0
    ? weightChanges.reduce((a, b) => a + b, 0) / weightChanges.length
    : 0;
  const converged = avgWeightChange < WEIGHT_CONVERGENCE_THRESHOLD;

  console.info(
    `[edge-weight-calibration] Calibration intermediate: ${totalEdgesUpdated} edges updated, avg_change=${avgWeightChange.toFixed(4)}, converged=${converged}`
  );

  // Log calibration run metadata (serves as "last processed" marker for future runs)
  if (!dryRun) {
    const { error: logError } = await supabase
      .from('calibration_runs')
      .insert({
        timestamp: new Date().toISOString(),
        deltas_processed: processedDeltaIds.size,
        edges_updated: totalEdgesUpdated,
        avg_weight_change: avgWeightChange,
        converged,
        outliers_flagged: outliersFlagged,
      });

    if (logError) {
      console.warn(`[edge-weight-calibration] Failed to log calibration run: ${serializeError(logError)}`);
    }
  }

  console.info(
    `[edge-weight-calibration] Calibration complete: ${totalEdgesUpdated} edges, ${processedDeltaIds.size} deltas, ${edgesSkippedConverged} converged, ${outliersFlagged} outliers in ${Date.now() - startTime}ms`
  );

  return {
    total_edges_updated: totalEdgesUpdated,
    total_deltas_processed: processedDeltaIds.size,
    edges_skipped_converged: edgesSkippedConverged,
    outliers_flagged: outliersFlagged,
    calibration_results: calibrationResults,
    batch_timestamp: new Date().toISOString(),
    avg_weight_change: avgWeightChange,
    converged,
    dry_run: dryRun,
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
    const body = (await req.json()) as EdgeWeightCalibrationRequest;
    const { operation, batch_size = DEFAULT_BATCH_SIZE, dry_run = false } = body;

    if (operation !== 'calibrate') {
      return new Response(
        JSON.stringify({
          error: { code: 'CALIB_VALIDATION_ERROR', message: 'Unknown operation' }
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.info(`[edge-weight-calibration] Operation: ${operation}, batch_size=${batch_size}, dry_run=${dry_run}`);
    const supabase = createSupabaseAdmin();

    const result = await calibrate(supabase, batch_size, dry_run);

    const statusCode = result.total_deltas_processed === 0 ? 204 : 200;

    return new Response(
      JSON.stringify({ success: true, result }),
      { status: statusCode, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('[edge-weight-calibration] Error:', serializeError(error));

    const errorMessage = serializeError(error);

    let code = 'CALIB_INTERNAL_ERROR';
    let status = 500;
    let userMessage = 'Calibration failed';

    if (errorMessage.includes('CALIB_VALIDATION_ERROR')) {
      code = 'CALIB_VALIDATION_ERROR';
      status = 400;
      userMessage = '입력 데이터 검증에 실패했습니다.';
    } else if (errorMessage.includes('CALIB_LOCK_FAILED')) {
      code = 'CALIB_LOCK_FAILED';
      status = 409;
      userMessage = '동시 업데이트로 인해 잠금에 실패했습니다.';
    } else if (errorMessage.includes('CALIB_OUTLIER_DETECTED')) {
      code = 'CALIB_OUTLIER_DETECTED';
      status = 422;
      userMessage = '이상치가 감지되어 수동 검토가 필요합니다.';
    }

    return new Response(
      JSON.stringify({
        error: { code, message: userMessage, details: errorMessage },
      }),
      { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
