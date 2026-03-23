/**
 * LGS: Trigger background email enrichment for pending leads.
 * POST /api/lgs/leads/enrich
 *
 * Queues a single batch of pending verification jobs and returns queue counts.
 * For large-scale enrichment, use the CLI worker instead.
 */
import { NextRequest, NextResponse } from "next/server";
import { eq, isNull, or, sql } from "drizzle-orm";
import { db } from "@/db/drizzle";
import { contractorLeads } from "@/db/schema/directoryEngine";
import { enqueueVerificationEmail } from "@/src/services/lgs/emailVerificationService";

const DEFAULT_BATCH = 25;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({})) as { batch_size?: number };
    const batchSize = Math.min(body.batch_size ?? DEFAULT_BATCH, 100);

    const leads = await db
      .select({ id: contractorLeads.id, email: contractorLeads.email })
      .from(contractorLeads)
      .where(
        sql`(
          ${contractorLeads.email} is not null
          and ${contractorLeads.email} != ''
          and (
            ${contractorLeads.emailVerificationStatus} = 'pending'
            or ${contractorLeads.emailVerificationStatus} is null
          )
        )
        `
      )
      .limit(batchSize);

    if (leads.length === 0) {
      return NextResponse.json({ ok: true, data: { processed: 0, pending: 0, message: "No pending leads" } });
    }

    let queued = 0;
    let cached = 0;
    let skipped = 0;
    for (const lead of leads) {
      if (!lead.email) {
        skipped++;
        continue;
      }
      const result = await enqueueVerificationEmail(lead.email);
      if (result.action === "queued") queued++;
      else if (result.action === "cached") cached++;
      else skipped++;
    }

    const [{ count: remaining }] = await db
      .select({ count: sql<number>`count(*)` })
      .from(contractorLeads)
      .where(
        sql`(
          ${contractorLeads.email} is not null
          and ${contractorLeads.email} != ''
          and (
            ${contractorLeads.emailVerificationStatus} = 'pending'
            or ${contractorLeads.emailVerificationStatus} is null
          )
        )
        `
      );

    return NextResponse.json({
      ok: true,
      data: { queued, cached, skipped, pending: Number(remaining) },
    });
  } catch (err) {
    console.error("LGS enrich error:", err);
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}

export async function GET() {
  try {
    const [{ count }] = await db
      .select({ count: sql<number>`count(*)` })
      .from(contractorLeads)
      .where(
        or(
          eq(contractorLeads.emailVerificationStatus, "pending"),
          isNull(contractorLeads.emailVerificationStatus)
        )
      );

    return NextResponse.json({ ok: true, data: { pending: Number(count) } });
  } catch (err) {
    console.error("LGS enrich status error:", err);
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
