/**
 * LGS: Conversion funnel aggregates.
 */
import { NextResponse } from "next/server";
import { desc, eq, sql } from "drizzle-orm";
import { db } from "@/db/drizzle";
import {
  contractorLeads,
  discoveryRuns,
  outreachMessages,
  senderPool,
} from "@/db/schema/directoryEngine";
import { users } from "@/db/schema/user";
import { contractorAccounts } from "@/db/schema/contractorAccount";

function getTodayMidnightPacific(): Date {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = formatter.formatToParts(now);
  const y = parts.find((p) => p.type === "year")?.value ?? "2025";
  const m = parts.find((p) => p.type === "month")?.value ?? "01";
  const d = parts.find((p) => p.type === "day")?.value ?? "01";
  return new Date(`${y}-${m}-${d}T08:00:00.000Z`);
}

export async function GET() {
  try {
    const midnight = getTodayMidnightPacific();
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const [
      leadsRes,
      emailsSentRes,
      responsesRes,
      signupsRes,
      activeRes,
      emailsTodayRes,
      emailsWeekRes,
      bouncedRes,
      verifiedRes,
      discoveryRunRes,
      messagesGeneratedRes,
      messagesApprovedRes,
    ] = await Promise.all([
      db.select({ c: sql<number>`count(*)::int` }).from(contractorLeads),
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
      db.select({ total: sql<number>`coalesce(sum(${senderPool.sentToday}), 0)::int` }).from(senderPool),
      db
        .select({ c: sql<number>`count(*)::int` })
        .from(contractorLeads)
        .where(
          sql`${contractorLeads.contactAttempts} > 0 and ${contractorLeads.emailDate} >= ${weekAgo}`
        ),
      db
        .select({ c: sql<number>`count(*)::int` })
        .from(contractorLeads)
        .where(sql`coalesce(${contractorLeads.emailBounced}, false) = true`),
      db
        .select({ c: sql<number>`count(*)::int` })
        .from(contractorLeads)
        .where(eq(contractorLeads.verificationStatus, "verified")),
      db
        .select()
        .from(discoveryRuns)
        .orderBy(desc(discoveryRuns.createdAt))
        .limit(1),
      db.select({ c: sql<number>`count(*)::int` }).from(outreachMessages),
      db
        .select({ c: sql<number>`count(*)::int` })
        .from(outreachMessages)
        .where(eq(outreachMessages.status, "approved")),
    ]);

    const toNum = (r: { c?: unknown; total?: unknown }[]) =>
      Number((r[0] as { c?: number; total?: number })?.c ?? (r[0] as { total?: number })?.total ?? 0);
    const leads = toNum(leadsRes);
    const emailsSent = toNum(emailsSentRes);
    const responses = toNum(responsesRes);
    const signups = toNum(signupsRes);
    const activeContractors = toNum(activeRes);
    const emailsSentToday = toNum(emailsTodayRes);
    const emailsSentWeek = toNum(emailsWeekRes);
    const bounced = toNum(bouncedRes);
    const bounceRate = emailsSent > 0 ? (bounced / emailsSent) * 100 : 0;
    const verifiedCount = toNum(verifiedRes);
    const verificationRate = leads > 0 ? (verifiedCount / leads) * 100 : 0;
    const outreachConversionRate = emailsSent > 0 ? (signups / emailsSent) * 100 : 0;
    const latestRun = discoveryRunRes[0] as { domainsProcessed?: number; successfulDomains?: number } | undefined;
    const discoverySuccessRate =
      latestRun?.domainsProcessed && latestRun.domainsProcessed > 0
        ? ((latestRun.successfulDomains ?? 0) / latestRun.domainsProcessed) * 100
        : 0;
    const messagesGenerated = toNum(messagesGeneratedRes);
    const messagesApproved = toNum(messagesApprovedRes);

    return NextResponse.json({
      ok: true,
      data: {
        leads,
        verified_leads: verifiedCount,
        emails_sent: emailsSent,
        emails_sent_today: emailsSentToday,
        emails_sent_week: emailsSentWeek,
        responses,
        signups,
        active_contractors: activeContractors,
        messages_generated: messagesGenerated,
        messages_approved: messagesApproved,
        bounce_rate: Math.round(bounceRate * 10) / 10,
        verification_rate: Math.round(verificationRate * 10) / 10,
        outreach_conversion_rate: Math.round(outreachConversionRate * 10) / 10,
        discovery_success_rate: Math.round(discoverySuccessRate * 10) / 10,
      },
    });
  } catch (err) {
    const code = (err as { cause?: { code?: string } })?.cause?.code;
    if (code === "42P01") {
      return NextResponse.json({
        ok: true,
        data: {
          leads: 0,
          verified_leads: 0,
          emails_sent: 0,
          emails_sent_today: 0,
          emails_sent_week: 0,
          responses: 0,
          signups: 0,
          active_contractors: 0,
          messages_generated: 0,
          messages_approved: 0,
          bounce_rate: 0,
          verification_rate: 0,
          outreach_conversion_rate: 0,
          discovery_success_rate: 0,
        },
      });
    }
    console.error("LGS funnel error:", err);
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
