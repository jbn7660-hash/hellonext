// 특허 엔진 경고 시스템
// DC-1~DC-5 위반 감지 및 알림

import * as Sentry from '@sentry/nextjs';

/**
 * 경고 규칙의 심각도 레벨
 */
export type AlertSeverity = 'critical' | 'high' | 'medium' | 'low';

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
 * 특허 엔진 경고 규칙 정의
 * DC-1~DC-5 위반, F-015~F-017 기능 제약 조건 포함
 */
export const PATENT_ALERT_RULES: Record<string, AlertRule> = {
  // DC-3: Layer A 불변성 위반 시도
  LAYER_A_MUTATION_ATTEMPT: {
    severity: 'critical',
    description: 'Layer A immutability constraint violation (DC-3)',
    actionRequired: true,
    notificationChannels: ['slack', 'pagerduty', 'sentry'],
  },

  // DC-5: FSM 비정상 전이
  FSM_INVALID_TRANSITION: {
    severity: 'critical',
    description: 'Invalid FSM state transition (DC-5)',
    actionRequired: true,
    notificationChannels: ['slack', 'pagerduty', 'sentry'],
  },

  // DC-5: target_id NULL 불변 위반
  TARGET_ID_INVARIANT_VIOLATION: {
    severity: 'critical',
    description: 'target_id NULL invariant violation (DC-5)',
    actionRequired: true,
    notificationChannels: ['slack', 'pagerduty', 'sentry'],
  },

  // DC-2: 신뢰도 계산 실패
  CONFIDENCE_CALCULATION_FAILURE: {
    severity: 'high',
    description: 'Confidence calculation failed (DC-2)',
    actionRequired: true,
    notificationChannels: ['slack', 'sentry'],
  },

  // F-015: IIS 계산 타임아웃 (>5초)
  IIS_COMPUTATION_TIMEOUT: {
    severity: 'medium',
    description: 'IIS computation exceeded 5 seconds timeout (F-015)',
    threshold: 5000, // 밀리초
    actionRequired: false,
    notificationChannels: ['sentry'],
  },

  // F-016: 검증 큐 지연 (>24시간)
  VERIFICATION_QUEUE_STALE: {
    severity: 'medium',
    description: 'Verification queue has items older than 24 hours (F-016)',
    threshold: 86400000, // 24시간 (밀리초)
    actionRequired: true,
    notificationChannels: ['slack', 'sentry'],
  },

  // F-017: FSM 복구 실패
  FSM_RECOVERY_FAILURE: {
    severity: 'high',
    description: 'FSM recovery attempt failed (F-017)',
    actionRequired: true,
    notificationChannels: ['slack', 'pagerduty', 'sentry'],
  },

  // DC-1: 인과 그래프 무결성 위반
  CAUSAL_GRAPH_INTEGRITY_VIOLATION: {
    severity: 'critical',
    description: 'Causal graph integrity constraint violated (DC-1)',
    actionRequired: true,
    notificationChannels: ['slack', 'pagerduty', 'sentry'],
  },

  // DC-4: 엣지 가중치 교정 실패
  EDGE_WEIGHT_CALIBRATION_FAILURE: {
    severity: 'high',
    description: 'Edge weight calibration calculation failed (DC-4)',
    actionRequired: true,
    notificationChannels: ['slack', 'sentry'],
  },

  // F-018: 검증 핸들러 큐 오버플로우
  VERIFICATION_QUEUE_OVERFLOW: {
    severity: 'high',
    description: 'Verification queue is backing up (>10000 items)',
    threshold: 10000,
    actionRequired: true,
    notificationChannels: ['slack', 'pagerduty', 'sentry'],
  },

  // 성능 경고
  CAUSAL_ANALYSIS_SLOW: {
    severity: 'medium',
    description: 'Causal analysis computation is slow (>2s)',
    threshold: 2000,
    actionRequired: false,
    notificationChannels: ['sentry'],
  },

  MEASUREMENT_CONFIDENCE_DEGRADED: {
    severity: 'medium',
    description: 'Measurement confidence scores below threshold (<0.6)',
    threshold: 0.6,
    actionRequired: false,
    notificationChannels: ['sentry'],
  },
};

