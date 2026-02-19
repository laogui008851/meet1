import { NextRequest, NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';

/**
 * 管理员授权码操作 API（供机器人调用）
 *
 * POST /api/admin-code  { action: "add", code: "xxx", note: "xxx", apiKey }
 * GET  /api/admin-code?action=list&limit=30&apiKey=xxx
 * GET  /api/admin-code?action=stats&apiKey=xxx
 */

function getDb() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL 未设置');
  return neon(databaseUrl);
}

function verifyApiKey(request: NextRequest): boolean {
  const apiKey = process.env.BOT_API_KEY;
  if (!apiKey) return true;
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
    const sql = getDb();
    const data = await request.json();
    const action = data.action || '';

    if (action === 'add') {
      const code = data.code;
      const note = data.note || '';
      const expiresMinutes = data.expiresMinutes || 1440;

      if (!code) {
        return NextResponse.json({ error: '缺少授权码' }, { status: 400 });
      }

      await sql`
        INSERT INTO auth_code_pool (code, room_name, expires_minutes, note)
        VALUES (${code}, '*', ${expiresMinutes}, ${note})
      `;

      const available = await sql`
        SELECT COUNT(*) as count FROM auth_code_pool WHERE status = 'available'
      `;

      return NextResponse.json({
        success: true,
        code,
        availableCount: available[0]?.count || 0,
      });
    }

    if (action === 'delete') {
      const poolId = data.poolId;
      if (!poolId) {
        return NextResponse.json({ error: '缺少 poolId' }, { status: 400 });
      }
      await sql`DELETE FROM auth_code_pool WHERE pool_id = ${poolId}`;
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: '未知操作' }, { status: 400 });
  } catch (error) {
    console.error('admin-code POST error:', error);
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
    const sql = getDb();
    const action = request.nextUrl.searchParams.get('action') || 'list';

    if (action === 'list') {
      const limit = Number(request.nextUrl.searchParams.get('limit') || '30');
      const codes = await sql`
        SELECT * FROM auth_code_pool ORDER BY pool_id DESC LIMIT ${limit}
      `;
      return NextResponse.json({ codes });
    }

    if (action === 'stats') {
      const total = await sql`SELECT COUNT(*) as count FROM auth_code_pool`;
      const available = await sql`SELECT COUNT(*) as count FROM auth_code_pool WHERE status = 'available'`;
      const assigned = await sql`SELECT COUNT(*) as count FROM auth_code_pool WHERE status = 'assigned'`;
      const inUse = await sql`SELECT COUNT(*) as count FROM auth_code_pool WHERE in_use = 1`;

      return NextResponse.json({
        total: total[0]?.count || 0,
        available: available[0]?.count || 0,
        assigned: assigned[0]?.count || 0,
        inUse: inUse[0]?.count || 0,
      });
    }

    return NextResponse.json({ error: '未知操作' }, { status: 400 });
  } catch (error) {
    console.error('admin-code GET error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '未知错误' },
      { status: 500 },
    );
  }
}
