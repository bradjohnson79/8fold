import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/server/db/drizzle";
import { toHttpError } from "@/src/http/errors";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const result = await db.execute<{ count: string }>(sql`select count(*)::text as count from "User"`);
    const countRaw = result.rows?.[0]?.count ?? "0";
    const count = Number.parseInt(String(countRaw), 10);
    return NextResponse.json({
      ok: true,
      users: {
        total: Number.isFinite(count) ? count : 0,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    const { status, message, code, context } = toHttpError(err);
    return NextResponse.json(
      {
        ok: false,
        error: message,
        code,
        context,
      },
      { status: status || 500 },
    );
  }
}
