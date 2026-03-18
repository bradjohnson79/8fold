/**
 * LGS: Trigger background email enrichment for pending leads.
 * POST /api/lgs/leads/enrich
 *
 * Runs a single batch of verification inline and returns results.
 * For large-scale enrichment, use the CLI worker instead.
 */
import { NextRequest, NextResponse } from "next/server";
import { eq, sql, isNull, or } from "drizzle-orm";
import pLimit from "p-limit";
import { db } from "@/db/drizzle";
import { contractorLeads } from "@/db/schema/directoryEngine";
import EmailValidator from "email-deep-validator";

const validator = new EmailValidator({ timeout: 5000 });
const VERIFY_CONCURRENCY = 5;
const DEFAULT_BATCH = 25;
const ARCHIVE_THRESHOLD = 85;

async function verifyEmail(email: string): Promise<{ score: number; status: string }> {
  const normalized = email.trim().toLowerCase();
  if (!normalized.includes("@")) return { score: 0, status: "rejected" };
  try {
    const result = await validator.verify(normalized);
    let score = 0;
    if (result.wellFormed) score += 20;
    if (result.validDomain) score += 50;
    if (result.validMailbox === true) score += 20;
    else if (result.validMailbox === null) score += 10;
    if (result.validDomain && result.validMailbox === true) score += 10;
    if (score >= 80) return { score, status: "verified" };
    if (score >= 70) return { score, status: "qualified" };
    return { score, status: "low_quality" };
  } catch {
    return { score: 0, status: "verification_failed" };
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({})) as { batch_size?: number };
    const batchSize = Math.min(body.batch_size ?? DEFAULT_BATCH, 100);

    const leads = await db
      .select({ id: contractorLeads.id, email: contractorLeads.email })
      .from(contractorLeads)
      .where(
        or(
          eq(contractorLeads.verificationStatus, "pending"),
          isNull(contractorLeads.verificationStatus)
        )
      )
      .limit(batchSize);

    if (leads.length === 0) {
      return NextResponse.json({ ok: true, data: { processed: 0, pending: 0, message: "No pending leads" } });
    }

    const limit = pLimit(VERIFY_CONCURRENCY);
    let verified = 0;
    let archived = 0;
    let failed = 0;

    await Promise.allSettled(
      leads.map((lead) =>
        limit(async () => {
          const { score, status } = await verifyEmail(lead.email);
          const shouldArchive = score > 0 && score < ARCHIVE_THRESHOLD;

          await db
            .update(contractorLeads)
            .set({
              verificationScore: score,
              verificationStatus: status,
              verificationSource: "enrichment_api",
              archived: shouldArchive ? true : undefined,
              archivedAt: shouldArchive ? new Date() : undefined,
            })
            .where(eq(contractorLeads.id, lead.id));

          verified++;
          if (shouldArchive) archived++;
        })
      )
    );

    failed = leads.length - verified;

    const [{ count: remaining }] = await db
      .select({ count: sql<number>`count(*)` })
      .from(contractorLeads)
      .where(
        or(
          eq(contractorLeads.verificationStatus, "pending"),
          isNull(contractorLeads.verificationStatus)
        )
      );

    return NextResponse.json({
      ok: true,
      data: { processed: verified, archived, failed, pending: Number(remaining) },
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
          eq(contractorLeads.verificationStatus, "pending"),
          isNull(contractorLeads.verificationStatus)
        )
      );

    return NextResponse.json({ ok: true, data: { pending: Number(count) } });
  } catch (err) {
    console.error("LGS enrich status error:", err);
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
