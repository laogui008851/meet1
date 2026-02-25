import { NextRequest, NextResponse } from 'next/server';
import { forceReleasePoolCode } from '@/lib/db';
import { RoomServiceClient } from 'livekit-server-sdk';

const LIVEKIT_API_KEY = process.env.LIVEKIT_API_KEY || '';
const LIVEKIT_API_SECRET = process.env.LIVEKIT_API_SECRET || '';
const LIVEKIT_URL = process.env.LIVEKIT_URL || '';

// 备用 LiveKit
const LIVEKIT_FALLBACK_API_KEY = process.env.LIVEKIT_FALLBACK_API_KEY || '';
const LIVEKIT_FALLBACK_API_SECRET = process.env.LIVEKIT_FALLBACK_API_SECRET || '';
const LIVEKIT_FALLBACK_URL = process.env.LIVEKIT_FALLBACK_URL || '';

/**
 * 删除 LiveKit 房间（踢掉所有参与者）
 * 同时尝试主服务器和备用服务器
 */
async function destroyRoom(roomName: string) {
  const tasks: Promise<void>[] = [];

  if (LIVEKIT_URL && LIVEKIT_API_KEY && LIVEKIT_API_SECRET) {
    const svc = new RoomServiceClient(LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET);
    tasks.push(svc.deleteRoom(roomName).catch(() => {}));
  }

  if (LIVEKIT_FALLBACK_URL && LIVEKIT_FALLBACK_API_KEY && LIVEKIT_FALLBACK_API_SECRET) {
    const svc = new RoomServiceClient(LIVEKIT_FALLBACK_URL, LIVEKIT_FALLBACK_API_KEY, LIVEKIT_FALLBACK_API_SECRET);
    tasks.push(svc.deleteRoom(roomName).catch(() => {}));
  }

  await Promise.all(tasks);
}

/**
 * 用户离开房间
 * 普通离开：不做任何数据库操作，完全依赖心跳超时来释放码
 *
 * POST 带 force=true：强制释放码 + 删除 LiveKit 房间踢掉所有人
 */

export async function GET(_request: NextRequest) {
  return NextResponse.json({ status: 'ok' });
}

export async function POST(request: NextRequest) {
  try {
    const data = await request.json();
    const authCode = data.authCode || '';

    if (data.force && authCode) {
      // 强制释放码，并获取绑定的房间名
      const boundRoom = await forceReleasePoolCode(authCode);

      // 删除 LiveKit 房间，踢掉所有参与者
      if (boundRoom) {
        await destroyRoom(boundRoom);
      }
    }

    return NextResponse.json({ status: 'ok' });
  } catch {
    return NextResponse.json({ status: 'ok' });
  }
}
