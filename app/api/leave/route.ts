import { NextRequest, NextResponse } from 'next/server';
import { releasePoolCodeUse, forceReleasePoolCode } from '@/lib/db';

/**
 * 用户离开房间时软释放授权码
 * 不直接清 in_use，而是把 in_use_since 往前推，
 * 如果房间还有其他人在发心跳，会自动恢复。
 * 所有人走了 → 心跳超时后自动释放。
 *
 * POST 带 force=true 时强制释放（供 bot "结束会议" 按钮用）
 */

export async function GET(request: NextRequest) {
  const authCode = request.nextUrl.searchParams.get('authCode');
  if (!authCode) {
    return NextResponse.json({ error: '缺少授权码' }, { status: 400 });
  }

  try {
    await releasePoolCodeUse(authCode);
  } catch {
    // 静默失败
  }

  return NextResponse.json({ status: 'ok' });
}

export async function POST(request: NextRequest) {
  try {
    const data = await request.json();
    const authCode = data.authCode || '';
    if (!authCode) {
      return NextResponse.json({ error: '缺少授权码' }, { status: 400 });
    }

    if (data.force) {
      await forceReleasePoolCode(authCode);
    } else {
      await releasePoolCodeUse(authCode);
    }

    return NextResponse.json({ status: 'ok' });
  } catch {
    return NextResponse.json({ status: 'ok' });
  }
}
