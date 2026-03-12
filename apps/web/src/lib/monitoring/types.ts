// 모니터링 시스템 타입 정의

/**
 * Sentry 이벤트 심각도
 */
export type SeverityLevel = 'fatal' | 'error' | 'warning' | 'info' | 'debug';

/**
 * 경고 심각도
 */
export type AlertSeverity = 'critical' | 'high' | 'medium' | 'low';

/**
 * 헬스 상태
 */
export type HealthStatus = 'healthy' | 'degraded' | 'unhealthy';

/**
 * DC 번호 타입
 */
export type DcNumber = 1 | 2 | 3 | 4 | 5;

/**
 * FSM 상태 타입
 */
export enum FsmState {
  INITIAL = 'INITIAL',
  PENDING = 'PENDING',
  ANALYZING = 'ANALYZING',
  CALCULATING = 'CALCULATING',
  VERIFYING = 'VERIFYING',
  COMPLETED = 'COMPLETED',
  ERROR = 'ERROR',
  RECOVERING = 'RECOVERING',
}

/**
 * 특허 엔진 컴포넌트 타입
 */
export type PatentEngineComponent =
  | 'fsm-controller'
  | 'causal-analysis'
  | 'measurement-confidence'
  | 'verification-handler'
  | 'edge-weight-calibration';

/**
 * 신뢰도 티어
 */
export enum ConfidenceTier {
  LOW = 'low',      // 0 ~ 0.5
  MEDIUM = 'medium', // 0.5 ~ 0.8
  HIGH = 'high',     // 0.8 ~ 1.0
}

/**
 * 단일 헬스 상태 인터페이스
 */
export interface HealthCheckStatus {
  status: HealthStatus;
  latency?: number; // 응답 시간 (ms)
  message?: string;
  lastChecked: string;
  details?: Record<string, any>;
}

/**
 * 특허 엔진 헬스 상태
 */
export interface PatentEngineHealthStatus {
  fsmController: HealthCheckStatus;
  causalAnalysis: HealthCheckStatus;
  measurementConfidence: HealthCheckStatus;
  verificationHandler: HealthCheckStatus;
  edgeWeightCalibration: HealthCheckStatus;
}

/**
 * 전체 헬스체크 결과
 */
export interface HealthCheckResult {
  status: HealthStatus;
  version: string;
  checks: {
    database: HealthCheckStatus;
    auth: HealthCheckStatus;
    patentEngine: PatentEngineHealthStatus;
    realtime: HealthCheckStatus;
  };
  timestamp: string;
  uptime: number; // 서버 업타임 (초)
  region?: string;
}

/**
 * 경고 규칙 인터페이스
 */
export interface AlertRule {
  severity: AlertSeverity;
  description: string;
  threshold?: number;
  windowMs?: number; // 시간 윈도우 (밀리초)
  actionRequired?: boolean;
  notificationChannels?: ('email' | 'slack' | 'pagerduty' | 'sentry')[];
}

/**
 * 특허 경고 이벤트
 */
export interface PatentAlertEvent {
  ruleId: string;
  patentId: string;
  timestamp: Date;
  value?: number;
  metadata?: Record<string, any>;
  acknowledged?: boolean;
  acknowledgedBy?: string;
  acknowledgedAt?: Date;
}

/**
 * 메트릭 통계
 */
export interface MetricStats {
  count: number;
  sum: number;
  avg: number;
  min: number;
  max: number;
  p99: number;
}

/**
 * FSM 전이 이벤트
 */
export interface FsmTransitionEvent {
  patentId: string;
  fromState: FsmState;
  toState: FsmState;
  timestamp: Date;
  latency: number; // ms
  isValid: boolean;
  error?: string;
}

/**
 * 신뢰도 계산 이벤트
 */
export interface ConfidenceCalculationEvent {
  patentId: string;
  score: number;
  tier: ConfidenceTier;
  timestamp: Date;
  latency: number; // ms
  success: boolean;
  error?: string;
}

