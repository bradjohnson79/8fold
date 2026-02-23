import { and, desc, eq, gte, inArray, isNull, sql } from "drizzle-orm";
import { db } from "@/server/db/drizzle";
import { jobs } from "@/db/schema/job";
import { escrows } from "@/db/schema/escrow";
import { transferRecords } from "@/db/schema/transferRecord";
import { ledgerEntries } from "@/db/schema/ledgerEntry";

export type PayoutIntegritySnapshot = {
  releasedJobs: Array<{
    id: string;
    payoutStatus: string;
    amountCents: number;
    currency: string;
    createdAt: string | null;
    releasedAt: string | null;
  }>;
  escrows: Array<{
    id: string;
    jobId: string;
    kind: string;
    status: string;
    amountCents: number;
    currency: string;
    releasedAt: string | null;
  }>;
  transferRecords: Array<{
    id: string;
    jobId: string;
    role: string;
    userId: string;
    amountCents: number;
    currency: string;
    method: string;
    status: string;
    stripeTransferId: string | null;
    externalRef: string | null;
  }>;
  ledgerEntries: Array<{
    id: string;
    userId: string;
    jobId: string | null;
    escrowId: string | null;
    type: string;
    direction: string;
    bucket: string;
    amountCents: number;
    currency: string;
    stripeRef: string | null;
  }>;
  orphanTransferRecords: Array<{ id: string; jobId: string; role: string; createdAt: string | null }>;
};

export async function loadPayoutIntegritySnapshotFromDb(input: {
  take: number;
  orphanDays: number;
}): Promise<PayoutIntegritySnapshot> {
  const take = Number(input.take ?? 0);
  const orphanDays = Number(input.orphanDays ?? 0);
  if (!Number.isFinite(take) || take <= 0) throw new Error("Invalid take");
  if (!Number.isFinite(orphanDays) || orphanDays <= 0) throw new Error("Invalid orphanDays");

  const orphanSince = new Date(Date.now() - orphanDays * 24 * 60 * 60 * 1000);

  const releasedJobs = await db
    .select({
      id: jobs.id,
      payoutStatus: jobs.payout_status,
      amountCents: jobs.amount_cents,
      currency: jobs.currency,
      createdAt: jobs.created_at,
      releasedAt: jobs.released_at,
    })
    .from(jobs)
    .where(eq(jobs.payout_status, "RELEASED" as any))
    .orderBy(desc(jobs.released_at))
    .limit(take);

  const jobIds = releasedJobs.map((j) => String(j.id)).filter(Boolean);
  if (jobIds.length === 0) {
    return { releasedJobs: [], escrows: [], transferRecords: [], ledgerEntries: [], orphanTransferRecords: [] };
  }

  const [escrowRows, transferRows, ledgerRows, orphanRows] = await Promise.all([
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

    db
      .select({
        id: transferRecords.id,
        jobId: transferRecords.jobId,
        role: transferRecords.role,
        createdAt: sql<string>`to_char(${transferRecords.createdAt}, 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')`,
      })
      .from(transferRecords)
      .leftJoin(jobs, eq(jobs.id, transferRecords.jobId))
      .where(and(isNull(jobs.id), gte(transferRecords.createdAt, orphanSince)))
      .limit(50),
  ]);

  return {
    releasedJobs: releasedJobs.map((j: any) => ({
      id: String(j.id),
      payoutStatus: String(j.payoutStatus ?? ""),
      amountCents: Number(j.amountCents ?? 0),
      currency: String(j.currency ?? ""),
      createdAt: j.createdAt ? (j.createdAt as Date).toISOString() : null,
      releasedAt: j.releasedAt ? (j.releasedAt as Date).toISOString() : null,
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
    orphanTransferRecords: orphanRows.map((o: any) => ({
      id: String(o.id),
      jobId: String(o.jobId ?? ""),
      role: String(o.role ?? ""),
      createdAt: o.createdAt ? String(o.createdAt) : null,
    })),
  };
}

