import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/server/db/drizzle";
import { toHttpError } from "../../../../src/http/errors";
import pkg from "../../../../package.json";

export async function GET() {
  try {
    // DB ping (authoritative).
    await db.execute(sql`select 1 as ok`);
    return NextResponse.json({
      ok: true,
      service: "apps-api",
      db: "connected",
      uptime: Math.floor(process.uptime()),
      version: (pkg as any)?.version ?? "0.0.0",
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    const { status, message, code, context } = toHttpError(err);
    return NextResponse.json(
      {
        ok: false,
        service: "apps-api",
        error: message,
        code,
        context,
        db: "error",
        uptime: Math.floor(process.uptime()),
        version: (pkg as any)?.version ?? "0.0.0",
        timestamp: new Date().toISOString(),
      },
      { status: status || 500 },
    );
  }
}

