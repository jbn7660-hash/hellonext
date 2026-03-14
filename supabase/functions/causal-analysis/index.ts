/**
 * Causal Analysis Engine Edge Function (Sprint 5 Enhanced)
 *
 * Implements the causal graph engine for symptom analysis and primary fix identification.
 *
 * Per Patent 1 Claim 1(e): Builds causal DAG from causal_graph_edges + error_patterns,
 * runs reverse traversal through DAG, and computes IIS to select
 * Primary Fix as a scalar value per DC-4.
 *
 * DB tables used:
 * - causal_graph_edges (from_node, to_node, weight, edge_type, calibration_count, calibrated_at)
 * - error_patterns (code, name_ko, name_en, description, position, causality_parents)
 * - coaching_decisions (session_id, coach_profile_id, primary_fix, auto_draft, data_quality_tier)
 * - swing_videos (id, member_id, coach_profile_id)
 *
 * @edge-function causal-analysis
 * @feature F-015
 * @patent Patent 1 Claim 1(e)
 * @dependencies Supabase client
 */

import { serve } from 'https://deno.land/std@0.208.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

// ─── Types ───────────────────────────────────────────────────────

interface CausalGraphEdge {
  id: string;
  from_node: string;
  to_node: string;
  weight: number;
  edge_type: string;
  calibration_count: number;
  calibrated_at: string;
}

interface ErrorPattern {
  id: number;
  code: string;
  name_ko: string;
  name_en: string;
  description: string;
  position: string;
  causality_parents: Record<string, number> | null; // { parent_code: weight }
}

interface CandidateFix {
  fix_id: string;
  name: string;
  iis_score: number;
  path_length: number;
}

interface CausalAnalysisRequest {
  operation: 'buildDependencyModel' | 'reverseTraverse' | 'createDraft';
  session_id: string;
  force_rerun?: boolean;
}

interface PrimaryFixResult {
  fix_id: string;
  name: string;
  iis_score: number;
}

// ─── Constants ───────────────────────────────────────────────────

const IIS_THRESHOLD = 0.5;
const DECAY_FACTOR = 0.8;
const MAX_PATH_LENGTH = 5;
const MAX_NODES = 100;
const EDGE_WEIGHT_MIN = 0.0;
const EDGE_WEIGHT_MAX = 2.0;
const IIS_DECIMAL_PLACES = 4;

type ProgressStage = 'LOADING_DATA' | 'BUILDING_DAG' | 'CYCLE_DETECTION' | 'TRAVERSING' | 'CALCULATING_IIS' | 'CREATING_DRAFT' | 'COMPLETE';

// ─── Helpers ─────────────────────────────────────────────────────

function createSupabaseAdmin() {
  const url = Deno.env.get('SUPABASE_URL');
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) throw new Error('Missing Supabase environment variables');
  return createClient(url, key);
}

function isValidUUID(uuid: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(uuid);
}

function clampIIS(score: number): number {
  const clamped = Math.max(0.0, Math.min(1.0, score));
  return Math.round(clamped * 10000) / 10000;
}

function serializeError(error: unknown): string {
  if (error instanceof Error) return error.message;
  return JSON.stringify(error);
}

async function broadcastProgress(
  supabase: ReturnType<typeof createClient>,
  sessionId: string,
  stage: ProgressStage,
  metadata?: Record<string, unknown>
): Promise<void> {
  try {
    await supabase.channel(`causal-analysis-${sessionId}`).send('broadcast', {
      event: 'progress',
      data: {
        stage,
        timestamp: new Date().toISOString(),
        ...metadata,
      },
    });
  } catch (error) {
    console.warn(`[causal-analysis] Broadcast failed for stage ${stage}:`, serializeError(error));
  }
}

/**
 * Compute Integrated Impact Score (IIS) for a candidate fix.
 * IIS = (direct_impact × relevance) × path_length_decay
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

// ─── Core Functions ──────────────────────────────────────────────

/**
 * Build the causal DAG from causal_graph_edges + error_patterns.causality_parents.
 * Returns the full set of edges for the session's analysis context.
 */
