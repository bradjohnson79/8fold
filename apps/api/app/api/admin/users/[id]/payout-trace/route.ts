import { NextResponse } from "next/server";
import { z } from "zod";
import { and, desc, eq, sql } from "drizzle-orm";
import { requireAdmin } from "@/src/lib/auth/requireAdmin";
import { handleApiError } from "@/src/lib/errorHandler";
import { db } from "@/server/db/drizzle";
import { transferRecords } from "@/db/schema/transferRecord";
import { ledgerEntries } from "@/db/schema/ledgerEntry";
import { jobs } from "@/db/schema/job";
import { users } from "@/db/schema/user";

function getIdFromUrl(req: Request): string {
  const url = new URL(req.url);
  const parts = url.pathname.split("/");
  // .../users/:id/payout-trace
  return parts[parts.length - 2] ?? "";
}

const QuerySchema = z.object({
  take: z.coerce.number().int().min(1).max(500).optional(),
});

export async function GET(req: Request) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  try {
    const userId = getIdFromUrl(req);
    if (!userId) return NextResponse.json({ ok: false, error: "invalid_user_id" }, { status: 400 });

    const url = new URL(req.url);
    const parsed = QuerySchema.safeParse({ take: url.searchParams.get("take") ?? undefined });
    if (!parsed.success) return NextResponse.json({ ok: false, error: "invalid_query" }, { status: 400 });
    const take = parsed.data.take ?? 200;

    const userRow = await db
      .select({ id: users.id, email: users.email, role: users.role })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    if (!userRow[0]?.id) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });

    const rows = await db
      .select({
        id: transferRecords.id,
        createdAt: transferRecords.createdAt,
        releasedAt: transferRecords.releasedAt,
        status: transferRecords.status,
        method: transferRecords.method,
        role: transferRecords.role,
        jobId: transferRecords.jobId,
        amountCents: transferRecords.amountCents,
        currency: transferRecords.currency,
        stripeTransferId: transferRecords.stripeTransferId,
        externalRef: transferRecords.externalRef,
        failureReason: transferRecords.failureReason,
        job: { id: jobs.id, title: jobs.title, payoutStatus: jobs.payoutStatus },
      })
      .from(transferRecords)
      .leftJoin(jobs, eq(jobs.id, transferRecords.jobId))
      .where(eq(transferRecords.userId, userId))
      .orderBy(desc(transferRecords.createdAt))
      .limit(take);

    const items = rows.map((r: any) => ({
      id: String(r.id),
      createdAt: (r.createdAt as Date)?.toISOString?.() ?? String(r.createdAt ?? ""),
      releasedAt: r.releasedAt ? ((r.releasedAt as Date)?.toISOString?.() ?? String(r.releasedAt)) : null,
      status: String(r.status ?? ""),
      method: String(r.method ?? ""),
      role: String(r.role ?? ""),
      jobId: String(r.jobId ?? ""),
      amountCents: Number(r.amountCents ?? 0),
      currency: String(r.currency ?? ""),
      stripeTransferId: r.stripeTransferId ?? null,
      externalRef: r.externalRef ?? null,
      failureReason: r.failureReason ?? null,
      job: r.job?.id ? { id: String(r.job.id), title: r.job.title ?? null, payoutStatus: r.job.payoutStatus ?? null } : null,
    }));

    const sumBy = (pred: (r: any) => boolean) => items.filter(pred).reduce((acc, r) => acc + Number(r.amountCents ?? 0), 0);

    const totals = {
      sentCents: sumBy((r) => r.status === "SENT"),
      pendingCents: sumBy((r) => r.status === "PENDING"),
      failedCents: sumBy((r) => r.status === "FAILED"),
      stripeSentCents: sumBy((r) => r.status === "SENT" && r.method === "STRIPE"),
      paypalSentCents: sumBy((r) => r.status === "SENT" && r.method === "PAYPAL"),
    };

    const walletRows = await db
      .select({
        bucket: ledgerEntries.bucket,
        direction: ledgerEntries.direction,
        sumAmountCents: sql<number>`sum(${ledgerEntries.amountCents})::int`,
      })
      .from(ledgerEntries)
      .where(eq(ledgerEntries.userId, userId))
      .groupBy(ledgerEntries.bucket, ledgerEntries.direction);
    const walletTotals = { PENDING: 0, AVAILABLE: 0, PAID: 0, HELD: 0 } as Record<string, number>;
    for (const r of walletRows) {
      const sum = Number((r as any).sumAmountCents ?? 0);
      const signed = String(r.direction) === "CREDIT" ? sum : -sum;
      const b = String(r.bucket ?? "");
      if (b in walletTotals) walletTotals[b] = (walletTotals[b] ?? 0) + signed;
    }

    // Sanity: transfers marked SENT should have a matching PAYOUT credit ledger row.
    const sentLegs = items.filter((r) => r.status === "SENT" && (r.method === "STRIPE" || r.method === "PAYPAL"));
    let missingLedgerEvidence = 0;
    for (const t of sentLegs.slice(0, 250)) {
      const ref = t.method === "STRIPE" ? t.stripeTransferId : t.externalRef;
      if (!ref) continue;
      const ev = await db
        .select({ id: ledgerEntries.id })
        .from(ledgerEntries)
        .where(
          and(
            eq(ledgerEntries.userId, userId),
            eq(ledgerEntries.jobId, t.jobId),
            eq(ledgerEntries.type, "PAYOUT" as any),
            eq(ledgerEntries.direction, "CREDIT" as any),
            eq(ledgerEntries.stripeRef, String(ref)),
          ),
        )
        .limit(1);
      if (!ev[0]?.id) missingLedgerEvidence += 1;
    }

    return NextResponse.json(
      {
        ok: true,
        data: {
          user: { id: userId, email: userRow[0]?.email ?? null, role: String(userRow[0]?.role ?? "") },
          totals,
          walletTotals,
          sanity: { missingLedgerEvidence },
          items,
        },
      },
      { status: 200 },
    );
  } catch (err) {
    return handleApiError(err, "GET /api/admin/users/[id]/payout-trace", { userId: auth.userId });
  }
}

