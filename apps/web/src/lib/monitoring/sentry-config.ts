// Sentry 초기화 설정 (v2.0 Patent Engine 모니터링 포함)
import * as Sentry from '@sentry/nextjs';

/**
 * 특허 엔진 커스텀 에러 클래스들
 * DC-1 ~ DC-5 위반 및 FSM 관련 에러 추적
 */
export class FsmViolationError extends Error {
  constructor(
    message: string,
    public fromState: string,
    public toState: string,
    public violationType: 'DC-5' | 'invalid-transition' | 'null-invariant'
  ) {
    super(message);
    this.name = 'FsmViolationError';
  }
}

export class LayerAImmutabilityError extends Error {
  constructor(
    message: string,
    public attemptedField: string,
    public violationType: 'DC-3'
  ) {
    super(message);
    this.name = 'LayerAImmutabilityError';
  }
}

export class ConfidenceCalculationError extends Error {
  constructor(
    message: string,
    public patentId: string,
    public violationType: 'DC-2'
  ) {
    super(message);
    this.name = 'ConfidenceCalculationError';
  }
}

export class DcViolationError extends Error {
  constructor(
    message: string,
    public dcNumber: 'DC-1' | 'DC-2' | 'DC-3' | 'DC-4' | 'DC-5',
    public patentId?: string
  ) {
    super(message);
    this.name = 'DcViolationError';
  }
}

/**
 * Sentry 초기화 함수
 * 프로덕션 환경에서 10%, 개발 환경에서 100% 트레이싱
 */
export function initSentry() {
  Sentry.init({
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
    environment: process.env.NODE_ENV,
    tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,

    // Debug mode (개발 환경에서만)
    debug: process.env.NODE_ENV === 'development',

    // Release 버전 설정
    release: process.env.NEXT_PUBLIC_APP_VERSION || '2.0.0',

    // 초기 에러핑거프린트 설정
    beforeSend(event, hint) {
      const error = hint.originalException;

      // DC-5 위반: FSM 비정상 전이
      if (error instanceof FsmViolationError) {
        event.fingerprint = [
          'fsm-violation',
          error.violationType,
          error.fromState,
          error.toState,
        ];
        event.tags = {
          ...event.tags,
          'patent.engine': 'fsm-controller',
          'patent.violation': error.violationType,
          'patent.from-state': error.fromState,
          'patent.to-state': error.toState,
        };
      }

      // DC-3 위반: Layer A 수정 시도
      if (error instanceof LayerAImmutabilityError) {
        event.fingerprint = [
          'layer-a-mutation',
          error.attemptedField,
        ];
        event.tags = {
          ...event.tags,
          'patent.engine': 'layer-a-immutability',
          'patent.violation': 'DC-3',
          'patent.attempted-field': error.attemptedField,
        };
      }

      // DC-2 위반: 신뢰도 계산 실패
      if (error instanceof ConfidenceCalculationError) {
        event.fingerprint = [
          'confidence-calculation-failure',
          error.patentId,
        ];
        event.tags = {
          ...event.tags,
          'patent.engine': 'measurement-confidence',
          'patent.violation': 'DC-2',
          'patent.patent-id': error.patentId,
        };
      }

      // DC-1~DC-5 위반
      if (error instanceof DcViolationError) {
        event.fingerprint = [
          'dc-violation',
          error.dcNumber,
          error.patentId || 'unknown',
        ];
        event.tags = {
          ...event.tags,
          'patent.engine': 'violation-detector',
          'patent.violation': error.dcNumber,
          ...(error.patentId && { 'patent.patent-id': error.patentId }),
        };
      }

      return event;
    },

    // Breadcrumb 필터링
    beforeBreadcrumb(breadcrumb, hint) {
      // 민감한 정보 제거
      if (breadcrumb.category === 'console' && breadcrumb.level === 'debug') {
        return null;
      }

      // 특허 엔진 관련 breadcrumb에 태그 추가
      if (breadcrumb.message?.includes('patent') || breadcrumb.message?.includes('fsm')) {
        breadcrumb.category = 'patent-engine';
      }

      return breadcrumb;
    },

    // 통합 설정
    integrations: [
      Sentry.replayIntegration({
        maskAllText: true,
        blockAllMedia: true,
      }),
      Sentry.captureConsoleIntegration({
        levels: ['error', 'warn'],
      }),
    ],

    // 세션 리플레이 설정
    replaysSessionSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
    replaysOnErrorSampleRate: 1.0,

    // 허용된 URL 패턴
    allowUrls: [
      /https?:\/\/(?:www\.)?arcup\.local/,
      /https?:\/\/(?:www\.)?hellonext\.io/,
    ],
  });
}

