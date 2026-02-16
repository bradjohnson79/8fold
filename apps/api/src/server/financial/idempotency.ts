import { and, eq, isNotNull, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "../../../db/drizzle";
import { escrows } from "../../../db/schema/escrow";
import { ledgerEntries } from "../../../db/schema/ledgerEntry";
import { assertValidEscrowTransition } from "./guards";

const EscrowIdSchema = z.string().uuid();
const StripeRefSchema = z.string().trim().min(1).max(255);

export type EscrowKind = "JOB_ESCROW" | "PARTS_MATERIALS";

type TxLike = Parameters<typeof db.transaction>[0] extends (tx: infer T) => any ? T : any;

async function fundEscrowIdempotentInner(
  tx: TxLike,
  input: { escrowId: string; stripeRef: string; kind: EscrowKind },
) {
  const escrowId = EscrowIdSchema.safeParse(input.escrowId);
  if (!escrowId.success) throw { status: 400, message: "Invalid escrowId" };
  const stripeRef = StripeRefSchema.safeParse(input.stripeRef);
  if (!stripeRef.success) throw { status: 400, message: "Invalid stripeRef" };

  // Lock escrow row (row-level lock for replay safety).
  const locked = await tx.execute(
    sql`
      select
        "id","jobId","status","amountCents","currency","kind"
      from ${escrows}
      where ${escrows.id} = ${escrowId.data}
      for update
    `,
  );

  const escrow = (locked.rows as any[])[0] ?? null;
  if (!escrow) throw { status: 404, message: "Escrow not found" };

  const terminalStatuses = ["FUNDED", "RELEASED", "REFUNDED"] as const;
  if (terminalStatuses.includes(String(escrow.status) as any)) {
    return { ok: true as const, alreadyProcessed: true as const };
  }

  assertValidEscrowTransition(String(escrow.status) as any, "FUNDED");

  const now = new Date();
  await tx
    .update(escrows)
    .set({ status: "FUNDED" as any, webhookProcessedAt: now, updatedAt: now } as any)
    .where(eq(escrows.id, escrowId.data));

  // Ledger: one CREDIT funding entry per escrow (DB enforced via partial unique index).
  const ledgerType = input.kind === "JOB_ESCROW" ? "ESCROW_FUND" : "PNM_FUND";
  await tx.insert(ledgerEntries).values({
    userId: "system:escrow" as any, // internal-only marker; never exposed as a wallet identity
    jobId: escrow.jobId ?? null,
    escrowId: escrowId.data as any,
    type: ledgerType as any,
    direction: "CREDIT" as any,
    bucket: "HELD" as any,
    amountCents: Number(escrow.amountCents),
    currency: String(escrow.currency) as any,
    stripeRef: stripeRef.data,
    memo: "Escrow funded (idempotent)",
  } as any);

  // Minimal integrity: ensure no negative job ledger totals.
  if (escrow.jobId) {
    const totals = await tx
      .select({
        jobId: ledgerEntries.jobId,
        direction: ledgerEntries.direction,
        sumAmountCents: sql<number>`sum(${ledgerEntries.amountCents})::int`,
      })
      .from(ledgerEntries)
      .where(and(eq(ledgerEntries.jobId, escrow.jobId), isNotNull(ledgerEntries.jobId)))
      .groupBy(ledgerEntries.jobId, ledgerEntries.direction);

    const credit = Number(totals.find((t) => String(t.direction) === "CREDIT")?.sumAmountCents ?? 0);
    const debit = Number(totals.find((t) => String(t.direction) === "DEBIT")?.sumAmountCents ?? 0);
    if (credit - debit < 0) throw { status: 409, message: "Ledger integrity check failed" };
  }

  return { ok: true as const, alreadyProcessed: false as const };
}

export async function fundEscrowIdempotent(input: { escrowId: string; stripeRef: string; kind: EscrowKind }) {
  return await db.transaction(async (tx) => await fundEscrowIdempotentInner(tx as any, input));
}

export async function fundEscrowIdempotentInTx(
  tx: TxLike,
  input: { escrowId: string; stripeRef: string; kind: EscrowKind },
) {
  return await fundEscrowIdempotentInner(tx, input);
}

