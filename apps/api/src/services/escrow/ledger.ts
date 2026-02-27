import { and, eq, isNull } from "drizzle-orm";
import { ledgerEntries } from "@/db/schema/ledgerEntry";
import { computeEscrowSplitAllocations } from "@/src/services/escrow/pricing";
import { getOrCreatePlatformUserId } from "@/src/system/platformUser";

export const SYSTEM_ESCROW_LEDGER_USER_ID = "system:escrow";

type TxLike = {
  select: any;
  insert: any;
};

type Direction = "CREDIT" | "DEBIT";
type Bucket = "PENDING" | "AVAILABLE" | "PAID" | "HELD";

async function ensureLedgerEntry(
  tx: TxLike,
  input: {
    userId: string;
    jobId: string;
    type:
      | "AUTH_HOLD"
      | "CAPTURE"
      | "ESCROW_AVAILABLE"
      | "CHARGE"
      | "ESCROW_HELD"
      | "REFUND"
      | "PAYABLE_CONTRACTOR"
      | "PAYABLE_ROUTER"
      | "PLATFORM_FEE"
      | "TAX_BUCKET"
      | "AUTH_EXPIRED";
    direction: Direction;
    bucket: Bucket;
    amountCents: number;
    currency: "USD" | "CAD";
    stripeRef?: string | null;
    memo: string;
    metadata?: Record<string, unknown>;
  },
) {
  const stripeRef = input.stripeRef ? String(input.stripeRef) : null;
  const existing = await tx
    .select({ id: ledgerEntries.id })
    .from(ledgerEntries)
    .where(
      and(
        eq(ledgerEntries.userId, input.userId),
        eq(ledgerEntries.jobId, input.jobId),
        eq(ledgerEntries.type, input.type as any),
        eq(ledgerEntries.direction, input.direction as any),
        eq(ledgerEntries.bucket, input.bucket as any),
        eq(ledgerEntries.amountCents, input.amountCents),
        stripeRef ? eq(ledgerEntries.stripeRef, stripeRef) : isNull(ledgerEntries.stripeRef),
      ),
    )
    .limit(1);

  if (existing[0]?.id) return;

  await tx.insert(ledgerEntries).values({
    userId: input.userId,
    jobId: input.jobId,
    type: input.type as any,
    direction: input.direction as any,
    bucket: input.bucket as any,
    amountCents: input.amountCents,
    currency: input.currency as any,
    stripeRef,
    memo: input.memo,
    metadata: input.metadata ?? null,
  } as any);
}

export async function writeAuthHoldLedger(
  tx: TxLike,
  input: {
    jobId: string;
    totalAmountCents: number;
    currency: "USD" | "CAD";
    paymentIntentId: string;
  },
) {
  await ensureLedgerEntry(tx, {
    userId: SYSTEM_ESCROW_LEDGER_USER_ID,
    jobId: input.jobId,
    type: "AUTH_HOLD",
    direction: "CREDIT",
    bucket: "PENDING",
    amountCents: input.totalAmountCents,
    currency: input.currency,
    stripeRef: input.paymentIntentId,
    memo: "Escrow authorization hold",
    metadata: { paymentIntentId: input.paymentIntentId },
  });
}

export async function writeChargeLedger(
  tx: TxLike,
  input: {
    jobId: string;
    totalAmountCents: number;
    currency: "USD" | "CAD";
    paymentIntentId: string;
  },
) {
  await ensureLedgerEntry(tx, {
    userId: SYSTEM_ESCROW_LEDGER_USER_ID,
    jobId: input.jobId,
    type: "CHARGE",
    direction: "CREDIT",
    bucket: "AVAILABLE",
    amountCents: input.totalAmountCents,
    currency: input.currency,
    stripeRef: input.paymentIntentId,
    memo: "Customer payment charged",
    metadata: { paymentIntentId: input.paymentIntentId },
  });

  await ensureLedgerEntry(tx, {
    userId: SYSTEM_ESCROW_LEDGER_USER_ID,
    jobId: input.jobId,
    type: "ESCROW_HELD",
    direction: "CREDIT",
    bucket: "HELD",
    amountCents: input.totalAmountCents,
    currency: input.currency,
    stripeRef: input.paymentIntentId,
    memo: "Escrow held balance",
    metadata: { paymentIntentId: input.paymentIntentId },
  });
}

