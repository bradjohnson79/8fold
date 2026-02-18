import { and, desc, eq, inArray, isNotNull, sql } from "drizzle-orm";
import { requireRouterReady } from "../../../../../src/auth/requireRouterReady";
import { handleApiError } from "../../../../../src/lib/errorHandler";
import { ok } from "../../../../../src/lib/api/respond";
import { db } from "../../../../../db/drizzle";
import { jobs } from "../../../../../db/schema/job";
import { ledgerEntries } from "../../../../../db/schema/ledgerEntry";

const PROJECTED_STATUSES = [
  "PUBLISHED",
  "ASSIGNED",
  "IN_PROGRESS",
  "CONTRACTOR_COMPLETED",
  "CUSTOMER_APPROVED",
  "CUSTOMER_REJECTED",
  "COMPLETION_FLAGGED"
] as const;

export async function GET(req: Request) {
  try {
    const authed = await requireRouterReady(req);
    if (authed instanceof Response) return authed;
    const router = authed;

    const [projectedJobs, totalsRows, ledger] = await Promise.all([
      db
        .select({ routerEarningsCents: jobs.routerEarningsCents })
        .from(jobs)
        .where(
          and(
            eq(jobs.claimedByUserId, router.userId), // Prisma routerId @map("claimedByUserId")
            isNotNull(jobs.routedAt),
            inArray(jobs.status, [...PROJECTED_STATUSES] as unknown as any),
            eq(jobs.isMock, false),
          ),
        ),
      db
        .select({
          bucket: ledgerEntries.bucket,
          direction: ledgerEntries.direction,
          sumAmountCents: sql<number>`sum(${ledgerEntries.amountCents})::int`,
        })
        .from(ledgerEntries)
        .where(eq(ledgerEntries.userId, router.userId))
        .groupBy(ledgerEntries.bucket, ledgerEntries.direction),
      db
        .select({
          id: ledgerEntries.id,
          createdAt: ledgerEntries.createdAt,
          type: ledgerEntries.type,
          bucket: ledgerEntries.bucket,
          direction: ledgerEntries.direction,
          amountCents: ledgerEntries.amountCents,
          memo: ledgerEntries.memo,
          jobId: ledgerEntries.jobId,
        })
        .from(ledgerEntries)
        .where(eq(ledgerEntries.userId, router.userId))
        .orderBy(desc(ledgerEntries.createdAt), desc(ledgerEntries.id))
        .limit(50),
    ]);

    const projectedPendingCents = projectedJobs.reduce((sum, j) => sum + Number((j.routerEarningsCents as any) ?? 0), 0);

    const totals = { PENDING: 0, AVAILABLE: 0, PAID: 0, HELD: 0 } as Record<string, number>;
    for (const r of totalsRows) {
      const sum = Number((r.sumAmountCents as any) ?? 0);
      const signed = String(r.direction) === "CREDIT" ? sum : -sum;
      const bucket = String(r.bucket);
      totals[bucket] = Number((totals[bucket] as any) ?? 0) + signed;
    }

    const history = ledger.map((l) => ({
      id: l.id,
      createdAt: l.createdAt ? l.createdAt.toISOString() : new Date(0).toISOString(),
      type: l.type,
      bucket: l.bucket,
      direction: l.direction,
      amountCents: Number((l.amountCents as any) ?? 0),
      memo: l.memo ?? null,
      jobId: l.jobId ?? null,
    }));

    return ok({
      projectedPendingCents,
      totals,
      paymentSchedule: {
        cadence: "WEEKLY",
        note: "Stripe (Direct Bank Deposit) payouts are typically processed immediately or next business day once a job is completed. PayPal payouts may have a clearing period of 3 or more business days after job completion before funds are transferred."
      },
      history
    });
  } catch (err) {
    return handleApiError(err, "GET /api/web/router/earnings");
  }
}

