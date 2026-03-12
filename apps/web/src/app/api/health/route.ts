// Next.js API 라우트: /api/health
// 시스템 전체 헬스체크 엔드포인트

import { performHealthCheck } from '@/lib/monitoring/health-check';
import { NextRequest, NextResponse } from 'next/server';

/**
 * GET /api/health
 * 전체 시스템 헬스체크 수행
 *
 * @returns {HealthCheckResult} 헬스체크 결과
 */
export async function GET(request: NextRequest) {
  try {
    // 헬스체크 수행
    const healthCheckResult = await performHealthCheck();

    // 상태에 따른 HTTP 상태 코드 결정
    const statusCode = healthCheckResult.status === 'healthy' ? 200 : healthCheckResult.status === 'degraded' ? 200 : 503;

    return NextResponse.json(healthCheckResult, {
      status: statusCode,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
      },
    });
  } catch (error) {
    console.error('Health check failed:', error);

    return NextResponse.json(
      {
        status: 'unhealthy',
        version: process.env.NEXT_PUBLIC_APP_VERSION || '2.0.0',
        checks: {},
        timestamp: new Date().toISOString(),
        uptime: Math.floor(process.uptime()),
        error: 'Health check execution failed',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      {
        status: 503,
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache, no-store, must-revalidate',
        },
      }
    );
  }
}

/**
 * HEAD /api/health
 * 간단한 헬스체크 (빠른 응답)
 * 데이터베이스 확인만 수행
 */
export async function HEAD(request: NextRequest) {
  try {
    const healthCheckResult = await performHealthCheck();
    const statusCode = healthCheckResult.status === 'healthy' ? 200 : healthCheckResult.status === 'degraded' ? 200 : 503;

    return new NextResponse(null, {
      status: statusCode,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
      },
    });
  } catch (error) {
    return new NextResponse(null, {
      status: 503,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
      },
    });
  }
}
