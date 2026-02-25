/**
 * 数据库模块 - Neon Postgres (Serverless)
 * 用于授权码管理，替代 Python Token Server 中的 SQLite
 */
import { neon } from '@neondatabase/serverless';

// 获取数据库连接
function getDb() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('DATABASE_URL 环境变量未设置');
  }
  return neon(databaseUrl);
}

// 自动迁移标记：每次冷启动最多执行一次
let _migrated = false;

/**
 * 确保 expires_at 列存在（自动迁移，每次冷启动只跑一次）
 */
async function ensureMigration() {
  if (_migrated) return;
  const sql = getDb();
  try {
    await sql`ALTER TABLE auth_code_pool ADD COLUMN IF NOT EXISTS expires_at TIMESTAMP`;
  } catch (e: unknown) {
    // 列已存在或表不存在时忽略
    if (e instanceof Error && !e.message.includes('already exists')) {
      console.warn('ensureMigration warning:', e.message);
    }
  }
  _migrated = true;
}

/**
 * 初始化数据库表（首次部署时调用）
 */
export async function initDatabase() {
  const sql = getDb();

  await sql`
    CREATE TABLE IF NOT EXISTS auth_code_pool (
      pool_id SERIAL PRIMARY KEY,
      code TEXT NOT NULL UNIQUE,
      room_name TEXT NOT NULL DEFAULT '*',
      status TEXT DEFAULT 'available',
      assigned_to BIGINT,
      created_at TIMESTAMP DEFAULT NOW(),
      assigned_at TIMESTAMP,
      expires_minutes INTEGER DEFAULT 1440,
      in_use INTEGER DEFAULT 0,
      in_use_since TIMESTAMP,
      bound_room TEXT,
      note TEXT,
      expires_at TIMESTAMP
    )
  `;

  // 已有表补列
  await sql`ALTER TABLE auth_code_pool ADD COLUMN IF NOT EXISTS expires_at TIMESTAMP`;
  _migrated = true;

  return { success: true };
}

/**
 * 验证授权码
 * 规则：
 *   1. 必须存在于 auth_code_pool
 *   2. status = 'assigned'（已被某用户购买）
 *   3. 一码一房间：授权码绑定房间后，房间未关闭不能开第2个房间
 *   4. 同一房间内多人可用同一授权码进入
 */
export async function verifyPoolCode(
  code: string,
  roomName: string = '',
): Promise<{ valid: boolean; reason?: string; data?: Record<string, unknown> }> {
  await ensureMigration();
  const sql = getDb();

  const rows = await sql`
    SELECT * FROM auth_code_pool WHERE code = ${code}
  `;

  if (rows.length === 0) {
    return { valid: false, reason: '授权码不存在' };
  }

  const info = rows[0];

  if (info.status === 'available') {
    return { valid: false, reason: '授权码尚未激活（未被购买）' };
  }

  // 检查是否已过期（从首次开房间时开始计时）
  if (info.expires_at) {
    const expiresAt = new Date(info.expires_at as string);
    if (Date.now() > expiresAt.getTime()) {
      return { valid: false, reason: '授权码已过期' };
    }
  }

  // 检查是否已在使用中且绑定了房间
  if (info.in_use && info.bound_room && info.in_use_since) {
    const since = new Date(info.in_use_since as string);
    // 心跳超时 10 分钟自动释放（活跃会话每60秒心跳刷新 in_use_since）
    const IN_USE_TIMEOUT_SEC = 10 * 60;
    const elapsed = (Date.now() - since.getTime()) / 1000;

    if (elapsed >= IN_USE_TIMEOUT_SEC) {
      // 超时自动释放
      await sql`
        UPDATE auth_code_pool
        SET in_use = 0, in_use_since = NULL, bound_room = NULL
        WHERE pool_id = ${info.pool_id}
      `;
    } else {
      // 未超时：已绑定房间
      const bound = info.bound_room as string;
      
      // 如果是同一个房间 → 允许进入（多人可用同一授权码进同一房间）
      if (roomName && roomName === bound) {
        return { valid: true, data: info as Record<string, unknown> };
      }
      
      // 如果是不同房间 → 拒绝（一码不能同时开多个房间）
      return {
        valid: false,
        reason: '授权码正在使用中，不能同时开启其他房间',
      };
    }
  }

  return { valid: true, data: info as Record<string, unknown> };
}

/**
 * 标记授权码为使用中并绑定房间（仅首次标记）
 * 首次开房间时启动计时：expires_at = NOW() + expires_minutes
 */
export async function markPoolCodeInUse(code: string, roomName: string = '') {
  await ensureMigration();
  const sql = getDb();

  // 首次使用：expires_at 为 NULL 时设置过期时间，开始计时
  await sql`
    UPDATE auth_code_pool
    SET
      in_use = 1,
      in_use_since = NOW(),
      bound_room = ${roomName},
      expires_at = CASE
        WHEN expires_at IS NULL THEN NOW() + (expires_minutes || ' minutes')::INTERVAL
        ELSE expires_at
      END
    WHERE code = ${code} AND in_use = 0
  `;

  return true;
}

