import { NextRequest, NextResponse } from 'next/server';
import { updateHeartbeat } from '@/lib/db';

/**
 * 心跳接口：前端每60秒调用，刷新 in_use_since 防止活跃会议被误释放
 */

export async function POST(request: NextRequest) {
  try {
    const data = await request.json();
    const authCode = data.authCode || '';
    if (!authCode) {
      return NextResponse.json({ error: '缺少授权码' }, { status: 400 });
    }

    await updateHeartbeat(authCode);

    return NextResponse.json({ status: 'ok' });
  } catch {
    return NextResponse.json({ status: 'ok' });
  }
}
