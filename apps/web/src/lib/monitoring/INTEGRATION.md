# ArcUp v2.0 모니터링 및 관찰성 통합 가이드

## 개요

이 가이드는 ArcUp HelloNext v2.0 특허 엔진의 모니터링 및 관찰성 시스템 통합 방법을 설명합니다.

## 모듈 구조

```
src/lib/monitoring/
├── sentry-config.ts          # Sentry 초기화 및 설정
├── patent-alerts.ts          # DC-1~DC-5 위반 경고 규칙
├── health-check.ts           # 헬스체크 로직
├── metrics.ts                # 메트릭 수집
├── index.ts                  # 모니터링 모듈 내보내기
└── INTEGRATION.md            # 이 파일

app/api/health/
└── route.ts                  # GET /api/health 엔드포인트

sentry.client.config.ts        # 클라이언트 Sentry 설정
sentry.server.config.ts        # 서버 Sentry 설정
```

## 설정

### 1. 환경 변수 설정

`.env.local` 또는 `.env.production`에 다음을 추가하세요:

```env
# Sentry 설정
NEXT_PUBLIC_SENTRY_DSN=https://your-sentry-dsn@sentry.io/project-id
NEXT_PUBLIC_APP_VERSION=2.0.0
NEXT_PUBLIC_REGION=us-east-1

# 알림 채널
SLACK_WEBHOOK_URL_ALERTS=https://hooks.slack.com/services/YOUR/WEBHOOK/URL
PAGERDUTY_INTEGRATION_KEY=your-pagerduty-integration-key

# 서비스 URL
NEXT_PUBLIC_API_URL=http://localhost:3000
NEXT_PUBLIC_AUTH_URL=http://localhost:3000/api/auth/health
NEXT_PUBLIC_REALTIME_URL=ws://localhost:3000/ws
```

### 2. Next.js 초기화

`app/layout.tsx`에 다음을 추가하세요:

```typescript
import { initializeMonitoring, startHealthCheckInterval } from '@/lib/monitoring';

export default function RootLayout({ children }) {
  // 클라이언트 측에서만 실행
  if (typeof window !== 'undefined') {
    initializeMonitoring();
    startHealthCheckInterval(60000); // 60초 간격
  }

  return (
    <html>
      <body>{children}</body>
    </html>
  );
}
```

## 사용 방법

### 1. Sentry 에러 추적

```typescript
import {
  FsmViolationError,
  reportDcViolation,
  setPatentEngineContext
} from '@/lib/monitoring';

// DC-5 위반: FSM 비정상 전이
try {
  // FSM 상태 전이 로직
  if (invalidTransition) {
    throw new FsmViolationError(
      'Invalid FSM transition',
      currentState,
      nextState,
      'DC-5'
    );
  }
} catch (error) {
  setPatentEngineContext(patentId, {
    fsmState: currentState,
    engineComponent: 'fsm-controller'
  });
  throw error;
}

// DC-3 위반: Layer A 불변성
try {
  if (attemptedLayerAMutation) {
    reportDcViolation(
      3,
      patentId,
      'Layer A mutation attempt detected',
      { attemptedField: 'target_id' }
    );
  }
} catch (error) {
  // 에러 처리
}
```

### 2. 성능 모니터링

```typescript
import {
  monitorFsmTransition,
  measureAsyncOperation,
  PatentMetrics
} from '@/lib/monitoring';

// FSM 전이 모니터링
const startTime = Date.now();
performFsmTransition(currentState, nextState);
const duration = Date.now() - startTime;

monitorFsmTransition(currentState, nextState, patentId, duration);

// IIS 계산 모니터링 (F-015: 5초 이내)
const iisTime = await measureAsyncOperation('iis-computation', async () => {
  return await computeIIS(causalGraph);
});

PatentMetrics.iisComputationTime(iisTime);

// 신뢰도 계산 모니터링
const confidence = calculateConfidence(evidence);
PatentMetrics.confidenceDistribution(confidence,
  confidence > 0.8 ? 'high' :
  confidence > 0.5 ? 'medium' : 'low'
);
```

### 3. 경고 규칙 적용

```typescript
import {
  trackPatentEvent,
  reportDcViolation,
  checkPerformanceAlert
} from '@/lib/monitoring';

// 특허 이벤트 추적
trackPatentEvent('patent-viewed', patentId, {
  confidence: confidence,
  fsm_state: fsmState
});

// 성능 경고 확인
const computationTime = measureComputation();
checkPerformanceAlert('IIS_COMPUTATION_TIMEOUT', computationTime, patentId);

// DC 위반 보고
if (dcViolation) {
  reportDcViolation(
    dcNumber,
    patentId,
    'Violation description',
    { context: 'data' }
  );
}
```

### 4. 헬스체크 엔드포인트

```typescript
// API 호출
const response = await fetch('/api/health');
const healthStatus = await response.json();

// 상태 확인
if (healthStatus.status === 'unhealthy') {
  // 예: 대시보드에 경고 표시
  console.error('System unhealthy:', healthStatus.checks);
} else if (healthStatus.status === 'degraded') {
  // 예: 사용자에게 성능 저하 알림
  console.warn('System degraded:', healthStatus.checks);
}
```

### 5. 메트릭 수집

```typescript
import { PatentMetrics, PatentPerformanceProfiler } from '@/lib/monitoring';

// FSM 전이 메트릭
PatentMetrics.fsmTransitionCount('PENDING', 'ANALYZING');
PatentMetrics.fsmTransitionLatency(150);

// 신뢰도 메트릭
PatentMetrics.confidenceDistribution(0.85, 'high');

// 검증 메트릭
PatentMetrics.verificationQueueSize(1234);
PatentMetrics.verificationResponseTime(2500);

// 인과 그래프 메트릭
PatentMetrics.iisComputationTime(3500);
PatentMetrics.edgeCalibrationCount(450);

// 성능 프로파일링
const profiler = new PatentPerformanceProfiler('causal-graph-analysis');
// ... 작업 수행
profiler.end({ patent_count: 5000 });
```

