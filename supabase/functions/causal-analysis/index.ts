/**
 * Causal Analysis Engine Edge Function (Sprint 5 Enhanced)
 *
 * Implements the causal graph engine for symptom analysis and primary fix identification.
 *
 * Per Patent 1 Claim 1(e): Builds Layer A (raw measurements) → Layer B (derived metrics)
 * dependency model, runs reverse traversal through DAG, and computes IIS to select
 * Primary Fix as a scalar value per DC-4.
 *
 * Improvements:
 * - Input validation (session_id format, existence checks)
 * - Cycle detection in DAG (DFS-based)
 * - IIS precision clamping [0.0, 1.0] with 4 decimal places
 * - DC-4 enforcement (scalar primary_fix with deterministic tiebreaker)
 * - Progress broadcasting via Supabase Realtime
 * - Idempotency with force_rerun option
 * - Batch safety (MAX_NODES=100)
 * - Edge weight validation [0.0, 2.0]
 * - Comprehensive error codes and audit logging
 *
 * @edge-function causal-analysis
 * @feature F-015
 * @patent Patent 1 Claim 1(e)
 * @dependencies Supabase client
 */

import { serve } from 'https://deno.land/std@0.208.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

// ─── Types ───────────────────────────────────────────────────────

interface RawMeasurement {
  id: string;
  member_id: string;
  swing_id: string;
  metric_name: string;
  value: number;
  timestamp: string;
}

interface DerivedMetric {
  id: string;
  member_id: string;
  swing_id: string;
  metric_name: string;
  value: number;
  dependencies: string[];
  timestamp: string;
}

interface CausalGraphEdge {
  id: string;
  source: string;
  target: string;
  weight: number;
  tier: number;
}

interface CandidateFix {
  fix_id: string;
  name: string;
  iis_score: number;
  path_length: number;
}

interface CausalAnalysisRequest {
  operation: 'buildDependencyModel' | 'reverseTraverse' | 'createDraft';
  session_id: string; // UUID format, must reference swing_videos
  force_rerun?: boolean; // Skip idempotency check if true
}

interface PrimaryFixResult {
  fix_id: string;
  name: string;
  iis_score: number;
}

// ─── Constants ───────────────────────────────────────────────────

const IIS_THRESHOLD = 0.5; // Minimum IIS score to be considered
const DECAY_FACTOR = 0.8; // Path decay for longer causality chains
const MAX_PATH_LENGTH = 5; // Maximum steps in causal chain
const MAX_NODES = 100; // Maximum DAG nodes before rejection
const EDGE_WEIGHT_MIN = 0.0;
const EDGE_WEIGHT_MAX = 2.0;
const IIS_DECIMAL_PLACES = 4;

// Error codes per DC-5
const ERROR_CODES = {
  CA_SESSION_NOT_FOUND: { status: 404, code: 'CA_SESSION_NOT_FOUND' },
  CA_INSUFFICIENT_DATA: { status: 422, code: 'CA_INSUFFICIENT_DATA' },
  CA_DAG_CYCLE: { status: 500, code: 'CA_DAG_CYCLE' },
  CA_IIS_FAILED: { status: 500, code: 'CA_IIS_FAILED' },
  CA_VALIDATION_ERROR: { status: 400, code: 'CA_VALIDATION_ERROR' },
  CA_MAX_NODES_EXCEEDED: { status: 422, code: 'CA_MAX_NODES_EXCEEDED' },
} as const;

// Progress stages for broadcasting
type ProgressStage = 'LOADING_DATA' | 'BUILDING_DAG' | 'CYCLE_DETECTION' | 'TRAVERSING' | 'CALCULATING_IIS' | 'CREATING_DRAFT' | 'COMPLETE';

// ─── Helpers ─────────────────────────────────────────────────────

function createSupabaseAdmin() {
  const url = Deno.env.get('SUPABASE_URL');
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) throw new Error('Missing Supabase environment variables');
  return createClient(url, key);
}

/**
 * Validate UUID format (basic check).
 */
function isValidUUID(uuid: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(uuid);
}

/**
 * Clamp IIS score to [0.0, 1.0] and round to 4 decimal places.
 */
function clampIIS(score: number): number {
  const clamped = Math.max(0.0, Math.min(1.0, score));
  return Math.round(clamped * 10000) / 10000;
}

/**
 * Broadcast progress event via Supabase Realtime.
 */
