// 모니터링 및 관찰성 모듈 내보내기
// Sentry, 경고, 헬스체크, 메트릭 통합

// 로컬 사용을 위한 import (re-export만으로는 로컬 스코프에 바인딩되지 않음)
import { initSentry, capturePatentEvent } from './sentry-config';
import { performHealthCheck } from './health-check';

// Sentry 설정
export {
  initSentry,
  setPatentEngineContext,
  monitorFsmTransition,
  monitorIisComputation,
  monitorConfidenceCalculation,
  capturePatentEvent,
  FsmViolationError,
  LayerAImmutabilityError,
  ConfidenceCalculationError,
  DcViolationError,
} from './sentry-config';

// 경고 규칙 및 추적
export {
  PATENT_ALERT_RULES,
  trackPatentEvent,
  reportDcViolation,
  monitorFsmTransition as monitorFsmTransitionAlert,
  checkPerformanceAlert,
  registerAlertRule,
  disableAlertRule,
  type AlertRule,
  type AlertSeverity,
  type PatentAlertEvent,
} from './patent-alerts';

// 헬스체크
export {
  performHealthCheck,
  checkDatabase,
  checkAuth,
  checkPatentEngineHealth,
  checkFsmController,
  checkCausalAnalysis,
  checkMeasurementConfidence,
  checkVerificationHandler,
  checkEdgeWeightCalibration,
  checkRealtime,
  type HealthCheckResult,
  type HealthStatus,
  type PatentEngineHealth,
} from './health-check';

// 메트릭 수집
export {
  PatentMetrics,
  PatentPerformanceProfiler,
  measureAsyncOperation,
  measureSyncOperation,
} from './metrics';

/**
 * 모니터링 초기화 함수
 * 애플리케이션 시작 시 호출
 */
export function initializeMonitoring() {
  // Sentry 초기화
  try {
    initSentry();
  } catch (error) {
    console.error('Failed to initialize Sentry:', error);
  }

  // 모니터링이 활성화되었음을 로깅
  console.log('Monitoring and observability initialized');
}

/**
 * 정기적 헬스체크 시작
 * @param intervalMs 헬스체크 간격 (밀리초)
 */
export function startHealthCheckInterval(intervalMs: number = 60000) {
  if (typeof setInterval === 'undefined') {
    return; // 브라우저 환경에서는 실행하지 않음
  }

  setInterval(async () => {
    try {
      const result = await performHealthCheck();

      if (result.status !== 'healthy') {
        console.warn('Health check failed:', result.status);

        // unhealthy 상태 보고
        if (result.status === 'unhealthy') {
          capturePatentEvent(
            'System health check failed',
            'error',
            { details: result }
          );
        }
      }
    } catch (error) {
      console.error('Health check error:', error);
      capturePatentEvent(
        'Health check execution error',
        'error',
        { error: error instanceof Error ? error.message : 'Unknown' }
      );
    }
  }, intervalMs);
}

export default {
  initializeMonitoring,
  startHealthCheckInterval,
};
