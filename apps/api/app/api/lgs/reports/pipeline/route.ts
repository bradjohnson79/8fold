/**
 * LGS: Pipeline report (stage counts).
 */
import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/db/drizzle";
import { contractorLeads } from "@/db/schema/directoryEngine";
import { users } from "@/db/schema/user";
import { contractorAccounts } from "@/db/schema/contractorAccount";
import { eq } from "drizzle-orm";

export async function GET() {
  try {
    const [newLeads, contacted, responded, signups, activeRes] = await Promise.all([
      db.select({ c: sql<number>`count(*)::int` }).from(contractorLeads).where(eq(contractorLeads.status, "new")),
      db
        .select({ c: sql<number>`count(*)::int` })
        .from(contractorLeads)
        .where(sql`${contractorLeads.contactAttempts} > 0`),
      db
        .select({ c: sql<number>`count(*)::int` })
        .from(contractorLeads)
        .where(eq(contractorLeads.responseReceived, true)),
      db
        .select({ c: sql<number>`count(*)::int` })
        .from(contractorLeads)
        .where(eq(contractorLeads.signedUp, true)),
      db
        .select({ c: sql<number>`count(*)::int` })
        .from(users)
        .innerJoin(contractorAccounts, eq(users.id, contractorAccounts.userId))
        .where(sql`${users.role} = 'CONTRACTOR'`),
    ]);

    const toNum = (r: { c: unknown }[]) => Number((r[0] as { c: number })?.c ?? 0);

    const data = [
      { stage: "New Leads", count: toNum(newLeads) },
      { stage: "Contacted", count: toNum(contacted) },
      { stage: "Responded", count: toNum(responded) },
      { stage: "Signed Up", count: toNum(signups) },
      { stage: "Active Contractors", count: toNum(activeRes) },
    ];

    return NextResponse.json({ ok: true, data });
  } catch (err) {
    const code = (err as { cause?: { code?: string } })?.cause?.code;
    if (code === "42P01") {
      return NextResponse.json({
        ok: true,
        data: [
          { stage: "New Leads", count: 0 },
          { stage: "Contacted", count: 0 },
          { stage: "Responded", count: 0 },
          { stage: "Signed Up", count: 0 },
          { stage: "Active Contractors", count: 0 },
        ],
      });
    }
    console.error("LGS pipeline error:", err);
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