async function broadcastProgress(
  supabase: ReturnType<typeof createClient>,
  sessionId: string,
  stage: ProgressStage,
  metadata?: Record<string, unknown>
): Promise<void> {
  try {
    // Post to realtime channel for analysis progress
    await supabase.channel(`causal-analysis-${sessionId}`).send('broadcast', {
      event: 'progress',
      data: {
        stage,
        timestamp: new Date().toISOString(),
        ...metadata,
      },
    });
  } catch (error) {
    // Broadcast failures should not block analysis
    console.warn(`[causal-analysis] Broadcast failed for stage ${stage}:`, error);
  }
}

/**
 * Compute Integrated Impact Score (IIS) for a candidate fix.
 * IIS = (direct_impact × relevance) + (path_length_decay)
 * Higher IIS = more likely to resolve the chain of symptoms.
 * Returns clamped [0.0, 1.0] with 4 decimal precision.
 */
function computeIIS(
  directImpact: number,
  relevance: number,
  pathLength: number
): number {
  const decay = Math.pow(DECAY_FACTOR, pathLength - 1);
  const raw = (directImpact * relevance) * decay;
  return clampIIS(raw);
}

/**
 * Build Layer A → Layer B dependency model.
 * Reads raw_measurements and computes derived_metrics from dependencies.
 */
async function buildDependencyModel(
  supabase: ReturnType<typeof createClient>,
  sessionId: string
): Promise<{ layerA: RawMeasurement[]; layerB: DerivedMetric[] }> {
  const startTime = Date.now();
  console.info(`[causal-analysis] buildDependencyModel: session=${sessionId}`);

  await broadcastProgress(supabase, sessionId, 'LOADING_DATA', { phase: 'fetching_measurements' });

  // Fetch Layer A: Raw measurements for this session
  const { data: layerA, error: layerAError } = await supabase
    .from('raw_measurements')
    .select('*')
    .eq('session_id', sessionId);

  if (layerAError) {
    throw new Error(`Failed to fetch raw measurements: ${layerAError.message}`);
  }

  console.info(`[causal-analysis] Loaded ${layerA?.length || 0} raw measurements in ${Date.now() - startTime}ms`);

  // Compute Layer B: Derived metrics from dependencies
  const derivedMetrics: DerivedMetric[] = [];

  if (layerA && layerA.length > 0) {
    // For each raw measurement, create derived metrics based on causal rules
    for (const measurement of layerA) {
      // Example: velocity_at_top depends on clubhead_speed + swing_plane
      const derived: DerivedMetric = {
        id: `derived-${measurement.id}-${Date.now()}`,
        member_id: measurement.member_id,
        swing_id: measurement.swing_id,
        metric_name: `derived_${measurement.metric_name}`,
        value: measurement.value * 1.1, // Simplified computation (normally would apply formula)
        dependencies: ['raw_' + measurement.metric_name],
        timestamp: new Date().toISOString(),
      };
      derivedMetrics.push(derived);
    }

    // Insert derived metrics into Layer B
    const { error: insertError } = await supabase
      .from('derived_metrics')
      .insert(derivedMetrics);

    if (insertError) {
      console.warn(
        `[causal-analysis] Failed to insert some derived metrics: ${insertError.message}`
      );
    }
  }

  console.info(`[causal-analysis] Generated ${derivedMetrics.length} derived metrics`);

  return {
    layerA: layerA || [],
    layerB: derivedMetrics,
  };
}

/**
 * Detect cycles in DAG using DFS (Depth-First Search).
 * Returns array of node names involved in cycle if found, empty array if no cycle.
 */
function detectCycles(edges: CausalGraphEdge[]): string[] {
  const adjList: Record<string, string[]> = {};
  const allNodes = new Set<string>();

  // Build adjacency list
  for (const edge of edges) {
    if (!adjList[edge.source]) adjList[edge.source] = [];
    adjList[edge.source].push(edge.target);
    allNodes.add(edge.source);
    allNodes.add(edge.target);
  }

  // Check for cycles using DFS
  const visited = new Set<string>();
  const recStack = new Set<string>();

  function hasCycle(node: string, path: string[]): string[] {
    visited.add(node);
    recStack.add(node);
    path.push(node);

    const neighbors = adjList[node] || [];
    for (const neighbor of neighbors) {
      if (!visited.has(neighbor)) {
        const result = hasCycle(neighbor, [...path]);
        if (result.length > 0) return result;
      } else if (recStack.has(neighbor)) {
        // Found a cycle
        const cycleStart = path.indexOf(neighbor);
        return path.slice(cycleStart).concat([neighbor]);
      }
    }

    recStack.delete(node);
    return [];
  }

  // Check each node
  for (const node of allNodes) {
    if (!visited.has(node)) {
      const cycle = hasCycle(node, []);
      if (cycle.length > 0) {
        return cycle;
      }
    }
  }

  return [];
}

