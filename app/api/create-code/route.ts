import { NextRequest, NextResponse } from 'next/server';
import { createAuthCode, getUserAssignedCodes } from '@/lib/db';

/**
 * 授权码管理 API（供机器人调用）
 *
 * POST /api/create-code  创建授权码
 * Body: { telegramId?, expiresMinutes?, note?, apiKey }
 *
 * GET /api/create-code?telegramId=xxx&apiKey=xxx  查询用户授权码
 */

function verifyApiKey(request: NextRequest): boolean {
  const apiKey = process.env.BOT_API_KEY;
  if (!apiKey) return true; // 未设置 API Key 时跳过验证

  const key =
    request.headers.get('x-api-key') ||
    request.nextUrl.searchParams.get('apiKey') ||
    '';
  return key === apiKey;
}

export async function POST(request: NextRequest) {
  if (!verifyApiKey(request)) {
    return NextResponse.json({ error: '未授权' }, { status: 403 });
  }

  try {
    const data = await request.json();
    const telegramId = data.telegramId ? Number(data.telegramId) : undefined;
    const expiresMinutes = Number(data.expiresMinutes || 1440);
    const note = data.note || 'Bot创建';

    const result = await createAuthCode(telegramId, expiresMinutes, note);

    if (!result) {
      return NextResponse.json({ error: '授权码生成失败' }, { status: 500 });
    }

    return NextResponse.json({
      code: result.code,
      poolId: result.poolId,
      status: result.status,
    });
  } catch (error) {
    console.error('create-code error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '未知错误' },
      { status: 500 },
    );
  }
}

export async function GET(request: NextRequest) {
  if (!verifyApiKey(request)) {
    return NextResponse.json({ error: '未授权' }, { status: 403 });
  }

  try {
    const telegramId = request.nextUrl.searchParams.get('telegramId');
    if (!telegramId) {
      return NextResponse.json({ error: '缺少 telegramId' }, { status: 400 });
    }

    const codes = await getUserAssignedCodes(Number(telegramId));

    return NextResponse.json({ codes });
  } catch (error) {
    console.error('get codes error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '未知错误' },
      { status: 500 },
    );
  }
}
