/**
 * LGS: Conversion funnel aggregates.
 */
import { NextResponse } from "next/server";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db/drizzle";
import {
  contractorLeads,
  jobPosterLeads,
} from "@/db/schema/directoryEngine";

export async function GET() {
  try {
    const [
      contractorLeadRes,
      jobPosterLeadRes,
      sentContractorRes,
      sentJobPosterRes,
      bounceContractorRes,
      bounceJobPosterRes,
      replyContractorRes,
      replyJobPosterRes,
      signupsRes,
      activeContractorRes,
      activeJobPosterRes,
    ] = await Promise.all([
      db.select({ c: sql<number>`count(*)::int` }).from(contractorLeads),
      db.select({ c: sql<number>`count(*)::int` }).from(jobPosterLeads),
      db
        .select({ c: sql<number>`count(*)::int` })
        .from(contractorLeads)
        .where(sql`${contractorLeads.contactAttempts} > 0`),
      db
        .select({ c: sql<number>`count(*)::int` })
        .from(jobPosterLeads)
        .where(sql`${jobPosterLeads.contactAttempts} > 0`),
      db
        .select({ c: sql<number>`count(*)::int` })
        .from(contractorLeads)
        .where(sql`coalesce(${contractorLeads.emailBounced}, false) = true`),
      db
        .select({ c: sql<number>`count(*)::int` })
        .from(jobPosterLeads)
        .where(sql`coalesce(${jobPosterLeads.emailBounced}, false) = true`),
      db
        .select({ c: sql<number>`count(*)::int` })
        .from(contractorLeads)
        .where(eq(contractorLeads.responseReceived, true)),
      db
        .select({ c: sql<number>`count(*)::int` })
        .from(jobPosterLeads)
        .where(eq(jobPosterLeads.responseReceived, true)),
      db
        .select({ c: sql<number>`count(*)::int` })
        .from(contractorLeads)
        .where(eq(contractorLeads.signedUp, true)),
      db
        .select({ c: sql<number>`count(*)::int` })
        .from(contractorLeads)
        .where(eq(contractorLeads.archived, false)),
      db
        .select({ c: sql<number>`count(*)::int` })
        .from(jobPosterLeads)
        .where(eq(jobPosterLeads.archived, false)),
    ]);

    const toNum = (r: { c?: unknown }[]) => Number((r[0] as { c?: number })?.c ?? 0);
    const totalLeads = toNum(contractorLeadRes) + toNum(jobPosterLeadRes);
    const emailsSent = toNum(sentContractorRes) + toNum(sentJobPosterRes);
    const bounces = toNum(bounceContractorRes) + toNum(bounceJobPosterRes);
    const replies = toNum(replyContractorRes) + toNum(replyJobPosterRes);
    const signups = toNum(signupsRes);
    const activeContractors = toNum(activeContractorRes);
    const activeJobPosters = toNum(activeJobPosterRes);
    const bounceRate = emailsSent > 0 ? (bounces / emailsSent) * 100 : 0;
    const replyRate = emailsSent > 0 ? (replies / emailsSent) * 100 : 0;
    const conversionRate = emailsSent > 0 ? (signups / emailsSent) * 100 : 0;

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
