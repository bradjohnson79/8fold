import { and, desc, eq, gte, lte, sql } from "drizzle-orm";
import { db } from "@/db/drizzle";
import {
  ledgerEntries,
  stripeChargeSnapshots,
  stripePaymentIntentSnapshots,
  stripeRefundSnapshots,
  stripeTransferSnapshots,
} from "@/db/schema";

export type ReconciliationStatus =
  | "MATCHED"
  | "MISMATCH"
  | "MISSING_TRANSFER"
  | "MISSING_CHARGE"
  | "OVERPAID"
  | "UNDERPAID";

export type ReconciliationResult = {
  status: ReconciliationStatus;
  jobId: string;
  internalTotals: {
    chargeCents: number;
    escrowHeldCents: number;
    refundCents: number;
    transferCents: number;
  };
  stripeTotals: {
    paymentIntentCents: number;
    chargeCents: number;
    refundCents: number;
    transferCents: number;
  };
  difference: number;
};

function asNumber(v: unknown): number {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function computeStatus(input: {
  internalCharge: number;
  internalTransfer: number;
  stripeCharge: number;
  stripeTransfer: number;
  difference: number;
}): ReconciliationStatus {
  if (input.stripeCharge <= 0 && input.internalCharge > 0) return "MISSING_CHARGE";
  if (input.stripeTransfer <= 0 && input.internalTransfer > 0) return "MISSING_TRANSFER";
  if (input.difference === 0) return "MATCHED";
  if (input.difference > 0) return "UNDERPAID";
  if (input.difference < 0) return "OVERPAID";
  return "MISMATCH";
}

export async function reconcileJob(jobId: string): Promise<ReconciliationResult> {
  const [ledger] = await db
    .select({
      chargeCents: sql<number>`coalesce(sum(case when ${ledgerEntries.type} = 'CHARGE' and ${ledgerEntries.direction} = 'CREDIT' then ${ledgerEntries.amountCents} else 0 end), 0)`,
      escrowHeldCents: sql<number>`coalesce(sum(case when ${ledgerEntries.type} = 'ESCROW_HELD' and ${ledgerEntries.direction} = 'CREDIT' then ${ledgerEntries.amountCents} else 0 end), 0)`,
      refundCents: sql<number>`coalesce(sum(case when ${ledgerEntries.type} = 'REFUND' and ${ledgerEntries.direction} = 'DEBIT' then ${ledgerEntries.amountCents} else 0 end), 0)`,
      transferCents: sql<number>`coalesce(sum(case when ${ledgerEntries.type} = 'TRANSFER' and ${ledgerEntries.direction} = 'DEBIT' then ${ledgerEntries.amountCents} else 0 end), 0)`,
    })
    .from(ledgerEntries)
    .where(eq(ledgerEntries.jobId, jobId));

  const [pi] = await db
    .select({
      total: sql<number>`coalesce(sum(${stripePaymentIntentSnapshots.amount}), 0)`,
    })
    .from(stripePaymentIntentSnapshots)
    .where(eq(stripePaymentIntentSnapshots.jobId, jobId));

  const [charge] = await db
    .select({
      total: sql<number>`coalesce(sum(${stripeChargeSnapshots.amount}), 0)`,
    })
    .from(stripeChargeSnapshots)
    .where(eq(stripeChargeSnapshots.jobId, jobId));

  const [refund] = await db
    .select({
      total: sql<number>`coalesce(sum(${stripeRefundSnapshots.amount}), 0)`,
    })
    .from(stripeRefundSnapshots)
    .where(eq(stripeRefundSnapshots.jobId, jobId));

  const [transfer] = await db
    .select({
      total: sql<number>`coalesce(sum(${stripeTransferSnapshots.amount}), 0)`,
    })
    .from(stripeTransferSnapshots)
    .where(eq(stripeTransferSnapshots.jobId, jobId));

  const internal = {
    chargeCents: asNumber(ledger?.chargeCents),
    escrowHeldCents: asNumber(ledger?.escrowHeldCents),
    refundCents: asNumber(ledger?.refundCents),
    transferCents: asNumber(ledger?.transferCents),
  };
  const stripe = {
    paymentIntentCents: asNumber(pi?.total),
    chargeCents: asNumber(charge?.total),
    refundCents: asNumber(refund?.total),
    transferCents: asNumber(transfer?.total),
  };

  const netInternal = internal.chargeCents - internal.refundCents - internal.transferCents;
  const netStripe = stripe.chargeCents - stripe.refundCents - stripe.transferCents;
  const difference = netInternal - netStripe;

  const status = computeStatus({
    internalCharge: internal.chargeCents,
    internalTransfer: internal.transferCents,
    stripeCharge: stripe.chargeCents,
    stripeTransfer: stripe.transferCents,
    difference,
  });

  const result: ReconciliationResult = {
    status,
    jobId,
    internalTotals: internal,
    stripeTotals: stripe,
    difference,
  };
  console.info("[STRIPE_RECON_RESULT]", {
    jobId,
    status,
    difference,
  });
  return result;
}

export async function listReconciliation(input: {
  from?: Date | null;
  to?: Date | null;
  status?: ReconciliationStatus | null;
  jobId?: string | null;
  page?: number;
  pageSize?: number;
}) {
  const page = Math.max(1, Number(input.page ?? 1) || 1);
  const pageSize = Math.max(1, Math.min(100, Number(input.pageSize ?? 25) || 25));

  const where: any[] = [];
  if (input.jobId) where.push(eq(stripePaymentIntentSnapshots.jobId, input.jobId));
  if (input.from) where.push(gte(stripePaymentIntentSnapshots.lastSyncedAt, input.from));
  if (input.to) where.push(lte(stripePaymentIntentSnapshots.lastSyncedAt, input.to));

  const rows = await db
    .select({
      jobId: stripePaymentIntentSnapshots.jobId,
      lastSyncedAt: sql<Date>`max(${stripePaymentIntentSnapshots.lastSyncedAt})`,
    })
    .from(stripePaymentIntentSnapshots)
    .where(where.length ? and(...where) : undefined)
    .groupBy(stripePaymentIntentSnapshots.jobId)
    .orderBy(desc(sql`max(${stripePaymentIntentSnapshots.lastSyncedAt})`))
    .limit(pageSize)
    .offset((page - 1) * pageSize);

  const jobIds = rows.map((r) => String(r.jobId ?? "").trim()).filter(Boolean);
  const results = await Promise.all(jobIds.map((jobId) => reconcileJob(jobId)));
  const filtered = input.status ? results.filter((r) => r.status === input.status) : results;

  const [countRow] = await db
    .select({ count: sql<number>`count(distinct ${stripePaymentIntentSnapshots.jobId})` })
    .from(stripePaymentIntentSnapshots)
    .where(where.length ? and(...where) : undefined);

  return {
    rows: filtered,
    totalCount: asNumber(countRow?.count),
    page,
    pageSize,
  };
}

export async function getReconciliationDetails(jobId: string) {
  const [result, ledger, pi, charges, refunds, transfers] = await Promise.all([
    reconcileJob(jobId),
    db.select().from(ledgerEntries).where(eq(ledgerEntries.jobId, jobId)).orderBy(desc(ledgerEntries.createdAt)).limit(200),
    db
      .select()
      .from(stripePaymentIntentSnapshots)
      .where(eq(stripePaymentIntentSnapshots.jobId, jobId))
      .orderBy(desc(stripePaymentIntentSnapshots.lastSyncedAt))
      .limit(50),
    db
      .select()
      .from(stripeChargeSnapshots)
      .where(eq(stripeChargeSnapshots.jobId, jobId))
      .orderBy(desc(stripeChargeSnapshots.lastSyncedAt))
      .limit(50),
    db
      .select()
      .from(stripeRefundSnapshots)
      .where(eq(stripeRefundSnapshots.jobId, jobId))
      .orderBy(desc(stripeRefundSnapshots.lastSyncedAt))
      .limit(50),
    db
      .select()
      .from(stripeTransferSnapshots)
      .where(eq(stripeTransferSnapshots.jobId, jobId))
      .orderBy(desc(stripeTransferSnapshots.lastSyncedAt))
      .limit(50),
  ]);

  return {
    result,
    ledgerEntries: ledger,
    snapshots: {
      paymentIntents: pi,
      charges,
      refunds,
      transfers,
    },
  };
}
