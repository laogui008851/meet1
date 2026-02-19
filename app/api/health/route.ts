import { NextResponse } from 'next/server';
import { cleanupExpiredSessions, cleanupExpiredPoolCodes } from '@/lib/db';

/**
 * 健康检查 + 定期清理
 * GET /api/health
 * 可配合外部 cron 服务定期调用来清理过期数据
 */

export async function GET() {
  try {
    const sessionsCleared = await cleanupExpiredSessions();
    const codesCleared = await cleanupExpiredPoolCodes(12);

    return NextResponse.json({
      status: 'ok',
      cleanup: {
        expiredSessions: sessionsCleared,
        expiredCodes: codesCleared,
      },
    });
  } catch (error) {
    console.error('health check error:', error);
    return NextResponse.json({
      status: 'ok',
      cleanup: { error: error instanceof Error ? error.message : 'unknown' },
    });
  }
}