async function buildDependencyModel(
  supabase: ReturnType<typeof createClient>,
  sessionId: string
): Promise<{ edges: CausalGraphEdge[]; errorPatterns: ErrorPattern[] }> {
  const startTime = Date.now();
  console.info(`[causal-analysis] buildDependencyModel: session=${sessionId}`);

  await broadcastProgress(supabase, sessionId, 'LOADING_DATA', { phase: 'fetching_graph' });

  // Fetch causal graph edges (the DAG)
  const { data: edges, error: edgesError } = await supabase
    .from('causal_graph_edges')
    .select('id, from_node, to_node, weight, edge_type, calibration_count, calibrated_at');

  if (edgesError) {
    throw new Error(`Failed to fetch causal graph edges: ${edgesError.message}`);
  }

  // Fetch error patterns with causality_parents for parent relationships
  const { data: errorPatterns, error: epError } = await supabase
    .from('error_patterns')
    .select('id, code, name_ko, name_en, description, position, causality_parents');

  if (epError) {
    throw new Error(`Failed to fetch error patterns: ${epError.message}`);
  }

  console.info(
    `[causal-analysis] Loaded ${edges?.length || 0} graph edges, ${errorPatterns?.length || 0} error patterns in ${Date.now() - startTime}ms`
  );

  return {
    edges: edges || [],
    errorPatterns: errorPatterns || [],
  };
}

/**
 * Detect cycles in DAG using DFS.
 * Returns array of node names involved in cycle if found, empty array if no cycle.
 */
function detectCycles(edges: CausalGraphEdge[]): string[] {
  const adjList: Record<string, string[]> = {};
  const allNodes = new Set<string>();

  for (const edge of edges) {
    if (!adjList[edge.from_node]) adjList[edge.from_node] = [];
    adjList[edge.from_node].push(edge.to_node);
    allNodes.add(edge.from_node);
    allNodes.add(edge.to_node);
  }

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
        const cycleStart = path.indexOf(neighbor);
        return path.slice(cycleStart).concat([neighbor]);
      }
    }

    recStack.delete(node);
    return [];
  }

  for (const node of allNodes) {
    if (!visited.has(node)) {
      const cycle = hasCycle(node, []);
      if (cycle.length > 0) return cycle;
    }
  }

  return [];
}

/**
 * Reverse traverse causal DAG: effect → cause.
 * Starting from observed error pattern symptoms, work backwards to find root causes.
 * Uses error_patterns.causality_parents to identify which patterns are symptoms
 * and causal_graph_edges for the DAG structure.
 * Compute IIS for each candidate fix and select the max IIS Primary Fix.
 */
