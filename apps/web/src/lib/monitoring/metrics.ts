// 특허 엔진 메트릭 수집 및 추적
// FSM, 신뢰도, 인과 그래프, 검증 메트릭

import * as Sentry from '@sentry/nextjs';

/**
 * 메트릭 저장소 (메모리 버퍼)
 * 배치 전송을 위해 메트릭을 일시적으로 저장
 */
class MetricsBuffer {
  private buffer: Map<string, number[]> = new Map();
  private maxBufferSize = 1000;
  private flushInterval = 60000; // 60초

  constructor() {
    // 주기적 플러시
    if (typeof setInterval !== 'undefined') {
      setInterval(() => this.flush(), this.flushInterval);
    }
  }

  /**
   * 메트릭 추가
   */
  add(key: string, value: number) {
    if (!this.buffer.has(key)) {
      this.buffer.set(key, []);
    }

    const values = this.buffer.get(key)!;
    values.push(value);

    // 버퍼 크기 제한
    if (values.length > this.maxBufferSize) {
      values.shift();
    }
  }

  /**
   * 통계 계산
   */
  getStats(key: string): {
    count: number;
    sum: number;
    avg: number;
    min: number;
    max: number;
    p99: number;
  } | null {
    const values = this.buffer.get(key);
    if (!values || values.length === 0) {
      return null;
    }

    const sorted = [...values].sort((a, b) => a - b);
    const count = values.length;
    const sum = values.reduce((a, b) => a + b, 0);
    const avg = sum / count;
    const min = sorted[0];
    const max = sorted[count - 1];
    const p99Index = Math.ceil(count * 0.99) - 1;
    const p99 = sorted[Math.max(0, p99Index)];

    return { count, sum, avg, min: min ?? 0, max: max ?? 0, p99: p99 ?? 0 };
  }

  /**
   * 메트릭 플러시 (Sentry로 전송)
   */
  flush() {
    for (const [key, values] of this.buffer.entries()) {
      if (values.length > 0) {
        const stats = this.getStats(key);
        if (stats) {
          this.sendToSentry(key, stats);
        }
        values.length = 0; // 버퍼 초기화
      }
    }
  }

  /**
   * Sentry로 메트릭 전송
   */
  private sendToSentry(
    key: string,
    stats: { count: number; sum: number; avg: number; min: number; max: number; p99: number }
  ) {
    Sentry.captureMessage(`Metrics: ${key}`, {
      level: 'info',
      tags: {
        'metrics.key': key,
      },
      contexts: {
        metrics: {
          count: stats.count,
          sum: stats.sum,
          average: stats.avg,
          min: stats.min,
          max: stats.max,
          p99: stats.p99,
        },
      },
    });
  }
}

// 전역 메트릭 버퍼
const metricsBuffer = new MetricsBuffer();

/**
 * 특허 엔진 메트릭 수집 함수들
 */