/**
 * 경고 이벤트 추적
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
 * 특허 이벤트 추적
 * @param eventName 이벤트 이름
 * @param patentId 특허 ID
 * @param metadata 추가 메타데이터
 */
export function trackPatentEvent(
  eventName: string,
  patentId: string,
  metadata?: Record<string, any>
) {
  Sentry.addBreadcrumb({
    category: 'patent-engine.event',
    message: `Patent event: ${eventName}`,
    level: 'info',
    data: {
      patent_id: patentId,
      event_name: eventName,
      ...metadata,
    },
    timestamp: Date.now() / 1000,
  });
}

/**
 * DC 위반 보고
 * @param dcNumber DC 번호 (1-5)
 * @param patentId 특허 ID
 * @param description 위반 설명
 * @param context 추가 컨텍스트
 */
export function reportDcViolation(
  dcNumber: 1 | 2 | 3 | 4 | 5,
  patentId: string,
  description: string,
  context?: Record<string, any>
) {
  const rule = Object.entries(PATENT_ALERT_RULES).find(
    ([_, rule]) => rule.description.includes(`DC-${dcNumber}`)
  );

  if (!rule) {
    console.warn(`No alert rule found for DC-${dcNumber}`);
    return;
  }

  const [ruleId, ruleConfig] = rule;
  const severity = ruleConfig.severity;

  // Sentry에 에러로 캡처
  Sentry.captureMessage(
    `DC-${dcNumber} Violation: ${description}`,
    {
      level: severity === 'critical' ? 'error' : severity === 'high' ? 'warning' : 'info',
      tags: {
        'patent.violation': `DC-${dcNumber}`,
        'patent.violation-type': ruleId,
        'patent.patent-id': patentId,
        'alert.severity': severity,
      },
      contexts: {
        'patent-violation': {
          dc_number: dcNumber,
          description,
          ...context,
        },
      },
    }
  );

  // 알림 채널로 전송
  if (ruleConfig.notificationChannels?.includes('slack')) {
    notifySlack(ruleId, patentId, description, severity, context);
  }

  if (ruleConfig.notificationChannels?.includes('pagerduty')) {
    notifyPagerDuty(ruleId, patentId, description, severity);
  }
}

/**
 * FSM 전이 모니터링
 * @param fromState 이전 상태
 * @param toState 새 상태
 * @param patentId 특허 ID
 * @param isValid 전이가 유효한지 여부
 */
export function monitorFsmTransition(
  fromState: string,
  toState: string,
  patentId: string,
  isValid: boolean
) {
  if (!isValid) {
    reportDcViolation(
      5,
      patentId,
      `Invalid FSM transition: ${fromState} -> ${toState}`,
      {
        from_state: fromState,
        to_state: toState,
      }
    );
  }

  trackPatentEvent('fsm-transition', patentId, {
    from_state: fromState,
    to_state: toState,
    is_valid: isValid,
  });
}

/**
 * 성능 메트릭 경고 확인
 * @param metricName 메트릭 이름
 * @param value 메트릭 값
 * @param patentId 특허 ID
 */
export function checkPerformanceAlert(
  metricName: string,
  value: number,
  patentId: string
) {
  const ruleEntries = Object.entries(PATENT_ALERT_RULES);

  for (const [ruleId, rule] of ruleEntries) {
    // 메트릭 이름과 규칙 매칭
    if (ruleId.includes(metricName.toUpperCase())) {
      if (rule.threshold !== undefined && value > rule.threshold) {
        Sentry.captureMessage(
          `Performance alert: ${ruleId}`,
          {
            level: 'warning',
            tags: {
              'patent.patent-id': patentId,
              'performance.metric': metricName,
              'alert.rule': ruleId,
            },
            contexts: {
              performance: {
                metric_name: metricName,
                value,
                threshold: rule.threshold,
              },
            },
          }
        );

        trackPatentEvent('performance-alert', patentId, {
          metric_name: metricName,
          value,
          threshold: rule.threshold,
          exceeded: true,
        });
      }
    }
  }
}

