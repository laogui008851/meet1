import { NextRequest, NextResponse } from 'next/server';
import { releasePoolCodeUse } from '@/lib/db';

/**
 * 用户离开房间时释放授权码（直接操作数据库）
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

    await releasePoolCodeUse(authCode);

    return NextResponse.json({ status: 'ok' });
  } catch {
    return NextResponse.json({ status: 'ok' });
  }
}