export const PatentMetrics = {
  // ============ FSM 전이 메트릭 ============

  /**
   * FSM 상태 전이 카운터
   * @param fromState 이전 상태
   * @param toState 새 상태
   */
  fsmTransitionCount(fromState: string, toState: string) {
    const key = `fsm.transition.${fromState}.${toState}`;
    metricsBuffer.add(key, 1);

    Sentry.addBreadcrumb({
      category: 'patent-engine.fsm',
      message: `FSM transition: ${fromState} -> ${toState}`,
      level: 'info',
      data: {
        from_state: fromState,
        to_state: toState,
      },
    });
  },

  /**
   * FSM 전이 레이턴시 (ms)
   * @param ms 소요 시간 (밀리초)
   */
  fsmTransitionLatency(ms: number) {
    metricsBuffer.add('fsm.transition.latency', ms);

    // 임계값 초과 시 경고
    if (ms > 1000) {
      Sentry.captureMessage('FSM transition slow', {
        level: 'warning',
        tags: {
          'performance.metric': 'fsm-transition-latency',
        },
        contexts: {
          performance: {
            latency_ms: ms,
            threshold_ms: 1000,
          },
        },
      });
    }
  },

  /**
   * FSM 복구 횟수
   */
  fsmRecoveryCount() {
    metricsBuffer.add('fsm.recovery.count', 1);

    Sentry.captureMessage('FSM recovery triggered', {
      level: 'warning',
      tags: {
        'patent.engine': 'fsm-controller',
        'patent.metric': 'recovery',
      },
    });
  },

  // ============ 신뢰도 메트릭 ============

  /**
   * 신뢰도 점수 분포 추적
   * @param score 신뢰도 점수 (0-1)
   * @param tier 신뢰도 티어 (low/medium/high)
   */
  confidenceDistribution(score: number, tier: string) {
    metricsBuffer.add(`confidence.score.${tier}`, score);
    metricsBuffer.add('confidence.score.all', score);

    // 낮은 신뢰도 경고
    if (score < 0.5) {
      Sentry.addBreadcrumb({
        category: 'patent-engine.confidence',
        message: `Low confidence score: ${score.toFixed(2)}`,
        level: 'warning',
        data: {
          confidence_score: score,
          tier,
        },
      });
    }
  },

  /**
   * 검증 큐 크기
   * @param count 큐에 있는 항목 수
   */
  verificationQueueSize(count: number) {
    metricsBuffer.add('verification.queue.size', count);

    // 큐 오버플로우 경고
    if (count > 10000) {
      Sentry.captureMessage('Verification queue overflow', {
        level: 'error',
        tags: {
          'patent.engine': 'verification-handler',
          'performance.queue-overflow': 'true',
        },
        contexts: {
          performance: {
            queue_size: count,
            threshold: 10000,
          },
        },
      });
    }

    // 큐 백업 경고
    if (count > 5000) {
      Sentry.addBreadcrumb({
        category: 'patent-engine.verification',
        message: `Verification queue backing up: ${count} items`,
        level: 'warning',
        data: {
          queue_size: count,
        },
      });
    }
  },

  /**
   * 검증 응답 시간
   * @param ms 응답 시간 (밀리초)
   */
  verificationResponseTime(ms: number) {
    metricsBuffer.add('verification.response-time', ms);

    // 슬로우 응답 경고
    if (ms > 5000) {
      Sentry.captureMessage('Verification response time slow', {
        level: 'warning',
        tags: {
          'performance.metric': 'verification-response-time',
        },
        contexts: {
          performance: {
            response_time_ms: ms,
            threshold_ms: 5000,
          },
        },
      });
    }
  },

  // ============ 인과 그래프 메트릭 ============

  /**
   * IIS (Importance Impact Score) 계산 시간
   * F-015 제약: 5초 이내
   * @param ms 계산 시간 (밀리초)
   */
  iisComputationTime(ms: number) {
    metricsBuffer.add('iis.computation-time', ms);

    // F-015 위반: IIS 계산이 5초 초과
    if (ms > 5000) {
      Sentry.captureMessage('IIS computation exceeded 5s timeout (F-015)', {
        level: 'error',
        tags: {
          'patent.violation': 'F-015',
          'patent.engine': 'causal-analysis',
          'performance.timeout': 'true',
        },
        contexts: {
          performance: {
            computation_time_ms: ms,
            threshold_ms: 5000,
          },
        },
      });
    }

    // 슬로우 계산 경고 (2초 초과)
    if (ms > 2000) {
      Sentry.addBreadcrumb({
        category: 'patent-engine.causal-analysis',
        message: `IIS computation slow: ${ms}ms`,
        level: 'warning',
        data: {
          computation_time_ms: ms,
        },
      });
    }
  },

  /**
   * 엣지 가중치 교정 수행 횟수
   * @param count 교정 작업 수
   */
  edgeCalibrationCount(count: number) {
    metricsBuffer.add('edge-calibration.count', count);

    if (count > 100) {
      Sentry.addBreadcrumb({
        category: 'patent-engine.edge-calibration',
        message: `Edge calibration performed: ${count} edges`,
        level: 'info',
        data: {
          calibration_count: count,
        },
      });
    }
  },

  /**
   * Primary Fix 수용 정확도 추적
   * @param accepted 수용 여부
   */
  primaryFixAccuracy(accepted: boolean) {
    metricsBuffer.add(
      accepted ? 'primary-fix.accepted' : 'primary-fix.rejected',
      1
    );

    if (!accepted) {
      Sentry.addBreadcrumb({
        category: 'patent-engine.primary-fix',
        message: 'Primary fix rejected by user',
        level: 'info',
        data: {
          accepted: false,
        },
      });
    }
  },

  // ============ 헬퍼 함수 ============

  /**
   * 특정 메트릭의 통계 조회
   * @param key 메트릭 키
   */
  getMetricStats(key: string) {
    return metricsBuffer.getStats(key);
  },

  /**
   * 모든 메트릭 플러시 (수동)
   */
  flush() {
    metricsBuffer.flush();
  },

  /**
   * 특정 메트릭의 통계를 Sentry로 전송
   * @param keys 전송할 메트릭 키들
   */
  sendStatsToSentry(keys: string[]) {
    for (const key of keys) {
      const stats = metricsBuffer.getStats(key);
      if (stats) {
        Sentry.captureMessage(`Metrics Summary: ${key}`, {
          level: 'info',
          tags: {
            'metrics.summary': 'true',
          },
          contexts: {
            metrics: stats,
          },
        });
      }
    }
  },
};