/**
 * 软释放：某个参与者离开房间时调用
 * 不直接清除 in_use / bound_room，而是把 in_use_since 设为一个较早的时间
 * 如果房间里还有其他人在发心跳，心跳会把 in_use_since 刷新回来
 * 如果所有人都走了，没人再发心跳，超时后自动释放
 */
export async function releasePoolCodeUse(code: string) {
  const sql = getDb();

  // 把 in_use_since 往前推 8 分钟，给最后一轮心跳 2 分钟窗口
  // 如果还有人在房间里，下一次心跳（60秒内）会刷新回来
  // 如果所有人都走了，2 分钟后总共超过 10 分钟阈值，自动释放
  await sql`
    UPDATE auth_code_pool
    SET in_use_since = NOW() - INTERVAL '8 minutes'
    WHERE code = ${code} AND in_use = 1
  `;

  return true;
}

/**
 * 强制释放：管理员或 bot "结束会议" 按钮专用
 * 立即清除 in_use / bound_room
 */
export async function forceReleasePoolCode(code: string) {
  const sql = getDb();

  await sql`
    UPDATE auth_code_pool
    SET in_use = 0, in_use_since = NULL, bound_room = NULL
    WHERE code = ${code}
  `;

  return true;
}

/**
 * 心跳更新：刷新 in_use_since 时间戳，并确保 in_use = 1
 * 防止活跃会话被误释放（即使之前被超时释放，心跳也能恢复）
 */
export async function updateHeartbeat(code: string) {
  const sql = getDb();

  // 如果码有 bound_room，说明会议仍在进行，强制恢复 in_use = 1
  await sql`
    UPDATE auth_code_pool
    SET in_use_since = NOW(), in_use = 1
    WHERE code = ${code} AND bound_room IS NOT NULL
  `;

  return true;
}

/**
 * 生成随机授权码（排除易混淆字符）
 */
function generateCode(length: number = 8): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // 排除 0/O/1/I
  let code = '';
  for (let i = 0; i < length; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

/**
 * 创建授权码（供机器人调用）
 */
export async function createAuthCode(
  telegramId?: number,
  expiresMinutes: number = 1440,
  note: string = '',
): Promise<{ code: string; poolId: number; status: string } | null> {
  const sql = getDb();
  const maxRetries = 10;

  for (let i = 0; i < maxRetries; i++) {
    const code = generateCode();
    try {
      if (telegramId) {
        const rows = await sql`
          INSERT INTO auth_code_pool (code, room_name, expires_minutes, note, status, assigned_to, assigned_at)
          VALUES (${code}, '*', ${expiresMinutes}, ${note}, 'assigned', ${telegramId}, NOW())
          RETURNING pool_id
        `;
        return { code, poolId: rows[0].pool_id as number, status: 'assigned' };
      } else {
        const rows = await sql`
          INSERT INTO auth_code_pool (code, room_name, expires_minutes, note)
          VALUES (${code}, '*', ${expiresMinutes}, ${note})
          RETURNING pool_id
        `;
        return { code, poolId: rows[0].pool_id as number, status: 'available' };
      }
    } catch (e: unknown) {
      // code 重复，重试
      if (e instanceof Error && e.message.includes('unique')) {
        continue;
      }
      throw e;
    }
  }

  return null;
}

/**
 * 获取用户的授权码列表
 */
export async function getUserAssignedCodes(telegramId: number) {
  await ensureMigration();
  const sql = getDb();

  const rows = await sql`
    SELECT * FROM auth_code_pool
    WHERE assigned_to = ${telegramId} AND status = 'assigned'
    ORDER BY assigned_at DESC
  `;

  return rows;
}

/**
 * 清理超时的 in_use 会话（10分钟无心跳自动释放）
 */
export async function cleanupExpiredSessions() {
  const sql = getDb();

  const result = await sql`
    UPDATE auth_code_pool
    SET in_use = 0, in_use_since = NULL, bound_room = NULL
    WHERE in_use = 1
      AND in_use_since IS NOT NULL
      AND EXTRACT(EPOCH FROM (NOW() - in_use_since)) >= 600
  `;

  return result.length;
}

/**
 * 清理过期的授权码记录
 */
export async function cleanupExpiredPoolCodes(graceHours: number = 12) {
  const sql = getDb();

  const result = await sql`
    DELETE FROM auth_code_pool
    WHERE status = 'assigned'
      AND assigned_at IS NOT NULL
      AND assigned_at + (expires_minutes || ' minutes')::INTERVAL + (${graceHours} || ' hours')::INTERVAL < NOW()
  `;

  return result.length;
}
