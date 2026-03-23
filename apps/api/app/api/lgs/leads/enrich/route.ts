/**
 * LGS: Trigger a single verification batch for pending leads.
 * POST /api/lgs/leads/enrich
 */
import { NextRequest, NextResponse } from "next/server";
import { eq, sql, isNull, or } from "drizzle-orm";
import pLimit from "p-limit";
import { db } from "@/db/drizzle";
import { contractorLeads } from "@/db/schema/directoryEngine";
import EmailValidator from "email-deep-validator";
import {
  PENDING_24H_WINDOW_HOURS,
  VERIFY_CONCURRENCY,
  canRetryVerification,
  verifyLeadEmail,
} from "@/src/services/lgs/simpleEmailVerification";

const validator = new EmailValidator({ timeout: 5000 });
const DEFAULT_BATCH = 25;

async function readPending24hPlusCount(): Promise<number> {
  const threshold = new Date(Date.now() - PENDING_24H_WINDOW_HOURS * 60 * 60 * 1000);
  const [{ count }] = await db
    .select({
      count: sql<number>`count(*)::int`,
    })
    .from(contractorLeads)
    .where(
      sql`(
        ${contractorLeads.verificationStatus} IS NULL
        OR ${contractorLeads.verificationStatus} = 'pending'
      )
      AND ${contractorLeads.createdAt} <= ${threshold}`
    );

  return Number(count ?? 0);
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({})) as { batch_size?: number };
    const batchSize = Math.min(body.batch_size ?? DEFAULT_BATCH, 100);

    const leads = await db
      .select({
        id: contractorLeads.id,
        email: contractorLeads.email,
        verificationSource: contractorLeads.verificationSource,
      })
      .from(contractorLeads)
      .where(
        or(
          eq(contractorLeads.verificationStatus, "pending"),
          isNull(contractorLeads.verificationStatus)
        )
      )
      .limit(batchSize * 4);

    const retryableLeads = leads
      .filter((lead) => canRetryVerification(lead.verificationSource))
      .slice(0, batchSize);

    if (retryableLeads.length === 0) {
      const [{ count: remaining }] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(contractorLeads)
        .where(
          or(
            eq(contractorLeads.verificationStatus, "pending"),
            isNull(contractorLeads.verificationStatus)
          )
        );
      const pending24hPlus = await readPending24hPlusCount();
      if (pending24hPlus > 0) {
        console.info(`[LGS verify] pending_24h_plus=${pending24hPlus}`);
      }
      return NextResponse.json({
        ok: true,
        data: {
          processed: 0,
          pending: Number(remaining ?? 0),
          pending_24h_plus: pending24hPlus,
          message: leads.length === 0 ? "No pending leads" : "Pending leads are already at retry cap",
        },
      });
    }

    const limit = pLimit(VERIFY_CONCURRENCY);
    const domainCache = new Map<string, { score: number; status: "pending" | "valid" | "invalid" }>();
    let valid = 0;
    let invalid = 0;
    let pending = 0;
    let failed = 0;

    const results = await Promise.allSettled(
      retryableLeads.map((lead) =>
        limit(async () => {
          const result = await verifyLeadEmail({
            email: lead.email,
            previousSource: lead.verificationSource,
            validator,
            channel: "enrichment_api",
            domainCache,
          });

          await db
            .update(contractorLeads)
            .set({
              verificationScore: result.score,
              verificationStatus: result.status,
              verificationSource: result.source,
              updatedAt: new Date(),
            })
            .where(eq(contractorLeads.id, lead.id));

          return result;
        })
      )
    );

    for (const result of results) {
      if (result.status === "rejected") {
        failed++;
        continue;
      }
      if (result.value.status === "valid") valid++;
      else if (result.value.status === "invalid") invalid++;
      else pending++;
    }

    const [{ count: remaining }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(contractorLeads)
      .where(
        or(
          eq(contractorLeads.verificationStatus, "pending"),
          isNull(contractorLeads.verificationStatus)
        )
      );
    const pending24hPlus = await readPending24hPlusCount();
    if (pending24hPlus > 0) {
      console.info(`[LGS verify] pending_24h_plus=${pending24hPlus}`);
    }

    return NextResponse.json({
      ok: true,
      data: {
        processed: retryableLeads.length,
        valid,
        invalid,
        pending,
        failed,
        pending_total: Number(remaining),
        pending_24h_plus: pending24hPlus,
      },
    });
  } catch (err) {
    console.error("LGS enrich error:", err);
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}

export async function GET() {
  try {
    const [{ count }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(contractorLeads)
      .where(
        or(
          eq(contractorLeads.verificationStatus, "pending"),
          isNull(contractorLeads.verificationStatus)
        )
      );
    const pending24hPlus = await readPending24hPlusCount();

    return NextResponse.json({
      ok: true,
      data: {
        pending: Number(count),
        pending_24h_plus: pending24hPlus,
      },
    });
  } catch (err) {
    console.error("LGS enrich status error:", err);
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
