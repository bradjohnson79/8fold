/**
 * LGS: Channel performance report (with ROI).
 */
import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/db/drizzle";
import { contractorLeads, acquisitionChannels } from "@/db/schema/directoryEngine";

export async function GET() {
  try {
    const rows = await db
      .select({
        source: contractorLeads.source,
        leads: sql<number>`count(*)::int`,
        emailsSent: sql<number>`count(*) filter (where ${contractorLeads.contactAttempts} > 0)::int`,
        responses: sql<number>`count(*) filter (where ${contractorLeads.responseReceived} = true)::int`,
        signups: sql<number>`count(*) filter (where ${contractorLeads.signedUp} = true)::int`,
      })
      .from(contractorLeads)
      .where(sql`${contractorLeads.source} is not null and ${contractorLeads.source} != ''`)
      .groupBy(contractorLeads.source);

    const channels = await db.select().from(acquisitionChannels);
    const costByChannel = Object.fromEntries(channels.map((c) => [c.name, c.costCents ?? 0]));

    const data = rows.map((r) => {
      const costCents = costByChannel[r.source ?? ""] ?? 0;
      const costDollars = costCents / 100;
      const costPerSignup = r.signups > 0 ? costDollars / r.signups : null;
      return {
        channel: r.source,
        leads: r.leads,
        emails_sent: r.emailsSent,
        responses: r.responses,
        signups: r.signups,
        conversion: r.leads > 0 ? ((r.signups / r.leads) * 100).toFixed(1) + "%" : "0%",
        cost: costDollars.toFixed(2),
        cost_per_signup: costPerSignup != null ? "$" + costPerSignup.toFixed(2) : null,
      };
    });

    return NextResponse.json({ ok: true, data });
  } catch (err) {
    const code = (err as { cause?: { code?: string } })?.cause?.code;
    if (code === "42P01") return NextResponse.json({ ok: true, data: [] });
    console.error("LGS channels error:", err);
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
