/**
 * LGS Outreach: List contractor contacts.
 */
import { NextResponse } from "next/server";
import { desc, eq, sql } from "drizzle-orm";
import { db } from "@/db/drizzle";
import { contractorContacts } from "@/db/schema/directoryEngine";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status");
    const limit = Math.min(parseInt(searchParams.get("limit") ?? "50", 10) || 50, 200);
    const offset = parseInt(searchParams.get("offset") ?? "0", 10) || 0;

    const whereClause = status ? eq(contractorContacts.status, status) : undefined;

    const [rows, countRow] = await Promise.all([
      db
        .select()
        .from(contractorContacts)
        .where(whereClause)
        .orderBy(desc(contractorContacts.createdAt))
        .limit(limit)
        .offset(offset),
      db
        .select({ c: sql<number>`count(*)::int` })
        .from(contractorContacts)
        .where(whereClause),
    ]);

    const total = Number(countRow[0]?.c ?? 0);
    return NextResponse.json({ ok: true, data: rows, total });
  } catch (err) {
    console.error("LGS outreach contacts list error:", err);
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
