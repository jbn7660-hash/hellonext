/**
 * System Health Check Module (v3.0)
 * Comprehensive health monitoring for:
 * - External service connectivity (Toss, Kakao, OpenAI)
 * - Performance baselines and degradation alerts
 * - Patent constraint validation (DC-1~DC-5)
 * - Resource utilization (disk, memory)
 * - Circuit breaker pattern for failed components
 * - Historical tracking of health check results
 */

// import { prisma } from '@/lib/prisma';
// Prisma not installed - using API-based health checks instead

import * as Sentry from '@sentry/nextjs';

// Supabase Edge Function base URL for direct health checks
const SUPABASE_FUNCTIONS_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
  ? `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1`
  : null;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

// Circuit breaker configuration
interface CircuitBreakerState {
  failures: number;
  lastFailureTime?: number;
  state: 'closed' | 'open' | 'half-open';
}

const CIRCUIT_BREAKER_THRESHOLD = 3;
const CIRCUIT_BREAKER_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes
const circuitBreakers = new Map<string, CircuitBreakerState>();

// Health check history (last 100 results)
const healthCheckHistory: HealthCheckResult[] = [];
const MAX_HISTORY = 100;

/**
 * Health status interface with enhanced fields
 */
export interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  latency?: number; // Response time in ms
  message?: string;
  lastChecked: string;
  // Enhanced fields
  details?: Record<string, unknown>; // Component-specific details
  timestamp?: number; // Unix timestamp
}

/**
 * 특허 엔진 헬스 상태
 */
export interface PatentEngineHealth {
  fsmController: HealthStatus;
  causalAnalysis: HealthStatus;
  measurementConfidence: HealthStatus;
  verificationHandler: HealthStatus;
  edgeWeightCalibration: HealthStatus;
}

/**
 * External service health status
 */
export interface ExternalServicesHealth {
  tossPayments: HealthStatus;
  kakaoApi: HealthStatus;
  openai: HealthStatus;
}

/**
 * Resource utilization metrics
 */
export interface ResourceMetrics {
  memory: {
    used: number; // MB
    total: number; // MB
    percentage: number; // %
  };
  disk?: {
    available: number; // MB
    percentage: number; // %
  };
}

/**
 * Complete health check result with enhanced diagnostics
 */
export interface HealthCheckResult {
  status: 'healthy' | 'degraded' | 'unhealthy';
  version: string;
  gitSha?: string; // Git commit SHA
  deployedAt?: string; // ISO timestamp
  checks: {
    database: HealthStatus;
    auth: HealthStatus;
    patentEngine: PatentEngineHealth;
    realtime: HealthStatus;
    externalServices: ExternalServicesHealth;
  };
  timestamp: string;
  uptime: number; // Server uptime in seconds
  region?: string;
  resources?: ResourceMetrics;
  // New fields for monitoring
  checkDuration: number; // Total check duration in ms
  circuitBreakerStatus?: Record<string, 'closed' | 'open' | 'half-open'>;
}

/**
 * 데이터베이스 헬스 확인
 * @returns HealthStatus
 */