/**
 * 특허 엔진 컨텍스트를 Sentry에 추가
 * @param patentId 특허 ID
 * @param context 추가 컨텍스트
 */
export function setPatentEngineContext(
  patentId: string,
  context: {
    fsmState?: string;
    layer?: 'A' | 'B' | 'C';
    confidence?: number;
    dcViolations?: string[];
    engineComponent?: 'fsm-controller' | 'causal-analysis' | 'measurement-confidence' | 'verification-handler';
  }
) {
  Sentry.setContext('patent-engine', {
    'patent-id': patentId,
    ...context,
  });

  Sentry.setTags({
    'patent.patent-id': patentId,
    ...(context.fsmState && { 'patent.fsm-state': context.fsmState }),
    ...(context.layer && { 'patent.layer': context.layer }),
    ...(context.engineComponent && { 'patent.engine-component': context.engineComponent }),
  });
}

/**
 * FSM 전이 모니터링
 * @param fromState 이전 상태
 * @param toState 새 상태
 * @param patentId 특허 ID
 * @param duration 전이 소요 시간 (ms)
 */
export function monitorFsmTransition(
  fromState: string,
  toState: string,
  patentId: string,
  duration: number
) {
  Sentry.addBreadcrumb({
    category: 'patent-engine.fsm',
    message: `FSM transition: ${fromState} -> ${toState}`,
    level: 'info',
    data: {
      from_state: fromState,
      to_state: toState,
      patent_id: patentId,
      duration_ms: duration,
    },
  });
}

/**
 * 성능 모니터링 - IIS 계산
 * @param duration 계산 소요 시간 (ms)
 * @param patentId 특허 ID
 */
export function monitorIisComputation(duration: number, patentId: string) {
  Sentry.captureMessage(
    `IIS Computation for patent ${patentId}: ${duration}ms`,
    {
      level: 'info',
      tags: {
        'patent.engine': 'causal-analysis',
        'patent.metric': 'iis-computation',
      },
      contexts: {
        performance: {
          'computation-duration-ms': duration,
          'patent-id': patentId,
        },
      },
    }
  );
}

/**
 * 성능 모니터링 - 신뢰도 계산
 * @param duration 계산 소요 시간 (ms)
 * @param confidenceScore 계산된 신뢰도 점수
 * @param patentId 특허 ID
 */
export function monitorConfidenceCalculation(
  duration: number,
  confidenceScore: number,
  patentId: string
) {
  Sentry.addBreadcrumb({
    category: 'patent-engine.confidence',
    message: `Confidence calculation for patent ${patentId}`,
    level: 'info',
    data: {
      duration_ms: duration,
      confidence_score: confidenceScore,
      patent_id: patentId,
    },
  });
}

/**
 * Sentry에 이벤트 캡처 (커스텀)
 * @param message 메시지
 * @param level 로그 레벨
 * @param extra 추가 데이터
 */
export function capturePatentEvent(
  message: string,
  level: Sentry.SeverityLevel,
  extra?: Record<string, any>
) {
  Sentry.captureMessage(message, {
    level,
    tags: {
      'source': 'patent-engine',
    },
    extra,
  });
}

export default Sentry;
