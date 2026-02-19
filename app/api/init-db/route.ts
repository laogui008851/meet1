import { NextResponse } from 'next/server';
import { initDatabase } from '@/lib/db';

/**
 * 数据库初始化 API
 * GET /api/init-db  首次部署时调用一次即可
 */

export async function GET() {
  try {
    await initDatabase();
    return NextResponse.json({ status: 'ok', message: '数据库表已初始化' });
  } catch (error) {
    console.error('init-db error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '未知错误' },
      { status: 500 },
    );
  }
}
