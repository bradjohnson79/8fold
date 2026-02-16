import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/server/db/drizzle";

export async function GET() {
  await db.execute(sql`select 1`);
  return NextResponse.json({ ok: true, drizzle: "connected" });
}

