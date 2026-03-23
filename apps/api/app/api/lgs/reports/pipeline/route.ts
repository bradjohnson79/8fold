import { NextResponse } from "next/server";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db/drizzle";
import { contractorLeads } from "@/db/schema/directoryEngine";
import { users } from "@/db/schema/user";
import { contractorAccounts } from "@/db/schema/contractorAccount";

export async function GET() {
  try {
    const [totalLeads, emailsSent, bounces, replies, signups, activeContractors, activeJobPosters] = await Promise.all([
      db.select({ c: sql<number>`count(*)::int` }).from(contractorLeads),
      db.select({ c: sql<number>`count(*)::int` }).from(contractorLeads).where(sql`${contractorLeads.contactAttempts} > 0`),
      db.select({ c: sql<number>`count(*)::int` }).from(contractorLeads).where(sql`coalesce(${contractorLeads.emailBounced}, false) = true`),
      db.select({ c: sql<number>`count(*)::int` }).from(contractorLeads).where(eq(contractorLeads.responseReceived, true)),
      db.select({ c: sql<number>`count(*)::int` }).from(contractorLeads).where(eq(contractorLeads.signedUp, true)),
      db.select({ c: sql<number>`count(*)::int` }).from(users).innerJoin(contractorAccounts, eq(users.id, contractorAccounts.userId)).where(sql`${users.role} = 'CONTRACTOR'`),
      db.select({ c: sql<number>`count(*)::int` }).from(users).where(sql`${users.role} = 'JOB_POSTER' AND ${users.status} = 'ACTIVE'`),
    ]);

    const toNum = (r: { c: unknown }[]) => Number((r[0] as { c: number })?.c ?? 0);

    const data = [
      { stage: "Total Leads", count: toNum(totalLeads) },
      { stage: "Emails Sent", count: toNum(emailsSent) },
      { stage: "Bounces", count: toNum(bounces) },
      { stage: "Replies", count: toNum(replies) },
      { stage: "Signed Up", count: toNum(signups) },
      { stage: "Active Contractors", count: toNum(activeContractors) },
      { stage: "Active Job Posters", count: toNum(activeJobPosters) },
    ];

    return NextResponse.json({ ok: true, data });
  } catch (err) {
    const code = (err as { cause?: { code?: string } })?.cause?.code;
    if (code === "42P01") {
      return NextResponse.json({
        ok: true,
        data: [
          { stage: "Total Leads", count: 0 },
          { stage: "Emails Sent", count: 0 },
          { stage: "Bounces", count: 0 },
          { stage: "Replies", count: 0 },
          { stage: "Signed Up", count: 0 },
          { stage: "Active Contractors", count: 0 },
          { stage: "Active Job Posters", count: 0 },
        ],
      });
    }
    console.error("LGS pipeline error:", err);
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
