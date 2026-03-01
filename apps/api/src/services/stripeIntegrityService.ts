import type Stripe from "stripe";
import { stripeIntegrity } from "@/src/stripe/integrity/stripeIntegrityClient";

export type StripeIntegrityRange = {
  start: Date;
  end: Date;
};

export type StripeIntegrityChargeSummary = {
  id: string;
  amount: number;
  currency: string;
  status: string;
  createdUnix: number | null;
};

export type StripeIntegrityTransferSummary = {
  id: string;
  amount: number;
  currency: string;
  status: string;
  destinationAccountId: string | null;
  createdUnix: number | null;
  role: "ROUTER" | "CONTRACTOR" | "UNKNOWN";
};

export type StripeIntegrityRefundSummary = {
  id: string;
  amount: number;
  currency: string;
  status: string;
  paymentIntentId: string | null;
  chargeId: string | null;
  createdUnix: number | null;
};

export type StripeRevenueSummary = {
  grossVolume: number;
  refundedAmount: number;
  transferVolume: number;
  netPlatformVolume: number;
  stripeFeeEstimate: number;
  chargeCount: number;
  transferCount: number;
  refundCount: number;
  transferBreakdown: {
    routerTotal: number;
    contractorTotal: number;
    unknownTotal: number;
  };
};

function createdRange(input: StripeIntegrityRange): Stripe.RangeQueryParam {
  const gte = Math.floor(input.start.getTime() / 1000);
  const lte = Math.floor(input.end.getTime() / 1000);
  return { gte, lte };
}

function asInt(value: unknown): number {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? Math.trunc(n) : 0;
}

function inferTransferRole(transfer: Stripe.Transfer): "ROUTER" | "CONTRACTOR" | "UNKNOWN" {
  const metadata = (transfer.metadata ?? {}) as Record<string, unknown>;
  const role = String(metadata.role ?? metadata.recipient_role ?? "").trim().toUpperCase();
  if (role.includes("ROUTER")) return "ROUTER";
  if (role.includes("CONTRACTOR")) return "CONTRACTOR";
  return "UNKNOWN";
}

export async function listCharges(range: StripeIntegrityRange): Promise<{
  rows: StripeIntegrityChargeSummary[];
  totalAmount: number;
}> {
  const charges = await stripeIntegrity.charges
    .list({
      limit: 100,
      created: createdRange(range),
    })
    .autoPagingToArray({ limit: 10_000 });

  const rows = charges.map((charge) => ({
    id: charge.id,
    amount: asInt(charge.amount),
    currency: String(charge.currency ?? "usd"),
    status: String(charge.status ?? "unknown"),
    createdUnix: Number.isFinite(Number(charge.created)) ? Number(charge.created) : null,
  }));

  return {
    rows,
    totalAmount: rows.reduce((acc, row) => acc + row.amount, 0),
  };
}

export async function listTransfers(range: StripeIntegrityRange): Promise<{
  rows: StripeIntegrityTransferSummary[];
  totalAmount: number;
  routerTotal: number;
  contractorTotal: number;
}> {
  const transfers = await stripeIntegrity.transfers
    .list({
      limit: 100,
      created: createdRange(range),
    })
    .autoPagingToArray({ limit: 10_000 });

  const rows = transfers.map((transfer) => ({
    id: transfer.id,
    amount: asInt(transfer.amount),
    currency: String(transfer.currency ?? "usd"),
    status: transfer.reversed ? "reversed" : "created",
    destinationAccountId: transfer.destination ? String(transfer.destination) : null,
    createdUnix: Number.isFinite(Number(transfer.created)) ? Number(transfer.created) : null,
    role: inferTransferRole(transfer),
  }));

  let routerTotal = 0;
  let contractorTotal = 0;
  for (const row of rows) {
    if (row.role === "ROUTER") routerTotal += row.amount;
    if (row.role === "CONTRACTOR") contractorTotal += row.amount;
  }

  return {
    rows,
    totalAmount: rows.reduce((acc, row) => acc + row.amount, 0),
    routerTotal,
    contractorTotal,
  };
}

export async function listRefunds(range: StripeIntegrityRange): Promise<{
  rows: StripeIntegrityRefundSummary[];
  totalAmount: number;
}> {
  const refunds = await stripeIntegrity.refunds
    .list({
      limit: 100,
      created: createdRange(range),
    })
    .autoPagingToArray({ limit: 10_000 });

  const rows = refunds.map((refund) => ({
    id: refund.id,
    amount: asInt(refund.amount),
    currency: String(refund.currency ?? "usd"),
    status: String(refund.status ?? "unknown"),
    paymentIntentId: refund.payment_intent ? String(refund.payment_intent) : null,
    chargeId: refund.charge ? String(refund.charge) : null,
    createdUnix: Number.isFinite(Number(refund.created)) ? Number(refund.created) : null,
  }));

  return {
    rows,
    totalAmount: rows.reduce((acc, row) => acc + row.amount, 0),
  };
}

export async function computeStripeRevenueSummary(range: StripeIntegrityRange): Promise<StripeRevenueSummary> {
  const [charges, transfers, refunds] = await Promise.all([listCharges(range), listTransfers(range), listRefunds(range)]);

  const grossVolume = asInt(charges.totalAmount);
  const refundedAmount = asInt(refunds.totalAmount);
  const transferVolume = asInt(transfers.totalAmount);
  const netPlatformVolume = grossVolume - refundedAmount - transferVolume;
  const stripeFeeEstimate = Math.max(0, Math.round(grossVolume * 0.029 + charges.rows.length * 30));

  return {
    grossVolume,
    refundedAmount,
    transferVolume,
    netPlatformVolume,
    stripeFeeEstimate,
    chargeCount: charges.rows.length,
    transferCount: transfers.rows.length,
    refundCount: refunds.rows.length,
    transferBreakdown: {
      routerTotal: asInt(transfers.routerTotal),
      contractorTotal: asInt(transfers.contractorTotal),
      unknownTotal: asInt(transfers.totalAmount - transfers.routerTotal - transfers.contractorTotal),
    },
  };
}
