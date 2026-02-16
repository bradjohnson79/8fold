import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/server/db/drizzle";

export async function GET() {
  try {
    await db.execute(sql`select 1`);
    return NextResponse.json({
      ok: true,
      origin: "apps-api",
      db: "connected",
      timestamp: Date.now(),
    });
  } catch {
    return NextResponse.json(
      {
        ok: false,
        origin: "apps-api",
        db: "error",
        timestamp: Date.now(),
      },
      { status: 500 },
    );
  }
}

