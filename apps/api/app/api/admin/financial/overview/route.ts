import { NextResponse } from "next/server";
import { z } from "zod";
import { and, eq, gte, sql } from "drizzle-orm";
import { handleApiError } from "@/src/lib/errorHandler";
import { db } from "@/db/drizzle";
import { ledgerEntries } from "@/db/schema/ledgerEntry";
import { transferRecords } from "@/db/schema/transferRecord";
import { escrows } from "@/db/schema/escrow";
import { jobs } from "@/db/schema/job";
import { requireFinancialTier } from "../_lib/requireFinancial";

const QuerySchema = z.object({
  days: z.coerce.number().int().min(1).max(365).optional(),
});

export async function GET(req: Request) {
  const auth = await requireFinancialTier(req, "ADMIN_OPERATOR");
  if (auth instanceof NextResponse) return auth;

  try {
    const url = new URL(req.url);
    const parsed = QuerySchema.safeParse({ days: url.searchParams.get("days") ?? undefined });
    if (!parsed.success) return NextResponse.json({ ok: false, error: "invalid_query" }, { status: 400 });

    const days = parsed.data.days ?? 30;
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const [platformLifetime, platformWindow] = await Promise.all([
      db
        .select({
          platformNetCents: sql<number>`coalesce(sum(case when ${ledgerEntries.type} in ('PLATFORM_FEE','BROKER_FEE') then (case when ${ledgerEntries.direction} = 'CREDIT' then ${ledgerEntries.amountCents} else -${ledgerEntries.amountCents} end) else 0 end), 0)`,
        })
        .from(ledgerEntries)
        .where(eq(ledgerEntries.currency, "USD")),
      db
        .select({
          platformNetCents: sql<number>`coalesce(sum(case when ${ledgerEntries.type} in ('PLATFORM_FEE','BROKER_FEE') then (case when ${ledgerEntries.direction} = 'CREDIT' then ${ledgerEntries.amountCents} else -${ledgerEntries.amountCents} end) else 0 end), 0)`,
        })
        .from(ledgerEntries)
        .where(and(eq(ledgerEntries.currency, "USD"), gte(ledgerEntries.createdAt, since))),
    ]);

    const [contractorLifetime, contractorWindow] = await Promise.all([
      db
        .select({
          netCents: sql<number>`coalesce(sum(case when ${ledgerEntries.type} = 'CONTRACTOR_EARN' then (case when ${ledgerEntries.direction} = 'CREDIT' then ${ledgerEntries.amountCents} else -${ledgerEntries.amountCents} end) else 0 end), 0)`,
        })
        .from(ledgerEntries)
        .where(eq(ledgerEntries.currency, "USD")),
      db
        .select({
          netCents: sql<number>`coalesce(sum(case when ${ledgerEntries.type} = 'CONTRACTOR_EARN' then (case when ${ledgerEntries.direction} = 'CREDIT' then ${ledgerEntries.amountCents} else -${ledgerEntries.amountCents} end) else 0 end), 0)`,
        })
        .from(ledgerEntries)
        .where(and(eq(ledgerEntries.currency, "USD"), gte(ledgerEntries.createdAt, since))),
    ]);

    const [routerLifetime, routerWindow] = await Promise.all([
      db
        .select({
          netCents: sql<number>`coalesce(sum(case when ${ledgerEntries.type} = 'ROUTER_EARN' then (case when ${ledgerEntries.direction} = 'CREDIT' then ${ledgerEntries.amountCents} else -${ledgerEntries.amountCents} end) else 0 end), 0)`,
        })
        .from(ledgerEntries)
        .where(eq(ledgerEntries.currency, "USD")),
      db
        .select({
          netCents: sql<number>`coalesce(sum(case when ${ledgerEntries.type} = 'ROUTER_EARN' then (case when ${ledgerEntries.direction} = 'CREDIT' then ${ledgerEntries.amountCents} else -${ledgerEntries.amountCents} end) else 0 end), 0)`,
        })
        .from(ledgerEntries)
        .where(and(eq(ledgerEntries.currency, "USD"), gte(ledgerEntries.createdAt, since))),
    ]);

    const [expressLifetime, expressWindow] = await Promise.all([
      db
        .select({
          feeCents: sql<number>`coalesce(sum(case when ${jobs.transactionFeeCents} > 0 then ${jobs.transactionFeeCents} else 0 end), 0)`,
          jobCount: sql<number>`coalesce(sum(case when ${jobs.transactionFeeCents} > 0 then 1 else 0 end), 0)`,
        })
        .from(jobs),
      db
        .select({
          feeCents: sql<number>`coalesce(sum(case when ${jobs.transactionFeeCents} > 0 then ${jobs.transactionFeeCents} else 0 end), 0)`,
          jobCount: sql<number>`coalesce(sum(case when ${jobs.transactionFeeCents} > 0 then 1 else 0 end), 0)`,
        })
        .from(jobs)
        .where(gte(jobs.createdAt, since)),
    ]);

    const [escrowHeld] = await Promise.all([
      db
        .select({
          heldCents: sql<number>`coalesce(sum(case when ${escrows.status} in ('PENDING','FUNDED') then ${escrows.amountCents} else 0 end), 0)`,
        })
        .from(escrows),
    ]);

    const [pendingReleases] = await Promise.all([
      db
        .select({
          count: sql<number>`coalesce(sum(case when ${jobs.payoutStatus} = 'READY' then 1 else 0 end), 0)`,
          cents: sql<number>`coalesce(sum(case when ${jobs.payoutStatus} = 'READY' then ${jobs.contractorPayoutCents} + ${jobs.routerEarningsCents} else 0 end), 0)`,
        })
        .from(jobs),
    ]);

    const [failedTransfersLifetime, failedTransfersWindow] = await Promise.all([
      db
        .select({
          count: sql<number>`coalesce(sum(case when ${transferRecords.status} in ('FAILED','REVERSED') then 1 else 0 end), 0)`,
        })
        .from(transferRecords),
      db
        .select({
          count: sql<number>`coalesce(sum(case when ${transferRecords.status} in ('FAILED','REVERSED') then 1 else 0 end), 0)`,
        })
        .from(transferRecords)
        .where(gte(transferRecords.createdAt, since)),
    ]);

    const [disputes] = await Promise.all([
      db
        .select({
          count: sql<number>`coalesce(sum(case when ${jobs.status} = 'DISPUTED' then 1 else 0 end), 0)`,
          cents: sql<number>`coalesce(sum(case when ${jobs.status} = 'DISPUTED' then ${jobs.amountCents} else 0 end), 0)`,
        })
        .from(jobs),
    ]);

    return NextResponse.json({
      ok: true,
      data: {
        window: { days, since: since.toISOString() },
        platformRevenue: {
          lifetimeCents: Number(platformLifetime?.[0]?.platformNetCents ?? 0),
          windowCents: Number(platformWindow?.[0]?.platformNetCents ?? 0),
        },
        contractorEarnings: {
          lifetimeCents: Number(contractorLifetime?.[0]?.netCents ?? 0),
          windowCents: Number(contractorWindow?.[0]?.netCents ?? 0),
        },
        routerEarnings: {
          lifetimeCents: Number(routerLifetime?.[0]?.netCents ?? 0),
          windowCents: Number(routerWindow?.[0]?.netCents ?? 0),
        },
        expressRevenue: {
          lifetimeCents: Number(expressLifetime?.[0]?.feeCents ?? 0),
          windowCents: Number(expressWindow?.[0]?.feeCents ?? 0),
          jobCountLifetime: Number(expressLifetime?.[0]?.jobCount ?? 0),
          jobCountWindow: Number(expressWindow?.[0]?.jobCount ?? 0),
        },
        escrow: {
          heldCents: Number(escrowHeld?.[0]?.heldCents ?? 0),
          pendingReleaseCount: Number(pendingReleases?.[0]?.count ?? 0),
          pendingReleaseCents: Number(pendingReleases?.[0]?.cents ?? 0),
        },
        transfers: {
          failedCountLifetime: Number(failedTransfersLifetime?.[0]?.count ?? 0),
          failedCountWindow: Number(failedTransfersWindow?.[0]?.count ?? 0),
        },
        disputes: {
          disputedJobCount: Number(disputes?.[0]?.count ?? 0),
          disputedJobCents: Number(disputes?.[0]?.cents ?? 0),
        },
      },
    });
  } catch (err) {
    return handleApiError(err, "GET /api/admin/financial/overview", { userId: auth.userId });
  }
}