/**
 * IIS 계산 이벤트 (F-015 제약)
 */
export interface IisComputationEvent {
  patentId: string;
  timestamp: Date;
  latency: number; // ms
  timedOut: boolean; // F-015: 5초 초과 확인
  result?: {
    graphSize: number;
    nodeCount: number;
    edgeCount: number;
  };
  error?: string;
}

/**
 * 검증 이벤트
 */
export interface VerificationEvent {
  patentId: string;
  timestamp: Date;
  queueSize: number;
  queueStale: boolean; // F-016: 24시간 이상 대기 확인
  responseTime: number; // ms
  success: boolean;
  error?: string;
}

/**
 * Sentry 컨텍스트
 */
export interface SentryContext {
  patentId?: string;
  fsmState?: string;
  layer?: 'A' | 'B' | 'C';
  confidence?: number;
  dcViolations?: DcNumber[];
  engineComponent?: PatentEngineComponent;
  timestamp?: string;
}

/**
 * 경고 컨텍스트
 */
export interface AlertContext {
  patentId: string;
  severity: AlertSeverity;
  rule: string;
  value?: number;
  threshold?: number;
  message: string;
  timestamp: Date;
  metadata?: Record<string, any>;
}

/**
 * DC 위반 유형
 */
export enum DcViolationType {
  DC_1_CAUSAL_INTEGRITY = 'DC-1',
  DC_2_CONFIDENCE_CALCULATION = 'DC-2',
  DC_3_LAYER_A_IMMUTABILITY = 'DC-3',
  DC_4_EDGE_WEIGHT = 'DC-4',
  DC_5_FSM_TRANSITION = 'DC-5',
}

/**
 * 기능 제약 조건 (Functional Constraints)
 */
export enum FunctionalConstraint {
  F_015_IIS_TIMEOUT = 'F-015', // IIS 계산 5초 이내
  F_016_VERIFICATION_STALE = 'F-016', // 검증 큐 24시간 이내
  F_017_FSM_RECOVERY = 'F-017', // FSM 복구 실패 추적
}

/**
 * 성능 메트릭 타입
 */
export enum PerformanceMetricType {
  FSM_TRANSITION_LATENCY = 'fsm.transition.latency',
  IIS_COMPUTATION_TIME = 'iis.computation-time',
  CONFIDENCE_CALCULATION_TIME = 'confidence.calculation-time',
  VERIFICATION_RESPONSE_TIME = 'verification.response-time',
  EDGE_CALIBRATION_TIME = 'edge-calibration.time',
}

/**
 * 모니터링 설정 옵션
 */
export interface MonitoringConfig {
  sentryDsn: string;
  environment: 'development' | 'staging' | 'production';
  version: string;
  region?: string;
  tracesSampleRate: number;
  replaysSessionSampleRate: number;
  replaysOnErrorSampleRate: number;
  slackWebhookUrl?: string;
  pagerdutyIntegrationKey?: string;
  healthCheckInterval: number; // ms
}

/**
 * 특허 엔진 성능 프로파일
 */
export interface PatentEnginePerformanceProfile {
  name: string;
  startTime: number;
  endTime?: number;
  duration?: number;
  status: 'running' | 'completed' | 'error';
  memoryDelta?: {
    heapUsed: number;
    external: number;
  };
  metadata?: Record<string, any>;
}

/**
 * 배치 메트릭 페이로드
 */
export interface BatchMetricsPayload {
  timestamp: string;
  region: string;
  metrics: Array<{
    name: string;
    tags: Record<string, string>;
    values: number[];
    stats: MetricStats;
  }>;
}

/**
 * 에러 보고 페이로드
 */
export interface ErrorReportPayload {
  timestamp: string;
  error: {
    type: string;
    message: string;
    stack?: string;
  };
  context: SentryContext;
  violation?: {
    type: DcViolationType;
    details: Record<string, any>;
  };
}
