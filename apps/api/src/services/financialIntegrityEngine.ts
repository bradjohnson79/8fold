import { and, gte, lte, sql } from "drizzle-orm";
import { db } from "@/db/drizzle";
import { ledgerEntries } from "@/db/schema";
import { computeStripeRevenueSummary, type StripeIntegrityRange } from "@/src/services/stripeIntegrityService";

type InternalLedgerTotals = {
  grossVolume: number;
  refundedAmount: number;
  transferVolume: number;
  netPlatformVolume: number;
};

export type StripeIntegrityDiscrepancyReport = {
  range: {
    start: string;
    end: string;
  };
  internalTotals: InternalLedgerTotals;
  stripeTotals: {
    grossVolume: number;
    refundedAmount: number;
    transferVolume: number;
    netPlatformVolume: number;
    stripeFeeEstimate: number;
  };
  delta: {
    grossMismatch: number;
    refundMismatch: number;
    transferMismatch: number;
    netMismatch: number;
  };
  hasDiscrepancy: boolean;
};

function asInt(value: unknown): number {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? Math.trunc(n) : 0;
}

async function getInternalLedgerTotals(range: StripeIntegrityRange): Promise<InternalLedgerTotals> {
  const [row] = await db
    .select({
      grossVolume: sql<number>`coalesce(sum(case when ${ledgerEntries.type} = 'CHARGE' and ${ledgerEntries.direction} = 'CREDIT' then ${ledgerEntries.amountCents} else 0 end), 0)`,
      refundedAmount: sql<number>`coalesce(sum(case when ${ledgerEntries.type} = 'REFUND' and ${ledgerEntries.direction} = 'DEBIT' then ${ledgerEntries.amountCents} else 0 end), 0)`,
      transferVolume: sql<number>`coalesce(sum(case when ${ledgerEntries.type} = 'TRANSFER' and ${ledgerEntries.direction} = 'DEBIT' then ${ledgerEntries.amountCents} else 0 end), 0)`,
    })
    .from(ledgerEntries)
    .where(and(gte(ledgerEntries.createdAt, range.start), lte(ledgerEntries.createdAt, range.end)));

  const grossVolume = asInt(row?.grossVolume);
  const refundedAmount = asInt(row?.refundedAmount);
  const transferVolume = asInt(row?.transferVolume);

  return {
    grossVolume,
    refundedAmount,
    transferVolume,
    netPlatformVolume: grossVolume - refundedAmount - transferVolume,
  };
}

export async function runStripeIntegrityCheck(range: StripeIntegrityRange): Promise<StripeIntegrityDiscrepancyReport> {
  console.info("[STRIPE_INTEGRITY_START]", {
    start: range.start.toISOString(),
    end: range.end.toISOString(),
  });

  const [internalTotals, stripeTotals] = await Promise.all([
    getInternalLedgerTotals(range),
    computeStripeRevenueSummary(range),
  ]);

  const delta = {
    grossMismatch: internalTotals.grossVolume - stripeTotals.grossVolume,
    refundMismatch: internalTotals.refundedAmount - stripeTotals.refundedAmount,
    transferMismatch: internalTotals.transferVolume - stripeTotals.transferVolume,
    netMismatch: internalTotals.netPlatformVolume - stripeTotals.netPlatformVolume,
  };

  const hasDiscrepancy =
    delta.grossMismatch !== 0 || delta.refundMismatch !== 0 || delta.transferMismatch !== 0 || delta.netMismatch !== 0;

  const report: StripeIntegrityDiscrepancyReport = {
    range: {
      start: range.start.toISOString(),
      end: range.end.toISOString(),
    },
    internalTotals,
    stripeTotals: {
      grossVolume: stripeTotals.grossVolume,
      refundedAmount: stripeTotals.refundedAmount,
      transferVolume: stripeTotals.transferVolume,
      netPlatformVolume: stripeTotals.netPlatformVolume,
      stripeFeeEstimate: stripeTotals.stripeFeeEstimate,
    },
    delta,
    hasDiscrepancy,
  };

  if (hasDiscrepancy) {
    console.warn("[STRIPE_INTEGRITY_DISCREPANCY]", report);
  }

  console.info("[STRIPE_INTEGRITY_COMPLETE]", report);
  return report;
}
