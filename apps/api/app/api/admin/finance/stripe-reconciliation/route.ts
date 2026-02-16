import { NextResponse } from "next/server";
import { z } from "zod";
import { and, eq, gte, sql } from "drizzle-orm";
import { requireAdmin } from "@/src/lib/auth/requireAdmin";
import { handleApiError } from "@/src/lib/errorHandler";
import { db } from "../../../../../db/drizzle";
import { jobPayments } from "../../../../../db/schema/jobPayment";
import { ledgerEntries } from "../../../../../db/schema/ledgerEntry";
import { payoutRequests } from "../../../../../db/schema/payoutRequest";

const QuerySchema = z.object({
  days: z.coerce.number().int().min(1).max(365).optional(),
});

export async function GET(req: Request) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  try {
    const url = new URL(req.url);
    const parsed = QuerySchema.safeParse({ days: url.searchParams.get("days") ?? undefined });
    if (!parsed.success) return NextResponse.json({ ok: false, error: "invalid_query" }, { status: 400 });

    const days = parsed.data.days ?? 30;
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const [paymentsLifetime, paymentsWindow] = await Promise.all([
      db
        .select({
          capturedCents: sql<number>`coalesce(sum(case when ${jobPayments.paymentCapturedAt} is not null then ${jobPayments.amountCents} else 0 end), 0)`,
          refundedCents: sql<number>`coalesce(sum(coalesce(${jobPayments.refundAmountCents}, 0)), 0)`,
          capturedCount: sql<number>`coalesce(sum(case when ${jobPayments.paymentCapturedAt} is not null then 1 else 0 end), 0)`,
          refundedCount: sql<number>`coalesce(sum(case when ${jobPayments.refundedAt} is not null then 1 else 0 end), 0)`,
        })
        .from(jobPayments),
      db
        .select({
          capturedCents: sql<number>`coalesce(sum(case when ${jobPayments.paymentCapturedAt} is not null then ${jobPayments.amountCents} else 0 end), 0)`,
          refundedCents: sql<number>`coalesce(sum(coalesce(${jobPayments.refundAmountCents}, 0)), 0)`,
          capturedCount: sql<number>`coalesce(sum(case when ${jobPayments.paymentCapturedAt} is not null then 1 else 0 end), 0)`,
          refundedCount: sql<number>`coalesce(sum(case when ${jobPayments.refundedAt} is not null then 1 else 0 end), 0)`,
        })
        .from(jobPayments)
        .where(gte(jobPayments.createdAt, since)),
    ]);

    const [ledgerLifetime, ledgerWindow] = await Promise.all([
      db
        .select({
          platformFeesNetCents: sql<number>`coalesce(sum(case when ${ledgerEntries.type} = 'PLATFORM_FEE' then (case when ${ledgerEntries.direction} = 'CREDIT' then ${ledgerEntries.amountCents} else -${ledgerEntries.amountCents} end) else 0 end), 0)`,
          brokerFeesNetCents: sql<number>`coalesce(sum(case when ${ledgerEntries.type} = 'BROKER_FEE' then (case when ${ledgerEntries.direction} = 'CREDIT' then ${ledgerEntries.amountCents} else -${ledgerEntries.amountCents} end) else 0 end), 0)`,
          escrowFundNetCents: sql<number>`coalesce(sum(case when ${ledgerEntries.type} in ('ESCROW_FUND','PNM_FUND') then (case when ${ledgerEntries.direction} = 'CREDIT' then ${ledgerEntries.amountCents} else -${ledgerEntries.amountCents} end) else 0 end), 0)`,
          payoutDebitAvailableCents: sql<number>`coalesce(sum(case when ${ledgerEntries.type} = 'PAYOUT' and ${ledgerEntries.direction} = 'DEBIT' and ${ledgerEntries.bucket} = 'AVAILABLE' then ${ledgerEntries.amountCents} else 0 end), 0)`,
          payoutCreditPaidCents: sql<number>`coalesce(sum(case when ${ledgerEntries.type} = 'PAYOUT' and ${ledgerEntries.direction} = 'CREDIT' and ${ledgerEntries.bucket} = 'PAID' then ${ledgerEntries.amountCents} else 0 end), 0)`,
          adjustmentNetCents: sql<number>`coalesce(sum(case when ${ledgerEntries.type} = 'ADJUSTMENT' then (case when ${ledgerEntries.direction} = 'CREDIT' then ${ledgerEntries.amountCents} else -${ledgerEntries.amountCents} end) else 0 end), 0)`,
        })
        .from(ledgerEntries)
        .where(and(eq(ledgerEntries.currency, "USD"))),
      db
        .select({
          platformFeesNetCents: sql<number>`coalesce(sum(case when ${ledgerEntries.type} = 'PLATFORM_FEE' then (case when ${ledgerEntries.direction} = 'CREDIT' then ${ledgerEntries.amountCents} else -${ledgerEntries.amountCents} end) else 0 end), 0)`,
          brokerFeesNetCents: sql<number>`coalesce(sum(case when ${ledgerEntries.type} = 'BROKER_FEE' then (case when ${ledgerEntries.direction} = 'CREDIT' then ${ledgerEntries.amountCents} else -${ledgerEntries.amountCents} end) else 0 end), 0)`,
          escrowFundNetCents: sql<number>`coalesce(sum(case when ${ledgerEntries.type} in ('ESCROW_FUND','PNM_FUND') then (case when ${ledgerEntries.direction} = 'CREDIT' then ${ledgerEntries.amountCents} else -${ledgerEntries.amountCents} end) else 0 end), 0)`,
          payoutDebitAvailableCents: sql<number>`coalesce(sum(case when ${ledgerEntries.type} = 'PAYOUT' and ${ledgerEntries.direction} = 'DEBIT' and ${ledgerEntries.bucket} = 'AVAILABLE' then ${ledgerEntries.amountCents} else 0 end), 0)`,
          payoutCreditPaidCents: sql<number>`coalesce(sum(case when ${ledgerEntries.type} = 'PAYOUT' and ${ledgerEntries.direction} = 'CREDIT' and ${ledgerEntries.bucket} = 'PAID' then ${ledgerEntries.amountCents} else 0 end), 0)`,
          adjustmentNetCents: sql<number>`coalesce(sum(case when ${ledgerEntries.type} = 'ADJUSTMENT' then (case when ${ledgerEntries.direction} = 'CREDIT' then ${ledgerEntries.amountCents} else -${ledgerEntries.amountCents} end) else 0 end), 0)`,
        })
        .from(ledgerEntries)
        .where(and(eq(ledgerEntries.currency, "USD"), gte(ledgerEntries.createdAt, since))),
    ]);

    const [payoutReqLifetime, payoutReqWindow] = await Promise.all([
      db
        .select({
          requestedOpenCents: sql<number>`coalesce(sum(case when ${payoutRequests.status} = 'REQUESTED' then ${payoutRequests.amountCents} else 0 end), 0)`,
          paidCents: sql<number>`coalesce(sum(case when ${payoutRequests.status} = 'PAID' then ${payoutRequests.amountCents} else 0 end), 0)`,
          requestedOpenCount: sql<number>`coalesce(sum(case when ${payoutRequests.status} = 'REQUESTED' then 1 else 0 end), 0)`,
          paidCount: sql<number>`coalesce(sum(case when ${payoutRequests.status} = 'PAID' then 1 else 0 end), 0)`,
        })
        .from(payoutRequests),
      db
        .select({
          requestedOpenCents: sql<number>`coalesce(sum(case when ${payoutRequests.status} = 'REQUESTED' then ${payoutRequests.amountCents} else 0 end), 0)`,
          paidCents: sql<number>`coalesce(sum(case when ${payoutRequests.status} = 'PAID' then ${payoutRequests.amountCents} else 0 end), 0)`,
          requestedOpenCount: sql<number>`coalesce(sum(case when ${payoutRequests.status} = 'REQUESTED' then 1 else 0 end), 0)`,
          paidCount: sql<number>`coalesce(sum(case when ${payoutRequests.status} = 'PAID' then 1 else 0 end), 0)`,
        })
        .from(payoutRequests)
        .where(gte(payoutRequests.createdAt, since)),
    ]);

    return NextResponse.json({
      ok: true,
      data: {
        window: { days, since },
        payments: {
          lifetime: paymentsLifetime?.[0] ?? null,
          window: paymentsWindow?.[0] ?? null,
        },
        ledger: {
          lifetime: ledgerLifetime?.[0] ?? null,
          window: ledgerWindow?.[0] ?? null,
        },
        payoutRequests: {
          lifetime: payoutReqLifetime?.[0] ?? null,
          window: payoutReqWindow?.[0] ?? null,
        },
      },
    });
  } catch (err) {
    return handleApiError(err, "GET /api/admin/finance/stripe-reconciliation", { userId: auth.userId });
  }
}

