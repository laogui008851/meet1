import { NextRequest, NextResponse } from 'next/server';
import { forceReleasePoolCode } from '@/lib/db';

/**
 * 用户离开房间
 * 普通离开：不做任何数据库操作，完全依赖心跳超时来释放码
 *   - 只要房间里还有人在发心跳，码绝对不会释放
 *   - 所有人都走了 → 10分钟无心跳 → 自动释放
 *
 * POST 带 force=true：强制立即释放（供 bot "结束会议" 按钮用）
 */

export async function GET(_request: NextRequest) {
  // 普通离开：不操作数据库，交给心跳超时处理
  return NextResponse.json({ status: 'ok' });
}

export async function POST(request: NextRequest) {
  try {
    const data = await request.json();
    const authCode = data.authCode || '';

    // 只有 force=true 时才真正释放（bot "结束会议" 按钮）
    if (data.force && authCode) {
      await forceReleasePoolCode(authCode);
    }
    // 否则不做任何操作

    return NextResponse.json({ status: 'ok' });
  } catch {
    return NextResponse.json({ status: 'ok' });
  }
}
