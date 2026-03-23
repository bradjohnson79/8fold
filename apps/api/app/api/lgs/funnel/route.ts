import { NextResponse } from "next/server";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db/drizzle";
import { contractorLeads } from "@/db/schema/directoryEngine";
import { users } from "@/db/schema/user";
import { contractorAccounts } from "@/db/schema/contractorAccount";

export async function GET() {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [
      totalLeadsRes,
      emailsSentRes,
      bouncesRes,
      repliesRes,
      signupsRes,
      activeContractorsRes,
      activeJobPostersRes,
      sendsTodayRes,
      repliesTodayRes,
    ] = await Promise.all([
      db.select({ c: sql<number>`count(*)::int` }).from(contractorLeads),
      db
        .select({ c: sql<number>`count(*)::int` })
        .from(contractorLeads)
        .where(sql`${contractorLeads.contactAttempts} > 0`),
      db
        .select({ c: sql<number>`count(*)::int` })
        .from(contractorLeads)
        .where(sql`coalesce(${contractorLeads.emailBounced}, false) = true`),
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
      db
        .select({ c: sql<number>`count(*)::int` })
        .from(users)
        .where(sql`${users.role} = 'JOB_POSTER' AND ${users.status} = 'ACTIVE'`),
      db
        .select({ c: sql<number>`count(*)::int` })
        .from(contractorLeads)
        .where(sql`${contractorLeads.lastContactedAt} >= ${today}`),
      db
        .select({ c: sql<number>`count(*)::int` })
        .from(contractorLeads)
        .where(sql`${contractorLeads.lastRepliedAt} >= ${today}`),
    ]);

    const toNum = (r: { c?: unknown }[]) => Number((r[0] as { c?: number })?.c ?? 0);

    const totalLeads = toNum(totalLeadsRes);
    const emailsSent = toNum(emailsSentRes);
    const bounces = toNum(bouncesRes);
    const replies = toNum(repliesRes);
    const signups = toNum(signupsRes);
    const activeContractors = toNum(activeContractorsRes);
    const activeJobPosters = toNum(activeJobPostersRes);
    const sendsToday = toNum(sendsTodayRes);
    const repliesToday = toNum(repliesTodayRes);

    const bounceRate = emailsSent > 0 ? (bounces / emailsSent) * 100 : 0;
    const replyRate = emailsSent > 0 ? (replies / emailsSent) * 100 : 0;
    const conversionRate = totalLeads > 0 ? (signups / totalLeads) * 100 : 0;

    return NextResponse.json({
      ok: true,
      data: {
        total_leads: totalLeads,
        emails_sent: emailsSent,
        bounces,
        replies,
        signups,
        active_contractors: activeContractors,
        active_job_posters: activeJobPosters,
        sends_today: sendsToday,
        replies_today: repliesToday,
        bounce_rate: Math.round(bounceRate * 10) / 10,
        reply_rate: Math.round(replyRate * 10) / 10,
        conversion_rate: Math.round(conversionRate * 10) / 10,
      },
    });
  } catch (err) {
    const code = (err as { cause?: { code?: string } })?.cause?.code;
    if (code === "42P01") {
      return NextResponse.json({
        ok: true,
        data: {
          total_leads: 0,
          emails_sent: 0,
          bounces: 0,
          replies: 0,
          signups: 0,
          active_contractors: 0,
          active_job_posters: 0,
          sends_today: 0,
          replies_today: 0,
          bounce_rate: 0,
          reply_rate: 0,
          conversion_rate: 0,
        },
      });
    }
    console.error("LGS funnel error:", err);
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