/**
 * Reverse traverse causal DAG: effect → cause
 * Starting from observed symptoms, work backwards to find root causes.
 * Compute IIS for each candidate fix and select the max IIS Primary Fix.
 */
async function reverseTraverse(
  supabase: ReturnType<typeof createClient>,
  sessionId: string
): Promise<PrimaryFixResult> {
  const startTime = Date.now();
  console.info(`[causal-analysis] reverseTraverse: session=${sessionId}`);

  await broadcastProgress(supabase, sessionId, 'BUILDING_DAG', { phase: 'fetching_metrics' });

  // Fetch observed symptoms (Layer B derived metrics)
  const { data: symptoms, error: symptomsError } = await supabase
    .from('derived_metrics')
    .select('metric_name, value')
    .eq('session_id', sessionId);

  if (symptomsError || !symptoms || symptoms.length === 0) {
    throw new Error('CA_INSUFFICIENT_DATA: No symptoms found for reverse traversal');
  }

  console.info(`[causal-analysis] Identified ${symptoms.length} symptoms for traversal`);

  // Fetch causal graph edges
  await broadcastProgress(supabase, sessionId, 'BUILDING_DAG', { phase: 'loading_edges' });

  const { data: edges, error: edgesError } = await supabase
    .from('causal_graph_edges')
    .select('*');

  if (edgesError || !edges) {
    throw new Error(`Failed to fetch causal graph: ${edgesError?.message}`);
  }

  console.info(`[causal-analysis] Loaded ${edges.length} causal graph edges`);

  // Validate edge weights are in [0.0, 2.0]
  for (const edge of edges) {
    if (typeof edge.weight !== 'number' || edge.weight < EDGE_WEIGHT_MIN || edge.weight > EDGE_WEIGHT_MAX) {
      console.warn(`[causal-analysis] Edge weight out of range: ${edge.source}->${edge.target} weight=${edge.weight}`);
      // Clamp invalid weights
      edge.weight = Math.max(EDGE_WEIGHT_MIN, Math.min(EDGE_WEIGHT_MAX, edge.weight));
    }
  }

  // Check DAG node count (batch safety)
  const nodeCount = new Set(edges.flatMap(e => [e.source, e.target])).size;
  if (nodeCount > MAX_NODES) {
    throw new Error(`CA_MAX_NODES_EXCEEDED: DAG has ${nodeCount} nodes, max ${MAX_NODES}`);
  }

  // Detect cycles
  await broadcastProgress(supabase, sessionId, 'CYCLE_DETECTION', { nodes: nodeCount });
  const cycle = detectCycles(edges);
  if (cycle.length > 0) {
    console.error(`[causal-analysis] Cycle detected: ${cycle.join(' -> ')}`);
    throw new Error(`CA_DAG_CYCLE: Cycle detected in causal graph: ${cycle.join(' -> ')}`);
  }

  // Build adjacency list (effect → causes)
  const effectToCauses: Record<string, CausalGraphEdge[]> = {};
  for (const edge of edges) {
    if (!effectToCauses[edge.target]) {
      effectToCauses[edge.target] = [];
    }
    effectToCauses[edge.target].push(edge);
  }

  // Reverse traverse from symptoms to find candidate fixes
  await broadcastProgress(supabase, sessionId, 'TRAVERSING', { symptom_count: symptoms.length });

  const candidateFixes: Record<string, CandidateFix> = {};

  async function traverseEffect(effectName: string, pathLength: number, visited: Set<string> = new Set()): Promise<void> {
    if (pathLength > MAX_PATH_LENGTH || visited.has(effectName)) {
      return; // Prevent infinite traversal
    }

    visited.add(effectName);

    const causes = effectToCauses[effectName];
    if (!causes || causes.length === 0) {
      return; // No more causes to traverse
    }

    for (const edge of causes) {
      const causeName = edge.source;

      // Fetch fix metadata
      const { data: fix } = await supabase
        .from('fixes')
        .select('id, name, relevance_score')
        .eq('metric_name', causeName)
        .single();

      if (fix) {
        const iis = computeIIS(edge.weight, fix.relevance_score || 0.5, pathLength);

        if (iis > IIS_THRESHOLD) {
          const fixId = `fix-${fix.id}`;
          if (!candidateFixes[fixId] || candidateFixes[fixId].iis_score < iis) {
            candidateFixes[fixId] = {
              fix_id: fixId,
              name: fix.name,
              iis_score: iis,
              path_length: pathLength,
            };
          }
        }

        // Continue traversal up the chain (share visited set to prevent duplicate traversal)
        await traverseEffect(causeName, pathLength + 1, visited);
      }
    }
  }

  // Start traversal from each symptom
  for (const symptom of symptoms) {
    await traverseEffect(symptom.metric_name, 1);
  }

  console.info(
    `[causal-analysis] Identified ${Object.keys(candidateFixes).length} candidate fixes in ${Date.now() - startTime}ms`
  );

  // Calculate IIS for all candidates
  await broadcastProgress(supabase, sessionId, 'CALCULATING_IIS', { candidates: Object.keys(candidateFixes).length });

  // Select Primary Fix: highest IIS score (DC-4: scalar value)
  // If tie, use deterministic tiebreaker (alphabetical EP code)
  let primaryFix: PrimaryFixResult | null = null;
  let maxIIS = IIS_THRESHOLD;
  let candidateCode: string | null = null;

  for (const [code, candidate] of Object.entries(candidateFixes)) {
    const isBetter = candidate.iis_score > maxIIS ||
      (candidate.iis_score === maxIIS && (!candidateCode || code < candidateCode));

    if (isBetter) {
      maxIIS = candidate.iis_score;
      candidateCode = code;
      primaryFix = {
        fix_id: candidate.fix_id,
        name: candidate.name,
        iis_score: candidate.iis_score,
      };
    }
  }

  if (!primaryFix) {
    throw new Error('CA_IIS_FAILED: No suitable primary fix identified from causal analysis');
  }

  console.info(
    `[causal-analysis] Primary Fix selected: ${primaryFix.name} (IIS=${primaryFix.iis_score.toFixed(IIS_DECIMAL_PLACES)}) in ${Date.now() - startTime}ms`
  );

  return primaryFix;
}

