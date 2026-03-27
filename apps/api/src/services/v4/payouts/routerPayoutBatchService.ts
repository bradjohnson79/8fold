import { and, desc, eq, inArray, lte, sql } from "drizzle-orm";
import { db } from "@/db/drizzle";
import { jobs } from "@/db/schema/job";
import { payoutMethods } from "@/db/schema/payoutMethod";
import { transferRecords } from "@/db/schema/transferRecord";
import { users } from "@/db/schema/user";
import { appendLedgerEntry } from "@/src/services/v4/financialLedgerService";
import {
  ROUTER_TRANSFER_CREATED,
  payoutDedupeKeys,
} from "@/src/services/v4/payouts/payoutLedgerTypes";
import { stripe } from "@/src/stripe/stripe";

const PACIFIC_TIME_ZONE = "America/Los_Angeles";

type PacificParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  weekday: string;
};

type RouterCommissionRow = {
  id: string;
  jobId: string;
  userId: string;
  amountCents: number;
  currency: "USD" | "CAD";
  createdAt: Date | null;
  stripeAccountId: string | null;
  payoutsEnabled: boolean;
  userRole: string | null;
};

function getPacificParts(date: Date): PacificParts {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: PACIFIC_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    weekday: "short",
    hour12: false,
  }).formatToParts(date);

  const read = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";

  return {
    year: Number(read("year")),
    month: Number(read("month")),
    day: Number(read("day")),
    hour: Number(read("hour")),
    minute: Number(read("minute")),
    second: Number(read("second")),
    weekday: read("weekday"),
  };
}

function pacificTimeToUtc(parts: { year: number; month: number; day: number; hour: number; minute: number; second: number }) {
  const utcGuess = new Date(Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second));
  const zoned = new Date(utcGuess.toLocaleString("en-US", { timeZone: PACIFIC_TIME_ZONE }));
  const offsetMs = zoned.getTime() - utcGuess.getTime();
  return new Date(utcGuess.getTime() - offsetMs);
}

function getFridayBatchWindow(now: Date) {
  const pt = getPacificParts(now);
  const batchId = `${pt.year}-${String(pt.month).padStart(2, "0")}-${String(pt.day).padStart(2, "0")}`;
  const fridayStartUtc = pacificTimeToUtc({
    year: pt.year,
    month: pt.month,
    day: pt.day,
    hour: 0,
    minute: 0,
    second: 0,
  });

  return {
    batchId,
    cutoffUtc: new Date(fridayStartUtc.getTime() - 1000),
    inWindow: pt.weekday === "Fri" && pt.hour === 12,
    pacificLabel: `${pt.weekday} ${batchId} ${String(pt.hour).padStart(2, "0")}:${String(pt.minute).padStart(2, "0")} PT`,
  };
}

function normalizeStripeCurrency(currency: "USD" | "CAD") {
  return currency === "CAD" ? "cad" : "usd";
}

function groupKey(row: RouterCommissionRow) {
  return `${row.userId}:${row.currency}`;
}

