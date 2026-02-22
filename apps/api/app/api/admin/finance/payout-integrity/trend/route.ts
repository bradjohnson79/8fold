import { NextResponse } from "next/server";
import { z } from "zod";
import { and, eq, gte, inArray, sql } from "drizzle-orm";
import { requireAdmin } from "@/src/lib/auth/requireAdmin";
import { handleApiError } from "@/src/lib/errorHandler";
import { db } from "@/server/db/drizzle";
import { jobs } from "@/db/schema/job";
import { escrows } from "@/db/schema/escrow";
import { transferRecords } from "@/db/schema/transferRecord";
import { ledgerEntries } from "@/db/schema/ledgerEntry";
import { auditPayoutIntegrity } from "@/src/payouts/payoutIntegrityAudit";

const QuerySchema = z.object({
  days: z.coerce.number().int().min(1).max(180).optional(),
  maxJobs: z.coerce.number().int().min(1).max(10000).optional(),
});

function dayKey(d: Date) {
  return d.toISOString().slice(0, 10);
}

export async function GET(req: Request) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  try {
    const url = new URL(req.url);
    const parsed = QuerySchema.safeParse({
      days: url.searchParams.get("days") ?? undefined,
      maxJobs: url.searchParams.get("maxJobs") ?? undefined,
    });
    if (!parsed.success) return NextResponse.json({ ok: false, error: "invalid_query" }, { status: 400 });

    const days = parsed.data.days ?? 30;
    const maxJobs = parsed.data.maxJobs ?? 5000;
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    // 1) Released jobs per day (SQL).
    const releasedByDay = await db
      .select({
        day: sql<string>`to_char(date_trunc('day', ${jobs.released_at}), 'YYYY-MM-DD')`,
        releasedJobs: sql<number>`count(*)::int`,
      })
      .from(jobs)
      .where(and(eq(jobs.payout_status, "RELEASED" as any), gte(jobs.released_at, since as any)))
      .groupBy(sql`date_trunc('day', ${jobs.released_at})`)
      .orderBy(sql`date_trunc('day', ${jobs.released_at})`);

    // 2) For violation counts, pull the released jobs in window (bounded).
    const releasedJobs = await db
      .select({
        id: jobs.id,
        payoutStatus: jobs.payout_status,
        amountCents: jobs.amount_cents,
        currency: jobs.currency,
        releasedAt: jobs.released_at,
      })
      .from(jobs)
      .where(and(eq(jobs.payout_status, "RELEASED" as any), gte(jobs.released_at, since as any)))
      .orderBy(sql`${jobs.released_at} desc`)
      .limit(maxJobs);

    const jobIds = releasedJobs.map((j) => String(j.id)).filter(Boolean);
    const byJobReleasedDay = new Map<string, string>();
    for (const j of releasedJobs as any[]) {
      const d = j.releasedAt instanceof Date ? j.releasedAt : j.releasedAt ? new Date(j.releasedAt) : null;
      if (!d) continue;
      byJobReleasedDay.set(String(j.id), dayKey(d));
    }

    const [escrowRows, transferRows, ledgerRows] = jobIds.length
      ? await Promise.all([
          db
            .select({
              id: escrows.id,
              jobId: escrows.jobId,
              kind: escrows.kind,
              status: escrows.status,
              amountCents: escrows.amountCents,
              currency: escrows.currency,
              releasedAt: escrows.releasedAt,
            })
            .from(escrows)
            .where(and(inArray(escrows.jobId, jobIds), eq(escrows.kind, "JOB_ESCROW" as any))),
          db
            .select({
              id: transferRecords.id,
              jobId: transferRecords.jobId,
              role: transferRecords.role,
              userId: transferRecords.userId,
              amountCents: transferRecords.amountCents,
              currency: transferRecords.currency,
              method: transferRecords.method,
              status: transferRecords.status,
              stripeTransferId: transferRecords.stripeTransferId,
              externalRef: transferRecords.externalRef,
            })
            .from(transferRecords)
            .where(inArray(transferRecords.jobId, jobIds)),
          db
            .select({
              id: ledgerEntries.id,
              userId: ledgerEntries.userId,
              jobId: ledgerEntries.jobId,
              escrowId: ledgerEntries.escrowId,
              type: ledgerEntries.type,
              direction: ledgerEntries.direction,
              bucket: ledgerEntries.bucket,
              amountCents: ledgerEntries.amountCents,
              currency: ledgerEntries.currency,
              stripeRef: ledgerEntries.stripeRef,
            })
            .from(ledgerEntries)
            .where(inArray(ledgerEntries.jobId, jobIds)),
        ])
      : [[], [], []];

    const audit = auditPayoutIntegrity({
      releasedJobs: releasedJobs.map((j: any) => ({
        id: String(j.id),
        payoutStatus: String(j.payoutStatus ?? ""),
        amountCents: Number(j.amountCents ?? 0),
        currency: String(j.currency ?? ""),
      })),
      escrows: escrowRows.map((e: any) => ({
        id: String(e.id),
        jobId: String(e.jobId),
        kind: String(e.kind ?? ""),
        status: String(e.status ?? ""),
        amountCents: Number(e.amountCents ?? 0),
        currency: String(e.currency ?? ""),
        releasedAt: e.releasedAt ? (e.releasedAt as Date).toISOString() : null,
      })),
      transferRecords: transferRows.map((t: any) => ({
        id: String(t.id),
        jobId: String(t.jobId),
        role: String(t.role ?? ""),
        userId: String(t.userId ?? ""),
        amountCents: Number(t.amountCents ?? 0),
        currency: String(t.currency ?? ""),
        method: String(t.method ?? ""),
        status: String(t.status ?? ""),
        stripeTransferId: t.stripeTransferId ? String(t.stripeTransferId) : null,
        externalRef: t.externalRef ? String(t.externalRef) : null,
      })),
      ledgerEntries: ledgerRows.map((le: any) => ({
        id: String(le.id),
        userId: String(le.userId ?? ""),
        jobId: le.jobId ? String(le.jobId) : null,
        escrowId: le.escrowId ? String(le.escrowId) : null,
        type: String(le.type ?? ""),
        direction: String(le.direction ?? ""),
        bucket: String(le.bucket ?? ""),
        amountCents: Number(le.amountCents ?? 0),
        currency: String(le.currency ?? ""),
        stripeRef: le.stripeRef ? String(le.stripeRef) : null,
      })),
      orphanTransferRecords: [],
    });

    const violationsByDay: Record<string, { CRITICAL: number; HIGH: number; WARN: number }> = {};
    const aggregate: { CRITICAL: number; HIGH: number; WARN: number } = { CRITICAL: 0, HIGH: 0, WARN: 0 };

    for (const v of audit.violations as any[]) {
      const sev = String(v.severity ?? "WARN").toUpperCase();
      const jobId = String(v.jobId ?? "");
      const day = byJobReleasedDay.get(jobId) ?? null;
      if (!day) {
        // e.g. aggregate violations
        (aggregate as any)[sev] = ((aggregate as any)[sev] ?? 0) + 1;
        continue;
      }
      violationsByDay[day] ||= { CRITICAL: 0, HIGH: 0, WARN: 0 };
      (violationsByDay[day] as any)[sev] = ((violationsByDay[day] as any)[sev] ?? 0) + 1;
    }

    const daysOut = releasedByDay.map((r: any) => {
      const d = String(r.day ?? "");
      return {
        day: d,
        releasedJobs: Number(r.releasedJobs ?? 0),
        violations: violationsByDay[d] ?? { CRITICAL: 0, HIGH: 0, WARN: 0 },
      };
    });

    return NextResponse.json(
      {
        ok: true,
        data: {
          generatedAt: new Date().toISOString(),
          window: { days, since: since.toISOString(), maxJobs },
          days: daysOut,
          aggregateViolationsOutsideWindow: aggregate,
        },
      },
      { status: 200 },
    );
  } catch (err) {
    return handleApiError(err, "GET /api/admin/finance/payout-integrity/trend", { userId: auth.userId });
  }
}