async function reverseTraverse(
  supabase: ReturnType<typeof createClient>,
  sessionId: string
): Promise<PrimaryFixResult> {
  const startTime = Date.now();
  console.info(`[causal-analysis] reverseTraverse: session=${sessionId}`);

  await broadcastProgress(supabase, sessionId, 'BUILDING_DAG', { phase: 'loading_data' });

  // Build DAG
  const { edges, errorPatterns } = await buildDependencyModel(supabase, sessionId);

  if (!edges || edges.length === 0) {
    throw new Error('CA_INSUFFICIENT_DATA: No causal graph edges found');
  }

  // Validate edge weights are in [0.0, 2.0]
  for (const edge of edges) {
    if (typeof edge.weight !== 'number' || edge.weight < EDGE_WEIGHT_MIN || edge.weight > EDGE_WEIGHT_MAX) {
      console.warn(`[causal-analysis] Edge weight out of range: ${edge.from_node}->${edge.to_node} weight=${edge.weight}`);
      edge.weight = Math.max(EDGE_WEIGHT_MIN, Math.min(EDGE_WEIGHT_MAX, edge.weight || 0));
    }
  }

  // Check DAG node count (batch safety)
  const nodeCount = new Set(edges.flatMap(e => [e.from_node, e.to_node])).size;
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

  // Build reverse adjacency list: to_node → edges pointing to it (effect → causes)
  const effectToCauses: Record<string, CausalGraphEdge[]> = {};
  for (const edge of edges) {
    if (!effectToCauses[edge.to_node]) {
      effectToCauses[edge.to_node] = [];
    }
    effectToCauses[edge.to_node].push(edge);
  }

  // Build error pattern lookup by code
  const patternByCode: Record<string, ErrorPattern> = {};
  for (const ep of errorPatterns) {
    patternByCode[ep.code] = ep;
  }

  // Identify symptom nodes: nodes that are to_node (effects) in the graph
  // i.e., error patterns that appear as effects (leaf effects with no further downstream)
  const allFromNodes = new Set(edges.map(e => e.from_node));
  const allToNodes = new Set(edges.map(e => e.to_node));
  const symptomNodes = [...allToNodes].filter(n => !allFromNodes.has(n));

  // If no pure leaf symptoms, use all to_nodes as starting points
  const startNodes = symptomNodes.length > 0 ? symptomNodes : [...allToNodes];

  console.info(`[causal-analysis] Identified ${startNodes.length} symptom nodes for traversal`);

  if (startNodes.length === 0) {
    throw new Error('CA_INSUFFICIENT_DATA: No symptom nodes found for reverse traversal');
  }

  // Reverse traverse from symptoms to find candidate fixes
  await broadcastProgress(supabase, sessionId, 'TRAVERSING', { symptom_count: startNodes.length });

  const candidateFixes: Record<string, CandidateFix> = {};

  function traverseEffect(effectName: string, pathLength: number, visited: Set<string>): void {
    if (pathLength > MAX_PATH_LENGTH || visited.has(effectName)) return;

    visited.add(effectName);
    const causes = effectToCauses[effectName];
    if (!causes || causes.length === 0) return;

    for (const edge of causes) {
      const causeName = edge.from_node;
      const pattern = patternByCode[causeName];

      // Use causality_parents weight as relevance, default 0.5
      let relevance = 0.5;
      if (pattern?.causality_parents) {
        const parentWeights = Object.values(pattern.causality_parents);
        if (parentWeights.length > 0) {
          relevance = parentWeights.reduce((a, b) => a + b, 0) / parentWeights.length;
        }
      }

      const iis = computeIIS(edge.weight, relevance, pathLength);

      if (iis >= IIS_THRESHOLD) {
        const fixId = causeName; // Use error pattern code as fix identifier
        const displayName = pattern?.name_ko || pattern?.name_en || causeName;

        if (!candidateFixes[fixId] || candidateFixes[fixId].iis_score < iis) {
          candidateFixes[fixId] = {
            fix_id: fixId,
            name: displayName,
            iis_score: iis,
            path_length: pathLength,
          };
        }
      }

      // Continue traversal up the chain
      traverseEffect(causeName, pathLength + 1, new Set(visited));
    }
  }

  // Start traversal from each symptom
  for (const symptom of startNodes) {
    traverseEffect(symptom, 1, new Set());
  }

  console.info(
    `[causal-analysis] Identified ${Object.keys(candidateFixes).length} candidate fixes in ${Date.now() - startTime}ms`
  );

  // Calculate IIS for all candidates
  await broadcastProgress(supabase, sessionId, 'CALCULATING_IIS', { candidates: Object.keys(candidateFixes).length });

  // Select Primary Fix: highest IIS score (DC-4: scalar value)
  // If tie, use deterministic tiebreaker (alphabetical code)
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

async function getExistingAnalysis(
  supabase: ReturnType<typeof createClient>,
  sessionId: string
): Promise<{ coaching_decision_id: string; primary_fix: PrimaryFixResult } | null> {
  const { data: decision, error } = await supabase
    .from('coaching_decisions')
    .select('id, primary_fix, auto_draft')
    .eq('session_id', sessionId)
    .not('auto_draft', 'is', null) // Only return auto-draft decisions
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !decision) {
    return null;
  }

  return {
    coaching_decision_id: decision.id,
    primary_fix: {
      fix_id: decision.primary_fix,
      name: (decision.auto_draft as Record<string, unknown>)?.name as string || decision.primary_fix,
      iis_score: (decision.auto_draft as Record<string, unknown>)?.iis_score as number || 0.5,
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
          error: { code: 'CA_VALIDATION_ERROR', message: 'session_id is required' }
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!isValidUUID(session_id)) {
      return new Response(
        JSON.stringify({
          error: { code: 'CA_VALIDATION_ERROR', message: 'session_id must be a valid UUID' }
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
            error: { code: 'CA_VALIDATION_ERROR', message: 'Unknown operation' }
          }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }

    return new Response(
      JSON.stringify({ success: true, operation, result, cached: false }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('[causal-analysis] Error:', serializeError(error));

    const errorMessage = serializeError(error);

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
        error: { code, message: userMessage, details: errorMessage },
      }),
      { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