/**
 * 특허 성능 프로파일링 클래스
 * 장시간 작업의 성능을 추적
 */
export class PatentPerformanceProfiler {
  private name: string;
  private startTime: number;
  private startMemory?: NodeJS.MemoryUsage;

  constructor(name: string) {
    this.name = name;
    this.startTime = Date.now();

    // 서버사이드에서만 메모리 추적
    if (typeof process !== 'undefined' && process.memoryUsage) {
      this.startMemory = process.memoryUsage();
    }
  }

  /**
   * 프로파일링 종료 및 메트릭 기록
   */
  end(metadata?: Record<string, any>) {
    const duration = Date.now() - this.startTime;

    Sentry.addBreadcrumb({
      category: 'patent-engine.performance',
      message: `Performance profile: ${this.name}`,
      level: 'info',
      data: {
        name: this.name,
        duration_ms: duration,
        ...metadata,
      },
    });

    metricsBuffer.add(`performance.${this.name}`, duration);

    // 메모리 사용량 추적 (서버사이드)
    if (this.startMemory && typeof process !== 'undefined') {
      const endMemory = process.memoryUsage();
      const memoryDelta = {
        heapUsed: endMemory.heapUsed - this.startMemory.heapUsed,
        external: endMemory.external - this.startMemory.external,
      };

      Sentry.addBreadcrumb({
        category: 'patent-engine.memory',
        message: `Memory usage: ${this.name}`,
        level: 'debug',
        data: {
          heap_delta_bytes: memoryDelta.heapUsed,
          external_delta_bytes: memoryDelta.external,
        },
      });
    }

    return duration;
  }
}

/**
 * 타이밍 측정 헬퍼 함수
 * @param name 측정 이름
 * @param fn 실행할 함수
 */
export async function measureAsyncOperation<T>(
  name: string,
  fn: () => Promise<T>
): Promise<T> {
  const profiler = new PatentPerformanceProfiler(name);

  try {
    const result = await fn();
    profiler.end({ status: 'success' });
    return result;
  } catch (error) {
    profiler.end({ status: 'error', error: error instanceof Error ? error.message : 'Unknown' });
    throw error;
  }
}

/**
 * 동기 작업 타이밍 측정
 * @param name 측정 이름
 * @param fn 실행할 함수
 */
export function measureSyncOperation<T>(
  name: string,
  fn: () => T
): T {
  const profiler = new PatentPerformanceProfiler(name);

  try {
    const result = fn();
    profiler.end({ status: 'success' });
    return result;
  } catch (error) {
    profiler.end({ status: 'error', error: error instanceof Error ? error.message : 'Unknown' });
    throw error;
  }
}

export default PatentMetrics;
