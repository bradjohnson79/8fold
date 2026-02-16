import { NextResponse } from "next/server";
import { desc, eq, inArray, and } from "drizzle-orm";
import { db } from "@/server/db/drizzle";
import { jobs } from "../../../../db/schema/job";
import { optionalUser } from "../../../../src/auth/rbac";
import { requireRouterReady } from "../../../../src/auth/onboardingGuards";
import { toHttpError } from "../../../../src/http/errors";

const ACTIVE_STATUSES = [
  "PUBLISHED",
  "ASSIGNED",
  "IN_PROGRESS",
  "CONTRACTOR_COMPLETED",
  "CUSTOMER_APPROVED",
  "CUSTOMER_REJECTED",
  "COMPLETION_FLAGGED",
  "COMPLETED_APPROVED",
  "COMPLETED",
] as const;

export async function GET(req: Request) {
  try {
    const maybe = await optionalUser(req);
    if (!maybe) return NextResponse.json({ job: null });
    const ready = await requireRouterReady(req);
    if (ready instanceof Response) return ready;
    const user = ready;

    const rows = await db
      .select({
        id: jobs.id,
        status: jobs.status,
        paymentStatus: jobs.paymentStatus,
        payoutStatus: jobs.payoutStatus,
        title: jobs.title,
        scope: jobs.scope,
        region: jobs.region,
        serviceType: jobs.serviceType,
        timeWindow: jobs.timeWindow,
        routerEarningsCents: jobs.routerEarningsCents,
        claimedAt: jobs.claimedAt,
        routedAt: jobs.routedAt,
        contractorCompletedAt: jobs.contractorCompletedAt,
        customerApprovedAt: jobs.customerApprovedAt,
        routerApprovedAt: jobs.routerApprovedAt,
      })
      .from(jobs)
      .where(
        and(
          // Prisma field `routerId` is mapped to DB column `claimedByUserId`.
          eq(jobs.claimedByUserId, user.userId),
          inArray(jobs.status, [...ACTIVE_STATUSES]),
        ),
      )
      .orderBy(desc(jobs.claimedAt))
      .limit(1);

    const job = rows[0] ?? null;

    return NextResponse.json({ job });
  } catch (err) {
    const { status, message } = toHttpError(err);
    return NextResponse.json({ error: message }, { status });
  }
}