export async function writeCaptureLedger(
  tx: TxLike,
  input: {
    jobId: string;
    totalAmountCents: number;
    currency: "USD" | "CAD";
    paymentIntentId: string;
  },
) {
  await ensureLedgerEntry(tx, {
    userId: SYSTEM_ESCROW_LEDGER_USER_ID,
    jobId: input.jobId,
    type: "CAPTURE",
    direction: "CREDIT",
    bucket: "HELD",
    amountCents: input.totalAmountCents,
    currency: input.currency,
    stripeRef: input.paymentIntentId,
    memo: "Escrow capture",
    metadata: { paymentIntentId: input.paymentIntentId },
  });

  await ensureLedgerEntry(tx, {
    userId: SYSTEM_ESCROW_LEDGER_USER_ID,
    jobId: input.jobId,
    type: "ESCROW_AVAILABLE",
    direction: "CREDIT",
    bucket: "AVAILABLE",
    amountCents: input.totalAmountCents,
    currency: input.currency,
    stripeRef: input.paymentIntentId,
    memo: "Escrow available",
    metadata: { paymentIntentId: input.paymentIntentId },
  });
}

export async function writeEscrowAllocationLedger(
  tx: TxLike,
  input: {
    jobId: string;
    currency: "USD" | "CAD";
    contractorUserId: string;
    routerUserId: string;
    appraisalSubtotalCents: number;
    regionalFeeCents: number;
    taxAmountCents: number;
    paymentIntentId: string;
  },
) {
  const split = computeEscrowSplitAllocations({
    appraisalSubtotalCents: input.appraisalSubtotalCents,
    regionalFeeCents: input.regionalFeeCents,
    taxAmountCents: input.taxAmountCents,
  });
  const platformUserId = await getOrCreatePlatformUserId(tx as any);

  await ensureLedgerEntry(tx, {
    userId: input.contractorUserId,
    jobId: input.jobId,
    type: "PAYABLE_CONTRACTOR",
    direction: "CREDIT",
    bucket: "PENDING",
    amountCents: split.contractorCents,
    currency: input.currency,
    stripeRef: input.paymentIntentId,
    memo: "Contractor payable allocation",
    metadata: { paymentIntentId: input.paymentIntentId },
  });

  await ensureLedgerEntry(tx, {
    userId: input.routerUserId,
    jobId: input.jobId,
    type: "PAYABLE_ROUTER",
    direction: "CREDIT",
    bucket: "PENDING",
    amountCents: split.routerCents,
    currency: input.currency,
    stripeRef: input.paymentIntentId,
    memo: "Router payable allocation",
    metadata: { paymentIntentId: input.paymentIntentId },
  });

  await ensureLedgerEntry(tx, {
    userId: platformUserId,
    jobId: input.jobId,
    type: "PLATFORM_FEE",
    direction: "CREDIT",
    bucket: "PENDING",
    amountCents: split.platformCents,
    currency: input.currency,
    stripeRef: input.paymentIntentId,
    memo: "Platform fee allocation",
    metadata: { paymentIntentId: input.paymentIntentId },
  });

  await ensureLedgerEntry(tx, {
    userId: platformUserId,
    jobId: input.jobId,
    type: "TAX_BUCKET",
    direction: "CREDIT",
    bucket: "PENDING",
    amountCents: split.taxBucketCents,
    currency: input.currency,
    stripeRef: input.paymentIntentId,
    memo: "Tax liability allocation",
    metadata: { paymentIntentId: input.paymentIntentId },
  });
}

export async function writeAuthExpiredLedger(
  tx: TxLike,
  input: {
    jobId: string;
    totalAmountCents: number;
    currency: "USD" | "CAD";
    paymentIntentId: string;
  },
) {
  await ensureLedgerEntry(tx, {
    userId: SYSTEM_ESCROW_LEDGER_USER_ID,
    jobId: input.jobId,
    type: "AUTH_EXPIRED",
    direction: "DEBIT",
    bucket: "PENDING",
    amountCents: input.totalAmountCents,
    currency: input.currency,
    stripeRef: input.paymentIntentId,
    memo: "Escrow authorization expired",
    metadata: { paymentIntentId: input.paymentIntentId },
  });
}

export async function writeRefundLedger(
  tx: TxLike,
  input: {
    jobId: string;
    totalAmountCents: number;
    currency: "USD" | "CAD";
    paymentIntentId: string;
    refundId?: string | null;
  },
) {
  await ensureLedgerEntry(tx, {
    userId: SYSTEM_ESCROW_LEDGER_USER_ID,
    jobId: input.jobId,
    type: "REFUND",
    direction: "DEBIT",
    bucket: "HELD",
    amountCents: input.totalAmountCents,
    currency: input.currency,
    stripeRef: input.paymentIntentId,
    memo: "Customer refund issued",
    metadata: {
      paymentIntentId: input.paymentIntentId,
      refundId: input.refundId ?? null,
    },
  });
}