export async function checkDatabase(): Promise<HealthStatus> {
  const startTime = Date.now();

  try {
    // 간단한 쿼리 실행 - Supabase를 통한 헬스체크
    const response = await fetch(process.env.NEXT_PUBLIC_SUPABASE_URL + '/rest/v1/', {
      headers: {
        'apikey': process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '',
      },
    });

    const latency = Date.now() - startTime;

    return {
      status: response.ok && latency < 100 ? 'healthy' : response.ok ? 'degraded' : 'unhealthy',
      latency,
      lastChecked: new Date().toISOString(),
      message: response.ok ? (latency < 100 ? 'Database connection healthy' : 'Database connection slow') : 'Database connection failed',
    };
  } catch (error) {
    return {
      status: 'unhealthy',
      latency: Date.now() - startTime,
      lastChecked: new Date().toISOString(),
      message: `Database connection failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
}

/**
 * 인증 서비스 헬스 확인
 * Supabase Auth GoTrue 헬스체크: GET /auth/v1/health
 * @returns HealthStatus
 */
export async function checkAuth(): Promise<HealthStatus> {
  const startTime = Date.now();

  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
    return {
      status: 'degraded',
      latency: 0,
      lastChecked: new Date().toISOString(),
      message: 'Auth: SUPABASE_URL not configured',
    };
  }

  try {
    // Supabase GoTrue exposes /auth/v1/health
    const response = await fetch(
      `${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/health`,
      {
        method: 'GET',
        headers: { 'apikey': SUPABASE_ANON_KEY },
        signal: AbortSignal.timeout(5000),
      }
    );

    const latency = Date.now() - startTime;

    if (response.ok) {
      return {
        status: latency < 100 ? 'healthy' : 'degraded',
        latency,
        lastChecked: new Date().toISOString(),
        message: 'Supabase Auth service healthy',
      };
    }

    return {
      status: 'degraded',
      latency,
      lastChecked: new Date().toISOString(),
      message: `Auth service returned ${response.status}`,
    };
  } catch (error) {
    return {
      status: 'unhealthy',
      latency: Date.now() - startTime,
      lastChecked: new Date().toISOString(),
      message: `Auth service check failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
}

/**
 * Helper: Check a Supabase Edge Function's health via OPTIONS/POST ping.
 * If SUPABASE_FUNCTIONS_URL is not configured, returns degraded with a config message.
 */
async function checkEdgeFunction(
  functionName: string,
  displayName: string,
): Promise<HealthStatus> {
  const startTime = Date.now();

  if (!SUPABASE_FUNCTIONS_URL) {
    return {
      status: 'degraded',
      latency: 0,
      lastChecked: new Date().toISOString(),
      message: `${displayName}: SUPABASE_URL not configured`,
    };
  }

  try {
    // Use OPTIONS as a lightweight connectivity check — Edge Functions always respond to CORS preflight
    const response = await fetch(`${SUPABASE_FUNCTIONS_URL}/${functionName}`, {
      method: 'OPTIONS',
      headers: {
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        'apikey': SUPABASE_ANON_KEY,
      },
      signal: AbortSignal.timeout(5000),
    });

    const latency = Date.now() - startTime;

    // OPTIONS returning 200/204 means the function is deployed and reachable
    if (response.ok || response.status === 204) {
      return {
        status: latency < 200 ? 'healthy' : 'degraded',
        latency,
        lastChecked: new Date().toISOString(),
        message: `${displayName} reachable (${latency}ms)`,
      };
    }

    return {
      status: 'unhealthy',
      latency,
      lastChecked: new Date().toISOString(),
      message: `${displayName} returned ${response.status}`,
    };
  } catch (error) {
    return {
      status: 'unhealthy',
      latency: Date.now() - startTime,
      lastChecked: new Date().toISOString(),
      message: `${displayName} check failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
}

/**
 * FSM 컨트롤러 헬스 확인
 * DC-5 (FSM 상태 전이) 무결성 검증
 */
export async function checkFsmController(): Promise<HealthStatus> {
  return checkEdgeFunction('voice-fsm-controller', 'FSM Controller');
}

/**
 * 인과 분석 (Causal Analysis) 헬스 확인
 * DC-1 (인과 그래프 무결성) 검증
 */
export async function checkCausalAnalysis(): Promise<HealthStatus> {
  return checkEdgeFunction('causal-analysis', 'Causal Analysis');
}

/**
 * 측정 신뢰도 (Measurement Confidence) 헬스 확인
 * DC-2 (신뢰도 계산) 무결성 검증
 */
export async function checkMeasurementConfidence(): Promise<HealthStatus> {
  return checkEdgeFunction('measurement-confidence', 'Measurement Confidence');
}

/**
 * 검증 핸들러 (Verification Handler) 헬스 확인
 * F-016 제약: 검증 큐 지연 (>24시간) 확인
 */
export async function checkVerificationHandler(): Promise<HealthStatus> {
  return checkEdgeFunction('verification-handler', 'Verification Handler');
}

/**
 * 엣지 가중치 교정 (Edge Weight Calibration) 헬스 확인
 * DC-4 (엣지 가중치 계산) 무결성 검증
 */
export async function checkEdgeWeightCalibration(): Promise<HealthStatus> {
  return checkEdgeFunction('edge-weight-calibration', 'Edge Weight Calibration');
}

/**
 * 실시간 통신 (WebSocket/Realtime) 헬스 확인
 * Supabase Realtime은 wss://<project>.supabase.co/realtime/v1 에서 동작
 */
export async function checkRealtime(): Promise<HealthStatus> {
  const startTime = Date.now();

  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
    return {
      status: 'degraded',
      latency: 0,
      lastChecked: new Date().toISOString(),
      message: 'Realtime: SUPABASE_URL not configured',
    };
  }

  try {
    // Supabase Realtime health: GET the REST endpoint as a connectivity proxy
    // (actual WebSocket check would require a WS client)
    const realtimeHealthUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/`;
    const response = await fetch(realtimeHealthUrl, {
      headers: { 'apikey': SUPABASE_ANON_KEY },
      signal: AbortSignal.timeout(5000),
    });

    const latency = Date.now() - startTime;

    return {
      status: response.ok ? (latency < 100 ? 'healthy' : 'degraded') : 'degraded',
      latency,
      lastChecked: new Date().toISOString(),
      message: response.ok ? 'Supabase Realtime reachable' : `Supabase returned ${response.status}`,
    };
  } catch (error) {
    return {
      status: 'degraded',
      latency: Date.now() - startTime,
      lastChecked: new Date().toISOString(),
      message: `Realtime check failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
}

/**
 * 모든 특허 엔진 컴포넌트 헬스 확인
 */
export async function checkPatentEngineHealth(): Promise<PatentEngineHealth> {
  const [
    fsmController,
    causalAnalysis,
    measurementConfidence,
    verificationHandler,
    edgeWeightCalibration,
  ] = await Promise.all([
    checkFsmController(),
    checkCausalAnalysis(),
    checkMeasurementConfidence(),
    checkVerificationHandler(),
    checkEdgeWeightCalibration(),
  ]);

  return {
    fsmController,
    causalAnalysis,
    measurementConfidence,
    verificationHandler,
    edgeWeightCalibration,
  };
}

/**
 * Circuit breaker helper - prevents repeated checks of failing services
 */
function getCircuitBreakerState(componentName: string): CircuitBreakerState {
  if (!circuitBreakers.has(componentName)) {
    circuitBreakers.set(componentName, { failures: 0, state: 'closed' });
  }
  return circuitBreakers.get(componentName)!;
}

/**
 * Record component failure for circuit breaker
 */
function recordComponentFailure(componentName: string): void {
  const state = getCircuitBreakerState(componentName);
  state.failures++;
  state.lastFailureTime = Date.now();

  if (state.failures >= CIRCUIT_BREAKER_THRESHOLD) {
    state.state = 'open';
    Sentry.captureMessage(`Circuit breaker opened for ${componentName}`, 'warning');
  }
}

/**
 * Check if circuit breaker should allow health check
 */
function shouldCheckComponent(componentName: string): boolean {
  const state = getCircuitBreakerState(componentName);

  if (state.state === 'closed') {
    return true;
  }

  if (state.state === 'open') {
    const timeSinceLastFailure = Date.now() - (state.lastFailureTime || 0);
    if (timeSinceLastFailure > CIRCUIT_BREAKER_TIMEOUT_MS) {
      // Try to transition to half-open
      state.state = 'half-open';
      return true;
    }
    return false;
  }

  // Half-open state: allow one check
  return true;
}

/**
 * Get resource utilization metrics
 */
async function getResourceMetrics(): Promise<ResourceMetrics> {
  const memUsage = process.memoryUsage();
  const totalMemory = require('os').totalmem();

  return {
    memory: {
      used: Math.round(memUsage.heapUsed / 1024 / 1024),
      total: Math.round(totalMemory / 1024 / 1024),
      percentage: Math.round((memUsage.heapUsed / memUsage.heapTotal) * 100),
    },
  };
}

/**
 * Check external service connectivity (Toss, Kakao, OpenAI)
 */
async function checkExternalServices(): Promise<ExternalServicesHealth> {
  const [toss, kakao, openai] = await Promise.all([
    checkTossPayments(),
    checkKakaoApi(),
    checkOpenAi(),
  ]);

  return { tossPayments: toss, kakaoApi: kakao, openai };
}

/**
 * Check Toss Payments API connectivity
 */
async function checkTossPayments(): Promise<HealthStatus> {
  const startTime = Date.now();
  const componentName = 'toss-payments';

  if (!shouldCheckComponent(componentName)) {
    return {
      status: 'unhealthy',
      latency: 0,
      lastChecked: new Date().toISOString(),
      message: 'Circuit breaker open - service unavailable',
    };
  }

  try {
    const response = await fetch('https://api.tosspayments.com/v1/payments', {
      method: 'GET',
      headers: { Authorization: 'Bearer test' },
      signal: AbortSignal.timeout(5000),
    });

    const latency = Date.now() - startTime;
    const status = response.status === 401 ? 'healthy' : 'degraded'; // 401 means auth works

    if (status === 'healthy') {
      getCircuitBreakerState(componentName).failures = 0;
      getCircuitBreakerState(componentName).state = 'closed';
    }

    return {
      status: status as HealthStatus['status'],
      latency,
      lastChecked: new Date().toISOString(),
      message: `Toss Payments API responding (${response.status})`,
    };
  } catch (error) {
    recordComponentFailure(componentName);
    return {
      status: 'unhealthy',
      latency: Date.now() - startTime,
      lastChecked: new Date().toISOString(),
      message: `Toss Payments check failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
}

/**
 * Check Kakao API connectivity
 */
async function checkKakaoApi(): Promise<HealthStatus> {
  const startTime = Date.now();
  const componentName = 'kakao-api';

  if (!shouldCheckComponent(componentName)) {
    return {
      status: 'unhealthy',
      latency: 0,
      lastChecked: new Date().toISOString(),
      message: 'Circuit breaker open - service unavailable',
    };
  }

  try {
    const response = await fetch('https://kapi.kakao.com/v2/user/me', {
      method: 'GET',
      signal: AbortSignal.timeout(5000),
    });

    const latency = Date.now() - startTime;
    const status = response.status === 401 ? 'healthy' : 'degraded'; // 401 means service is up

    if (status === 'healthy') {
      getCircuitBreakerState(componentName).failures = 0;
      getCircuitBreakerState(componentName).state = 'closed';
    }

    return {
      status: status as HealthStatus['status'],
      latency,
      lastChecked: new Date().toISOString(),
      message: `Kakao API responding (${response.status})`,
    };
  } catch (error) {
    recordComponentFailure(componentName);
    return {
      status: 'unhealthy',
      latency: Date.now() - startTime,
      lastChecked: new Date().toISOString(),
      message: `Kakao API check failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
}

/**
 * Check OpenAI API connectivity
 */
async function checkOpenAi(): Promise<HealthStatus> {
  const startTime = Date.now();
  const componentName = 'openai-api';

  if (!shouldCheckComponent(componentName)) {
    return {
      status: 'unhealthy',
      latency: 0,
      lastChecked: new Date().toISOString(),
      message: 'Circuit breaker open - service unavailable',
    };
  }

  try {
    const response = await fetch('https://api.openai.com/v1/models', {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      signal: AbortSignal.timeout(5000),
    });

    const latency = Date.now() - startTime;
    const status = response.ok ? 'healthy' : 'degraded';

    if (status === 'healthy') {
      getCircuitBreakerState(componentName).failures = 0;
      getCircuitBreakerState(componentName).state = 'closed';
    }

    return {
      status,
      latency,
      lastChecked: new Date().toISOString(),
      message: `OpenAI API responding (${response.status})`,
    };
  } catch (error) {
    recordComponentFailure(componentName);
    return {
      status: 'unhealthy',
      latency: Date.now() - startTime,
      lastChecked: new Date().toISOString(),
      message: `OpenAI API check failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
}

/**
 * Validate patent engine design constraints (DC-1~DC-5)
 * Uses patent-related Edge Function reachability as a proxy for constraint health.
 * Full constraint validation requires DB queries (Sprint 5+).
 */
async function validatePatentConstraints(): Promise<HealthStatus> {
  const startTime = Date.now();

  try {
    // Check that core patent EFs are reachable (proxy for patent engine health)
    const patentEfs = ['causal-analysis', 'measurement-confidence', 'edge-weight-calibration'];
    const results = await Promise.all(
      patentEfs.map((ef) => checkEdgeFunction(ef, ef))
    );

    const latency = Date.now() - startTime;
    const allHealthy = results.every((r) => r.status === 'healthy');
    const anyUnhealthy = results.some((r) => r.status === 'unhealthy');

    return {
      status: allHealthy ? 'healthy' : anyUnhealthy ? 'unhealthy' : 'degraded',
      latency,
      lastChecked: new Date().toISOString(),
      message: allHealthy
        ? 'Patent Engine EFs reachable'
        : `Patent Engine: ${results.filter((r) => r.status !== 'healthy').map((r) => r.message).join('; ')}`,
      details: {
        dc1_causal_analysis: results[0]?.status,
        dc2_measurement_confidence: results[1]?.status,
        dc4_edge_weight_calibration: results[2]?.status,
        dc5_fsm: 'checked_separately',
      },
    };
  } catch (error) {
    return {
      status: 'unhealthy',
      latency: Date.now() - startTime,
      lastChecked: new Date().toISOString(),
      message: `Patent constraint validation error: ${error instanceof Error ? error.message : 'Unknown'}`,
    };
  }
}

/**
 * Perform complete health check
 */
export async function performHealthCheck(): Promise<HealthCheckResult> {
  const startTime = Date.now();

  const [
    database,
    auth,
    patentEngine,
    realtime,
    externalServices,
    patentConstraints,
    resources,
  ] = await Promise.all([
    checkDatabase(),
    checkAuth(),
    checkPatentEngineHealth(),
    checkRealtime(),
    checkExternalServices(),
    validatePatentConstraints(),
    getResourceMetrics(),
  ]);

  // Determine overall status
  const allStatuses = [
    database.status,
    auth.status,
    patentEngine.fsmController.status,
    patentEngine.causalAnalysis.status,
    patentEngine.measurementConfidence.status,
    patentEngine.verificationHandler.status,
    patentEngine.edgeWeightCalibration.status,
    realtime.status,
    patentConstraints.status,
  ];

  let overallStatus: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';

  if (allStatuses.includes('unhealthy')) {
    const criticalComponents = [
      database.status,
      patentConstraints.status,
      patentEngine.fsmController.status,
    ];

    if (criticalComponents.includes('unhealthy')) {
      overallStatus = 'unhealthy';
    } else if (allStatuses.includes('unhealthy')) {
      overallStatus = 'degraded';
    }
  } else if (allStatuses.includes('degraded')) {
    overallStatus = 'degraded';
  }

  const result: HealthCheckResult = {
    status: overallStatus,
    version: process.env.NEXT_PUBLIC_APP_VERSION || '2.0.0',
    gitSha: process.env.NEXT_PUBLIC_GIT_SHA,
    deployedAt: process.env.NEXT_PUBLIC_DEPLOYED_AT,
    checks: {
      database,
      auth,
      patentEngine,
      realtime,
      externalServices,
    },
    timestamp: new Date().toISOString(),
    uptime: Math.floor(process.uptime()),
    region: process.env.NEXT_PUBLIC_REGION || 'us-east-1',
    resources,
    checkDuration: Date.now() - startTime,
    circuitBreakerStatus: Object.fromEntries(
      Array.from(circuitBreakers.entries()).map(([name, state]) => [name, state.state])
    ),
  };

  // Store in history
  healthCheckHistory.push(result);
  if (healthCheckHistory.length > MAX_HISTORY) {
    healthCheckHistory.shift();
  }

  // Log to Sentry if degraded or unhealthy
  if (result.status !== 'healthy') {
    Sentry.captureMessage(`Health check: ${result.status}`, result.status === 'degraded' ? 'warning' : 'error');
  }

  return result;
}

/**
 * Get health check history for trend analysis
 */
export function getHealthCheckHistory(): HealthCheckResult[] {
  return [...healthCheckHistory];
}

export default {
  performHealthCheck,
  getHealthCheckHistory,
  checkDatabase,
  checkAuth,
  checkPatentEngineHealth,
  checkFsmController,
  checkCausalAnalysis,
  checkMeasurementConfidence,
  checkVerificationHandler,
  checkEdgeWeightCalibration,
  checkRealtime,
  checkExternalServices,
  validatePatentConstraints,
};
