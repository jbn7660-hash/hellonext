// Next.js API 라우트: /api/health/[component]
// 개별 컴포넌트 헬스체크 엔드포인트

import { performHealthCheck } from '@/lib/monitoring/health-check';
import { NextRequest, NextResponse } from 'next/server';

/** Valid component names that map to keys in the health check result */
const COMPONENT_MAP: Record<string, string[]> = {
  'database': ['database'],
  'auth': ['auth'],
  'realtime': ['realtime'],
  'external-services': ['externalServices'],
  'fsm-controller': ['patentEngine', 'fsmController'],
  'causal-analysis': ['patentEngine', 'causalAnalysis'],
  'measurement-confidence': ['patentEngine', 'measurementConfidence'],
  'verification-handler': ['patentEngine', 'verificationHandler'],
  'edge-weight-calibration': ['patentEngine', 'edgeWeightCalibration'],
};

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ component: string }> }
) {
  const { component } = await params;
  const path = COMPONENT_MAP[component];

  if (!path) {
    return NextResponse.json(
      {
        error: {
          code: 'HEALTH_COMPONENT_NOT_FOUND',
          message: `Unknown component: ${component}. Valid: ${Object.keys(COMPONENT_MAP).join(', ')}`,
        },
      },
      { status: 404 }
    );
  }

  try {
    const fullResult = await performHealthCheck();

    // Navigate the checks object using the path
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let componentResult: any = fullResult.checks;
    for (const key of path) {
      componentResult = componentResult?.[key];
    }

    if (!componentResult) {
      return NextResponse.json(
        { error: { code: 'HEALTH_CHECK_MISSING', message: `No data for component: ${component}` } },
        { status: 500 }
      );
    }

    const statusCode = componentResult.status === 'healthy' ? 200
      : componentResult.status === 'degraded' ? 200
      : 503;

    return NextResponse.json(
      {
        component,
        ...componentResult,
        timestamp: fullResult.timestamp,
      },
      {
        status: statusCode,
        headers: {
          'Cache-Control': 'no-cache, no-store, must-revalidate',
        },
      }
    );
  } catch (error) {
    console.error(`Health check failed for ${component}:`, error);
    return NextResponse.json(
      {
        component,
        status: 'unhealthy',
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString(),
      },
      { status: 503, headers: { 'Cache-Control': 'no-cache, no-store, must-revalidate' } }
    );
  }
}
