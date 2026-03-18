/**
 * LGS: Regions — group contractor_leads by state + city with readiness status.
 */
import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/db/drizzle";
import { contractorLeads } from "@/db/schema/directoryEngine";

function readinessStatus(leads: number): string {
  if (leads >= 300) return "Launch Ready";
  if (leads >= 150) return "Strong";
  if (leads >= 50) return "Growing";
  return "Seeding";
}

function readinessColor(status: string): string {
  switch (status) {
    case "Launch Ready": return "#4ade80";
    case "Strong": return "#60a5fa";
    case "Growing": return "#facc15";
    default: return "#94a3b8";
  }
}

export async function GET() {
  try {
    const rows = await db
      .select({
        state: contractorLeads.state,
        city: contractorLeads.city,
        leads: sql<number>`count(*)::int`,
        emails_sent: sql<number>`count(*) filter (where ${contractorLeads.contactAttempts} > 0)::int`,
        responses: sql<number>`count(*) filter (where ${contractorLeads.responseReceived} = true)::int`,
        signups: sql<number>`count(*) filter (where ${contractorLeads.signedUp} = true)::int`,
      })
      .from(contractorLeads)
      .where(sql`(${contractorLeads.city} is not null and ${contractorLeads.city} != '') or (${contractorLeads.state} is not null and ${contractorLeads.state} != '')`)
      .groupBy(contractorLeads.state, contractorLeads.city)
      .orderBy(sql`count(*) desc`)
      .limit(200);

    // Also aggregate by state for summary
    const stateRows = await db
      .select({
        state: contractorLeads.state,
        leads: sql<number>`count(*)::int`,
        signups: sql<number>`count(*) filter (where ${contractorLeads.signedUp} = true)::int`,
      })
      .from(contractorLeads)
      .where(sql`${contractorLeads.state} is not null and ${contractorLeads.state} != ''`)
      .groupBy(contractorLeads.state)
      .orderBy(sql`count(*) desc`);

    const data = rows.map((r) => {
      const status = readinessStatus(r.leads);
      return {
        state: r.state ?? "",
        city: r.city ?? "",
        leads: r.leads,
        emails_sent: r.emails_sent,
        responses: r.responses,
        signups: r.signups,
        status,
        status_color: readinessColor(status),
      };
    });

    const by_state = stateRows.map((r) => ({
      state: r.state ?? "",
      leads: r.leads,
      signups: r.signups,
      status: readinessStatus(r.leads),
    }));

    return NextResponse.json({ ok: true, data, by_state });
  } catch (err) {
    const code = (err as { cause?: { code?: string } })?.cause?.code;
    if (code === "42P01") return NextResponse.json({ ok: true, data: [], by_state: [] });
    console.error("LGS regions error:", err);
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