/**
 * Slack 알림 전송
 * @param ruleId 규칙 ID
 * @param patentId 특허 ID
 * @param description 설명
 * @param severity 심각도
 * @param context 컨텍스트
 */
async function notifySlack(
  ruleId: string,
  patentId: string,
  description: string,
  severity: AlertSeverity,
  context?: Record<string, any>
) {
  try {
    const webhookUrl = process.env.SLACK_WEBHOOK_URL_ALERTS;
    if (!webhookUrl) {
      console.warn('SLACK_WEBHOOK_URL_ALERTS not configured');
      return;
    }

    const color = {
      critical: '#e74c3c',
      high: '#f39c12',
      medium: '#f1c40f',
      low: '#3498db',
    }[severity];

    const payload = {
      attachments: [
        {
          color,
          title: `${severity.toUpperCase()}: ${ruleId}`,
          text: description,
          fields: [
            {
              title: 'Patent ID',
              value: patentId,
              short: true,
            },
            {
              title: 'Alert Rule',
              value: ruleId,
              short: true,
            },
            {
              title: 'Timestamp',
              value: new Date().toISOString(),
              short: false,
            },
          ],
          footer: 'ArcUp Patent Engine Monitoring',
          ts: Math.floor(Date.now() / 1000),
        },
      ],
    };

    await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  } catch (error) {
    console.error('Failed to send Slack notification:', error);
    Sentry.captureException(error, {
      tags: {
        context: 'slack-notification-failure',
        rule_id: ruleId,
      },
    });
  }
}

/**
 * PagerDuty 알림 전송
 * @param ruleId 규칙 ID
 * @param patentId 특허 ID
 * @param description 설명
 * @param severity 심각도
 */
async function notifyPagerDuty(
  ruleId: string,
  patentId: string,
  description: string,
  severity: AlertSeverity
) {
  try {
    const integrationKey = process.env.PAGERDUTY_INTEGRATION_KEY;
    if (!integrationKey) {
      console.warn('PAGERDUTY_INTEGRATION_KEY not configured');
      return;
    }

    const pdSeverity =
      severity === 'critical' ? 'critical' :
      severity === 'high' ? 'error' :
      severity === 'medium' ? 'warning' : 'info';

    const payload = {
      routing_key: integrationKey,
      event_action: 'trigger',
      dedup_key: `patent-${patentId}-${ruleId}-${Date.now()}`,
      payload: {
        summary: `${ruleId}: ${description}`,
        severity: pdSeverity,
        source: 'ArcUp Patent Engine',
        custom_details: {
          patent_id: patentId,
          alert_rule: ruleId,
          alert_rule_description: PATENT_ALERT_RULES[ruleId]?.description,
        },
      },
    };

    await fetch('https://events.pagerduty.com/v2/enqueue', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  } catch (error) {
    console.error('Failed to send PagerDuty notification:', error);
    Sentry.captureException(error, {
      tags: {
        context: 'pagerduty-notification-failure',
        rule_id: ruleId,
      },
    });
  }
}

/**
 * 경고 규칙 등록 (런타임 커스터마이징용)
 * @param ruleId 규칙 ID
 * @param rule 규칙 설정
 */
export function registerAlertRule(ruleId: string, rule: AlertRule) {
  if (PATENT_ALERT_RULES[ruleId]) {
    console.warn(`Alert rule ${ruleId} already exists, overwriting`);
  }
  PATENT_ALERT_RULES[ruleId] = rule;
}

/**
 * 특정 규칙 비활성화
 * @param ruleId 규칙 ID
 */
export function disableAlertRule(ruleId: string) {
  if (PATENT_ALERT_RULES[ruleId]) {
    delete PATENT_ALERT_RULES[ruleId];
  }
}

export default {
  PATENT_ALERT_RULES,
  trackPatentEvent,
  reportDcViolation,
  monitorFsmTransition,
  checkPerformanceAlert,
  registerAlertRule,
  disableAlertRule,
};
