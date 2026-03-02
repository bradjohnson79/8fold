import { randomUUID } from "crypto";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db/drizzle";
import { ledgerEntries } from "@/db/schema/ledgerEntry";
import { v4FinancialLedger } from "@/db/schema/v4FinancialLedger";
import { getOrCreatePlatformUserId } from "@/src/system/platformUser";

type TxLike = {
  select: typeof db.select;
  insert: typeof db.insert;
};

export type V4FinancialLedgerType =
  | "JOB_SUBTOTAL_EST"
  | "JOB_SUBTOTAL"
  | "CONTRACTOR_PAYOUT_EST"
  | "ROUTER_FEE_EST"
  | "PLATFORM_FEE_EST"
  | "TAX_COLLECTED_EST"
  | "PROCESSING_FEE_EST"
  | "TOTAL_CHARGED_EST"
  | "STRIPE_FEE_ACTUAL"
  | "STRIPE_NET_RECEIVED"
  | "PROCESSING_FEE_DELTA"
  | string;

export async function appendLedgerEntry(input: {
  jobId: string;
  type: V4FinancialLedgerType;
  amountCents: number;
  currency: string;
  stripeRef?: string | null;
  dedupeKey?: string | null;
  meta?: Record<string, unknown> | null;
  tx?: TxLike;
}): Promise<{ inserted: boolean; id: string | null }> {
  const executor = input.tx ?? db;
  const jobId = String(input.jobId ?? "").trim();
  const type = String(input.type ?? "").trim();
  const amountCents = Math.trunc(Number(input.amountCents ?? 0));
  const currency = String(input.currency ?? "CAD").trim().toUpperCase();
  const stripeRef = String(input.stripeRef ?? "").trim() || null;
  const dedupeKey = String(input.dedupeKey ?? "").trim() || null;

  if (!jobId) {
    throw Object.assign(new Error("jobId is required for v4 financial ledger entry"), { status: 400 });
  }
  if (!type) {
    throw Object.assign(new Error("type is required for v4 financial ledger entry"), { status: 400 });
  }
  if (!Number.isInteger(amountCents)) {
    throw Object.assign(new Error("amountCents must be an integer"), { status: 400 });
  }
  if (!currency) {
    throw Object.assign(new Error("currency is required for v4 financial ledger entry"), { status: 400 });
  }

  if (dedupeKey) {
    const existingByDedupe = await executor
      .select({ id: v4FinancialLedger.id })
      .from(v4FinancialLedger)
      .where(eq(v4FinancialLedger.dedupeKey, dedupeKey))
      .limit(1);
    if (existingByDedupe[0]?.id) return { inserted: false, id: String(existingByDedupe[0].id) };
  }

  if (stripeRef) {
    const existing = await executor
      .select({ id: v4FinancialLedger.id })
      .from(v4FinancialLedger)
      .where(
        and(
          eq(v4FinancialLedger.jobId, jobId),
          eq(v4FinancialLedger.type, type),
          eq(v4FinancialLedger.stripeRef, stripeRef),
        ),
      )
      .limit(1);
    if (existing[0]?.id) return { inserted: false, id: String(existing[0].id) };
  }

  const id = randomUUID();
  try {
    const inserted = await executor
      .insert(v4FinancialLedger)
      .values({
        id,
        jobId,
        type,
        amountCents,
        currency,
        stripeRef,
        dedupeKey,
        metaJson: input.meta ?? null,
      })
      .returning({ id: v4FinancialLedger.id });
    const rowId = inserted[0]?.id ? String(inserted[0].id) : null;
    if (!rowId && dedupeKey) {
      const existing = await executor
        .select({ id: v4FinancialLedger.id })
        .from(v4FinancialLedger)
        .where(eq(v4FinancialLedger.dedupeKey, dedupeKey))
        .limit(1);
      return { inserted: false, id: existing[0]?.id ? String(existing[0].id) : null };
    }
    if (rowId) {
      await mirrorV4LedgerToLegacy({
        tx: executor,
        v4Id: rowId,
        jobId,
        type,
        amountCents,
        currency,
        stripeRef,
        dedupeKey,
        meta: input.meta ?? null,
      });
      return { inserted: true, id: rowId };
    }
    return { inserted: true, id };
  } catch (err) {
    const code = String((err as any)?.code ?? "");
    if (code === "23505" && (stripeRef || dedupeKey)) {
      return { inserted: false, id: null };
    }
    throw err;
  }
}

