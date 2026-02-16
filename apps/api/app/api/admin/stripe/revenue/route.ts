import { NextResponse } from "next/server";
import { requireAdmin } from "@/src/lib/auth/requireAdmin";
import { handleApiError } from "@/src/lib/errorHandler";
import { and, eq, gte, inArray, sql } from "drizzle-orm";
import { db } from "@/db/drizzle";
import { ledgerEntries } from "@/db/schema/ledgerEntry";
import { payoutRequests } from "@/db/schema/payoutRequest";

function startOfUtcDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0, 0));
}

function startOfUtcMonth(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1, 0, 0, 0, 0));
}

export async function GET(req: Request) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  try {
    const now = new Date();
    const dayStart = startOfUtcDay(now);
    const monthStart = startOfUtcMonth(now);

    // Revenue proxy:
    // We treat PLATFORM_FEE + BROKER_FEE credits as "Stripe revenue" since they are tied to Stripe-funded flows.
    // (Provider-specific attribution can be added later if needed.)
    const REVENUE_TYPES = ["PLATFORM_FEE", "BROKER_FEE"] as const;

    const [lifetimeRow, todayRow, monthRow, pendingPayoutRow] = await Promise.all([
      db
        .select({ cents: sql<number>`coalesce(sum(${ledgerEntries.amountCents}), 0)` })
        .from(ledgerEntries)
        .where(and(eq(ledgerEntries.direction, "CREDIT" as any), inArray(ledgerEntries.type, REVENUE_TYPES as any))),
      db
        .select({ cents: sql<number>`coalesce(sum(${ledgerEntries.amountCents}), 0)` })
        .from(ledgerEntries)
        .where(
          and(
            eq(ledgerEntries.direction, "CREDIT" as any),
            inArray(ledgerEntries.type, REVENUE_TYPES as any),
            gte(ledgerEntries.createdAt, dayStart),
          ),
        ),
      db
        .select({ cents: sql<number>`coalesce(sum(${ledgerEntries.amountCents}), 0)` })
        .from(ledgerEntries)
        .where(
          and(
            eq(ledgerEntries.direction, "CREDIT" as any),
            inArray(ledgerEntries.type, REVENUE_TYPES as any),
            gte(ledgerEntries.createdAt, monthStart),
          ),
        ),
      db
        .select({ cents: sql<number>`coalesce(sum(${payoutRequests.amountCents}), 0)` })
        .from(payoutRequests)
        .where(eq(payoutRequests.status, "REQUESTED" as any)),
    ]);

    return NextResponse.json({
      ok: true,
      data: {
        stripeRevenue: {
          lifetimeCents: Number((lifetimeRow[0] as any)?.cents ?? 0),
          monthCents: Number((monthRow[0] as any)?.cents ?? 0),
          todayCents: Number((todayRow[0] as any)?.cents ?? 0),
        },
        pendingPayoutBalanceCents: Number((pendingPayoutRow[0] as any)?.cents ?? 0),
      },
    });
  } catch (err) {
    return handleApiError(err, "GET /api/admin/stripe/revenue", { route: "/api/admin/stripe/revenue", userId: auth.userId });
  }
}