/**
 * Create coaching decision with auto_draft and primary_fix (scalar).
 * DC-4 enforcement: Validates primary_fix is exactly ONE node (scalar).
 */
async function createDraft(
  supabase: ReturnType<typeof createClient>,
  sessionId: string
): Promise<{ coaching_decision_id: string; primary_fix: PrimaryFixResult }> {
  const startTime = Date.now();
  console.info(`[causal-analysis] createDraft: session=${sessionId}`);

  await broadcastProgress(supabase, sessionId, 'CREATING_DRAFT', { phase: 'fetching_session' });

  // Fetch session to get member and coach info
  const { data: session, error: sessionError } = await supabase
    .from('swing_videos')
    .select('member_id, coach_profile_id')
    .eq('id', sessionId)
    .single();

  if (sessionError || !session) {
    throw new Error('CA_SESSION_NOT_FOUND: Session not found');
  }

  // Run reverse traversal to get primary fix
  const primaryFix = await reverseTraverse(supabase, sessionId);

  // DC-4 validation: primary_fix must be scalar (single node)
  if (!primaryFix.fix_id || typeof primaryFix.fix_id !== 'string' || primaryFix.fix_id.trim() === '') {
    throw new Error('CA_IIS_FAILED: Primary fix is not a valid scalar value');
  }

  // Insert coaching decision
  const { data: decision, error: insertError } = await supabase
    .from('coaching_decisions')
    .insert({
      session_id: sessionId,
      coach_profile_id: session.coach_profile_id,
      primary_fix: primaryFix.fix_id, // DC-4: scalar value
      auto_draft: { iis_score: primaryFix.iis_score, name: primaryFix.name },
      data_quality_tier: 'tier_1', // Auto-draft is tier_1
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .select('id')
    .single();

  if (insertError) {
    throw new Error(`Failed to create coaching decision: ${insertError.message}`);
  }

  console.info(`[causal-analysis] Coaching decision created: ${decision.id} in ${Date.now() - startTime}ms`);

  await broadcastProgress(supabase, sessionId, 'COMPLETE', { decision_id: decision.id });

  return {
    coaching_decision_id: decision.id,
    primary_fix: primaryFix,
  };
}

// ─── Idempotency Check ───────────────────────────────────────

/**
 * Check if analysis already exists for this session.
 * Returns existing analysis if found and force_rerun is false.
 */
async function getExistingAnalysis(
  supabase: ReturnType<typeof createClient>,
  sessionId: string
): Promise<{ coaching_decision_id: string; primary_fix: PrimaryFixResult } | null> {
  const { data: decision, error } = await supabase
    .from('coaching_decisions')
    .select('id, primary_fix, auto_draft')
    .eq('session_id', sessionId)
    .eq('auto_draft', true) // Only return auto-draft to avoid coach edits
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (error || !decision) {
    return null;
  }

  return {
    coaching_decision_id: decision.id,
    primary_fix: {
      fix_id: decision.primary_fix,
      name: (decision.auto_draft as any)?.name || decision.primary_fix,
      iis_score: (decision.auto_draft as any)?.iis_score || 0.5,
    },
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
    const body = (await req.json()) as CausalAnalysisRequest;
    const { operation, session_id, force_rerun = false } = body;

    // Input validation
    if (!session_id) {
      return new Response(
        JSON.stringify({
          error: 'Validation error',
          code: 'CA_VALIDATION_ERROR',
          message: 'session_id is required'
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!isValidUUID(session_id)) {
      return new Response(
        JSON.stringify({
          error: 'Validation error',
          code: 'CA_VALIDATION_ERROR',
          message: 'session_id must be a valid UUID'
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.info(`[causal-analysis] Operation: ${operation} on session ${session_id}`);
    const supabase = createSupabaseAdmin();

    let result: unknown;

    // Idempotency check for createDraft
    if (operation === 'createDraft' && !force_rerun) {
      const existing = await getExistingAnalysis(supabase, session_id);
      if (existing) {
        console.info(`[causal-analysis] Returning cached analysis for session ${session_id}`);
        return new Response(
          JSON.stringify({ success: true, operation, result: existing, cached: true }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    switch (operation) {
      case 'buildDependencyModel':
        result = await buildDependencyModel(supabase, session_id);
        break;

      case 'reverseTraverse':
        result = await reverseTraverse(supabase, session_id);
        break;

      case 'createDraft':
        result = await createDraft(supabase, session_id);
        break;

      default:
        return new Response(
          JSON.stringify({
            error: 'Validation error',
            code: 'CA_VALIDATION_ERROR',
            message: 'Unknown operation'
          }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }

    return new Response(
      JSON.stringify({ success: true, operation, result, cached: false }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('[causal-analysis] Error:', error);

    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    // Extract error code from message (e.g., "CA_SESSION_NOT_FOUND: ...")
    let code = 'CA_INTERNAL_ERROR';
    let status = 500;
    let userMessage = 'Causal analysis failed';

    if (errorMessage.includes('CA_SESSION_NOT_FOUND')) {
      code = 'CA_SESSION_NOT_FOUND';
      status = 404;
      userMessage = '분석할 세션을 찾을 수 없습니다.';
    } else if (errorMessage.includes('CA_INSUFFICIENT_DATA')) {
      code = 'CA_INSUFFICIENT_DATA';
      status = 422;
      userMessage = '분석에 필요한 데이터가 부족합니다.';
    } else if (errorMessage.includes('CA_DAG_CYCLE')) {
      code = 'CA_DAG_CYCLE';
      status = 500;
      userMessage = 'Causal graph에 순환이 감지되었습니다.';
    } else if (errorMessage.includes('CA_IIS_FAILED')) {
      code = 'CA_IIS_FAILED';
      status = 500;
      userMessage = 'IIS 계산에 실패했습니다.';
    } else if (errorMessage.includes('CA_MAX_NODES_EXCEEDED')) {
      code = 'CA_MAX_NODES_EXCEEDED';
      status = 422;
      userMessage = `DAG이 최대 노드 수(${MAX_NODES})를 초과했습니다.`;
    } else if (errorMessage.includes('CA_VALIDATION_ERROR')) {
      code = 'CA_VALIDATION_ERROR';
      status = 400;
      userMessage = '입력 데이터 검증에 실패했습니다.';
    }

    return new Response(
      JSON.stringify({
        error: userMessage,
        code,
        message: errorMessage,
      }),
      { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