export async function existsByDedupeKey(dedupeKey: string, tx?: TxLike): Promise<boolean> {
  const resolved = String(dedupeKey ?? "").trim();
  if (!resolved) return false;
  const executor = tx ?? db;
  const rows = await executor
    .select({ id: v4FinancialLedger.id })
    .from(v4FinancialLedger)
    .where(eq(v4FinancialLedger.dedupeKey, resolved))
    .limit(1);
  return Boolean(rows[0]?.id);
}

export async function getLatestLedgerAmountByType(input: {
  jobId: string;
  type: V4FinancialLedgerType;
  stripeRef?: string | null;
  tx?: TxLike;
}): Promise<number | null> {
  const executor = input.tx ?? db;
  const jobId = String(input.jobId ?? "").trim();
  const type = String(input.type ?? "").trim();
  const stripeRef = String(input.stripeRef ?? "").trim() || null;
  if (!jobId || !type) return null;

  const rows = await executor
    .select({ amountCents: v4FinancialLedger.amountCents })
    .from(v4FinancialLedger)
    .where(
      stripeRef
        ? and(eq(v4FinancialLedger.jobId, jobId), eq(v4FinancialLedger.type, type), eq(v4FinancialLedger.stripeRef, stripeRef))
        : and(eq(v4FinancialLedger.jobId, jobId), eq(v4FinancialLedger.type, type)),
    )
    .orderBy(desc(v4FinancialLedger.createdAt))
    .limit(1);

  const amount = rows[0]?.amountCents;
  return Number.isInteger(amount) ? Number(amount) : null;
}

function isLedgerDualWriteEnabled(): boolean {
  return String(process.env.LEDGER_DUAL_WRITE ?? "true").trim().toLowerCase() !== "false";
}

function shouldMirrorType(type: string): boolean {
  return type === "STRIPE_FEE_ACTUAL" || type === "STRIPE_NET_RECEIVED" || type === "PROCESSING_FEE_DELTA";
}

async function mirrorV4LedgerToLegacy(input: {
  tx: TxLike;
  v4Id: string;
  jobId: string;
  type: string;
  amountCents: number;
  currency: string;
  stripeRef: string | null;
  dedupeKey: string | null;
  meta: Record<string, unknown> | null;
}): Promise<void> {
  if (!isLedgerDualWriteEnabled()) return;
  if (!shouldMirrorType(input.type)) return;

  try {
    const userId = await getOrCreatePlatformUserId(input.tx as any);
    const absAmount = Math.abs(Math.trunc(input.amountCents));
    if (absAmount <= 0) return;
    const direction = input.amountCents >= 0 ? "CREDIT" : "DEBIT";

    await input.tx.insert(ledgerEntries).values({
      userId,
      jobId: input.jobId,
      type: "ADJUSTMENT",
      direction,
      bucket: "AVAILABLE",
      amountCents: absAmount,
      currency: input.currency === "CAD" ? "CAD" : "USD",
      stripeRef: input.stripeRef ? `v4:${input.stripeRef}` : input.dedupeKey ? `v4:${input.dedupeKey}` : `v4:${input.v4Id}`,
      memo: `V4_LEDGER_MIRROR:${input.type}`,
      metadata: {
        source: "v4_financial_ledger",
        v4LedgerId: input.v4Id,
        v4Type: input.type,
        dedupeKey: input.dedupeKey,
        meta: input.meta ?? null,
      },
    } as any);
  } catch (error) {
    console.warn("[V4_LEDGER_DUAL_WRITE_FAILED]", {
      v4LedgerId: input.v4Id,
      jobId: input.jobId,
      type: input.type,
      message: error instanceof Error ? error.message : String(error),
    });
  }
}