export async function runWeeklyRouterPayoutBatch(now = new Date()): Promise<{
  batchId: string;
  cutoff_at: string;
  skipped: boolean;
  reason?: string;
  scanned: number;
  paidRouters: number;
  paidJobs: number;
  failed: Array<{ routerUserId: string; currency: string; error: string; jobIds: string[] }>;
}> {
  const window = getFridayBatchWindow(now);
  if (!window.inWindow) {
    return {
      batchId: window.batchId,
      cutoff_at: window.cutoffUtc.toISOString(),
      skipped: true,
      reason: `outside_friday_batch_window:${window.pacificLabel}`,
      scanned: 0,
      paidRouters: 0,
      paidJobs: 0,
      failed: [],
    };
  }

  if (!stripe) {
    throw Object.assign(new Error("Stripe not configured"), { status: 500, code: "STRIPE_NOT_CONFIGURED" });
  }

  const rows = await db
    .select({
      id: transferRecords.id,
      jobId: transferRecords.jobId,
      userId: transferRecords.userId,
      amountCents: transferRecords.amountCents,
      currency: transferRecords.currency,
      createdAt: transferRecords.createdAt,
      stripeAccountId: sql<string | null>`${payoutMethods.details} ->> 'stripeAccountId'`,
      payoutsEnabled: sql<boolean>`coalesce((${payoutMethods.details} ->> 'stripePayoutsEnabled')::boolean, false)`,
      userRole: users.role,
    })
    .from(transferRecords)
    .innerJoin(jobs, eq(jobs.id, transferRecords.jobId))
    .leftJoin(
      payoutMethods,
      and(
        eq(payoutMethods.userId, transferRecords.userId),
        eq(payoutMethods.provider, "STRIPE" as any),
        eq(payoutMethods.currency, transferRecords.currency as any),
        eq(payoutMethods.isActive, true),
      ),
    )
    .leftJoin(users, eq(users.id, transferRecords.userId))
    .where(
      and(
        eq(transferRecords.role, "ROUTER"),
        inArray(transferRecords.status, ["PENDING", "FAILED"]),
        lte(transferRecords.createdAt, window.cutoffUtc),
        eq(jobs.archived, false),
        inArray(jobs.payment_status, ["FUNDED", "FUNDS_SECURED"] as any),
      ),
    )
    .orderBy(desc(transferRecords.createdAt));

  const eligible = rows.filter((row) => String(row.userRole ?? "").toUpperCase() !== "ADMIN") as RouterCommissionRow[];
  const grouped = new Map<string, RouterCommissionRow[]>();
  for (const row of eligible) {
    const key = groupKey(row);
    const bucket = grouped.get(key) ?? [];
    bucket.push(row);
    grouped.set(key, bucket);
  }

  let paidRouters = 0;
  let paidJobs = 0;
  const failed: Array<{ routerUserId: string; currency: string; error: string; jobIds: string[] }> = [];

  for (const [key, group] of grouped) {
    const [routerUserId, currency] = key.split(":");
    const jobIds = group.map((row) => row.jobId);
    const amountCents = group.reduce((sum, row) => sum + Number(row.amountCents ?? 0), 0);
    const stripeAccountId = String(group[0]?.stripeAccountId ?? "").trim();
    const payoutsEnabled = Boolean(group[0]?.payoutsEnabled);

    if (!stripeAccountId || !payoutsEnabled || amountCents <= 0) {
      const error = !stripeAccountId
        ? "Router missing active Stripe payout destination"
        : !payoutsEnabled
          ? "Router Stripe payouts are not enabled"
          : "Router payout amount is invalid";
      await db
        .update(transferRecords)
        .set({
          status: "FAILED",
          externalRef: window.batchId,
          failureReason: error,
        } as any)
        .where(inArray(transferRecords.id, group.map((row) => row.id)));
      failed.push({ routerUserId, currency, error, jobIds });
      continue;
    }

    try {
      const transfer = await stripe.transfers.create(
        {
          amount: amountCents,
          currency: normalizeStripeCurrency(currency as "USD" | "CAD"),
          destination: stripeAccountId,
          metadata: {
            routerUserId,
            batchId: window.batchId,
            payoutType: "router_weekly_batch",
            jobIds: jobIds.join(","),
          },
        },
        {
          idempotencyKey: `router:${routerUserId}:batch:${window.batchId}:${currency}:${amountCents}`,
        },
      );

      await db.transaction(async (tx: any) => {
        await tx
          .update(transferRecords)
          .set({
            status: "SENT",
            stripeTransferId: transfer.id,
            externalRef: window.batchId,
            releasedAt: now,
            failureReason: null,
          } as any)
          .where(inArray(transferRecords.id, group.map((row) => row.id)));

        await tx
          .update(jobs)
          .set({
            router_transfer_id: transfer.id,
            updated_at: now,
          } as any)
          .where(inArray(jobs.id, jobIds));
      });

      for (const row of group) {
        await appendLedgerEntry({
          jobId: row.jobId,
          type: ROUTER_TRANSFER_CREATED,
          amountCents: Number(row.amountCents ?? 0),
          currency,
          stripeRef: transfer.id,
          dedupeKey: payoutDedupeKeys.routerTransfer(row.jobId),
          meta: {
            routerUserId,
            batchId: window.batchId,
            payoutTiming: "friday_batch",
          },
        });
      }

      paidRouters += 1;
      paidJobs += group.length;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Router payout batch failed";
      await db
        .update(transferRecords)
        .set({
          status: "FAILED",
          externalRef: window.batchId,
          failureReason: message,
        } as any)
        .where(inArray(transferRecords.id, group.map((row) => row.id)));
      failed.push({ routerUserId, currency, error: message, jobIds });
    }
  }

  return {
    batchId: window.batchId,
    cutoff_at: window.cutoffUtc.toISOString(),
    skipped: false,
    scanned: eligible.length,
    paidRouters,
    paidJobs,
    failed,
  };
}
