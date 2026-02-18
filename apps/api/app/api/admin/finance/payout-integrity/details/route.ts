import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/src/lib/auth/requireAdmin";
import { handleApiError } from "@/src/lib/errorHandler";
import { loadPayoutIntegritySnapshotFromDb } from "@/src/payouts/payoutIntegritySnapshot";
import { auditPayoutIntegrity } from "@/src/payouts/payoutIntegrityAudit";

const QuerySchema = z.object({
  take: z.coerce.number().int().min(1).max(2000).optional(),
  orphanDays: z.coerce.number().int().min(1).max(3650).optional(),
});

export async function GET(req: Request) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  try {
    const url = new URL(req.url);
    const parsed = QuerySchema.safeParse({
      take: url.searchParams.get("take") ?? undefined,
      orphanDays: url.searchParams.get("orphanDays") ?? undefined,
    });
    if (!parsed.success) return NextResponse.json({ ok: false, error: "invalid_query" }, { status: 400 });

    const take = parsed.data.take ?? 500;
    const orphanDays = parsed.data.orphanDays ?? 180;

    const snap = await loadPayoutIntegritySnapshotFromDb({ take, orphanDays });
    const audit = auditPayoutIntegrity({
      releasedJobs: snap.releasedJobs.map((j) => ({ id: j.id, payoutStatus: j.payoutStatus, amountCents: j.amountCents, currency: j.currency })),
      escrows: snap.escrows,
      transferRecords: snap.transferRecords,
      ledgerEntries: snap.ledgerEntries,
      orphanTransferRecords: snap.orphanTransferRecords,
    });

    const jobsById = new Map(snap.releasedJobs.map((j) => [j.id, j] as const));
    const transfersByJob = new Map<string, any[]>();
    for (const tr of snap.transferRecords) {
      const arr = transfersByJob.get(tr.jobId) ?? [];
      arr.push(tr);
      transfersByJob.set(tr.jobId, arr);
    }

    // Deterministic ordering: `audit.violations` is already sorted by severity/type/jobId/transferRecordId.
    const grouped = { CRITICAL: [] as any[], HIGH: [] as any[], WARN: [] as any[] };
    const perJob = new Map<string, any>();

    for (const v of audit.violations as any[]) {
      const sev = String(v.severity ?? "WARN").toUpperCase();
      (grouped as any)[sev]?.push(v);

      const jobId = String(v.jobId ?? "");
      const job = jobsById.get(jobId) ?? null;

      const key = jobId || "unknown";
      if (!perJob.has(key)) {
        perJob.set(key, {
          jobId: key,
          createdAt: job?.createdAt ?? null,
          releasedAt: job?.releasedAt ?? null,
          amountCents: job?.amountCents ?? null,
          currency: job?.currency ?? null,
          transferLegs: (transfersByJob.get(key) ?? []).map((t: any) => ({
            id: t.id,
            role: t.role,
            status: t.status,
            amountCents: t.amountCents,
            currency: t.currency,
            method: t.method,
            stripeTransferId: t.stripeTransferId,
            externalRef: t.externalRef,
          })),
          violations: [] as any[],
        });
      }
      perJob.get(key).violations.push(v);
    }

    const jobs = Array.from(perJob.values()).sort((a, b) => String(a.jobId).localeCompare(String(b.jobId)));

    const rows = (audit.violations as any[]).map((v) => {
      const job = jobsById.get(String(v.jobId ?? "")) ?? null;
      return {
        severity: v.severity,
        jobId: String(v.jobId ?? ""),
        createdAt: job?.createdAt ?? null,
        releasedAt: job?.releasedAt ?? null,
        code: v.type,
        message: v.message,
        suggestedAction: v.suggestedAction ?? null,
        details: v.details ?? null,
      };
    });

    return NextResponse.json(
      {
        ok: true,
        data: {
          generatedAt: new Date().toISOString(),
          window: { take, orphanDays },
          summary: audit.summary,
          violationsBySeverity: grouped,
          jobs,
          rows,
        },
      },
      { status: 200 },
    );
  } catch (err) {
    return handleApiError(err, "GET /api/admin/finance/payout-integrity/details", { userId: auth.userId });
  }
}