## DC (Design Constraint) 위반 처리

### DC-1: 인과 그래프 무결성
```typescript
if (!isCausalGraphValid(graph)) {
  reportDcViolation(1, patentId, 'Causal graph integrity violated');
}
```

### DC-2: 신뢰도 계산
```typescript
try {
  const confidence = calculateConfidence(evidence);
  if (isNaN(confidence)) {
    throw new ConfidenceCalculationError(
      'Invalid confidence value',
      patentId,
      'DC-2'
    );
  }
} catch (error) {
  reportDcViolation(2, patentId, 'Confidence calculation failed');
}
```

### DC-3: Layer A 불변성
```typescript
if (layerA.target_id !== originalTargetId) {
  reportDcViolation(
    3,
    patentId,
    'Layer A immutability violated',
    { field: 'target_id' }
  );
}
```

### DC-4: 엣지 가중치
```typescript
const edgeWeights = calibrateEdgeWeights(graph);
if (!areEdgeWeightsValid(edgeWeights)) {
  reportDcViolation(4, patentId, 'Edge weight calibration failed');
}
```

### DC-5: FSM 상태 전이
```typescript
const isValidTransition = validateFsmTransition(currentState, nextState);
if (!isValidTransition) {
  throw new FsmViolationError(
    `Invalid transition: ${currentState} -> ${nextState}`,
    currentState,
    nextState,
    'DC-5'
  );
}
```

## 기능 제약 조건 (F-015~F-017)

### F-015: IIS 계산 타임아웃 (5초)
```typescript
const start = Date.now();
const iisResult = await computeIIS(causalGraph);
const duration = Date.now() - start;

if (duration > 5000) {
  checkPerformanceAlert('IIS_COMPUTATION_TIMEOUT', duration, patentId);
}
```

### F-016: 검증 큐 지연 (24시간)
```typescript
const oldestItem = getOldestVerificationQueueItem();
const ageMs = Date.now() - oldestItem.createdAt.getTime();

if (ageMs > 86400000) { // 24시간
  checkPerformanceAlert('VERIFICATION_QUEUE_STALE', ageMs, patentId);
}
```

### F-017: FSM 복구 실패
```typescript
try {
  const restored = attemptFsmRecovery(corruptedState);
  if (!restored) {
    PatentMetrics.fsmRecoveryCount();
    reportDcViolation(5, patentId, 'FSM recovery failed');
  }
} catch (error) {
  reportDcViolation(5, patentId, 'FSM recovery exception');
}
```

## 경고 채널

### Slack 알림
- `SLACK_WEBHOOK_URL_ALERTS` 환경 변수 설정 필요
- 임계값 초과 시 자동 전송
- 심각도별 색상 구분 (critical: 빨강, high: 주황색 등)

### PagerDuty 통합
- `PAGERDUTY_INTEGRATION_KEY` 환경 변수 설정 필요
- Critical/High 심각도 자동 에스컬레이션
- 중복 제거를 위한 dedup_key 사용

### Sentry 추적
- 모든 경고가 자동으로 Sentry로 전송
- 세션 리플레이로 문제 재현 가능
- 성능 프로파일링 데이터 포함

## 모니터링 대시보드 구성

### 필수 메트릭
1. **FSM 상태**: 전이 카운트, 레이턴시, 복구 횟수
2. **신뢰도**: 점수 분포, 계산 성공률
3. **검증**: 큐 크기, 응답 시간, 오래된 항목
4. **성능**: IIS 계산 시간, 엣지 교정 시간
5. **가용성**: 각 컴포넌트의 헬스 상태

### 권장 알림 규칙
- DC 위반: Critical (즉시 페이징)
- IIS 타임아웃: High (경고)
- 검증 큐 지연: Medium (Slack)
- 느린 응답: Low (Sentry만)

## 트러블슈팅

### 헬스체크 실패
```bash
# 개별 컴포넌트 확인
curl http://localhost:3000/api/health/fsm-controller
curl http://localhost:3000/api/health/causal-analysis
curl http://localhost:3000/api/health/measurement-confidence
```

### Sentry 이벤트 누락
- 샘플링 비율 확인: `tracesSampleRate`
- `beforeSend` 필터 확인
- 네트워크 연결 확인

### 경고 미수신
- 환경 변수 설정 확인
- 웹훅 URL 유효성 검사
- 통합 설정 확인

## 성능 최적화

### 샘플링 조정
```typescript
// 프로덕션에서 더 낮은 샘플링
tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.05 : 1.0,

// 세션 리플레이는 선택적
replaysSessionSampleRate: 0.1,
```

### 메트릭 배치 전송
- 메트릭은 자동으로 60초마다 배치됨
- 필요시 수동으로 플러시 가능:
  ```typescript
  PatentMetrics.flush();
  ```

### 메모리 사용 최적화
- 버퍼 최대 크기: 1000개 값
- 오래된 메트릭은 자동 제거
- 주기적 배치 전송으로 메모리 압박 완화

## 참고 자료

- [Sentry Next.js 문서](https://docs.sentry.io/platforms/javascript/guides/nextjs/)
- [ArcUp v2.0 특허 엔진 명세서](../../../PATENT_ENGINE_SPEC.md)
- [API 문서](../../../API.md)
