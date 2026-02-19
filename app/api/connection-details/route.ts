import { NextRequest, NextResponse } from 'next/server';
import { AccessToken } from 'livekit-server-sdk';
import { verifyPoolCode, markPoolCodeInUse } from '@/lib/db';

/**
 * 直接验证授权码 + 生成 LiveKit Token（不再依赖 Python Token Server）
 * 授权码存储在 Neon Postgres 云数据库中
 */

const LIVEKIT_API_KEY = process.env.LIVEKIT_API_KEY || '';
const LIVEKIT_API_SECRET = process.env.LIVEKIT_API_SECRET || '';
const LIVEKIT_URL = process.env.LIVEKIT_URL || '';

export async function GET(request: NextRequest) {
  try {
    const roomName = request.nextUrl.searchParams.get('roomName');
    const participantName = request.nextUrl.searchParams.get('participantName');
    const authCode = request.nextUrl.searchParams.get('authCode');

    if (!roomName) {
      return NextResponse.json({ error: '缺少房间名称' }, { status: 400 });
    }
    if (!participantName) {
      return NextResponse.json({ error: '缺少参与者名称' }, { status: 400 });
    }
    if (!authCode) {
      return NextResponse.json({ error: '请提供授权码' }, { status: 401 });
    }

    // 验证授权码（直接查询数据库）
    const result = await verifyPoolCode(authCode, roomName);
    if (!result.valid) {
      return NextResponse.json(
        { error: `授权码无效: ${result.reason || '未知'}` },
        { status: 401 },
      );
    }

    // 标记为使用中并绑定房间
    await markPoolCodeInUse(authCode, roomName);

    // 直接生成 LiveKit Token
    const at = new AccessToken(LIVEKIT_API_KEY, LIVEKIT_API_SECRET, {
      identity: participantName,
      ttl: '24h',
    });
    at.addGrant({
      roomJoin: true,
      room: roomName,
      canPublish: true,
      canSubscribe: true,
      canPublishData: true,
    });

    const participantToken = await at.toJwt();

    return NextResponse.json({
      serverUrl: LIVEKIT_URL,
      participantToken,
      participantName,
      roomName,
    });
  } catch (error) {
    console.error('connection-details error:', error);
    if (error instanceof Error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ error: '未知错误' }, { status: 500 });
  }
}
