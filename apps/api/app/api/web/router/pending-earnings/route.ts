import { NextResponse } from "next/server";
import { and, eq, inArray, isNotNull } from "drizzle-orm";
import { requireRouterReady } from "../../../../../src/auth/onboardingGuards";
import { toHttpError } from "../../../../../src/http/errors";
import { db } from "../../../../../db/drizzle";
import { jobs } from "../../../../../db/schema/job";

const PENDING_EARNING_STATUSES = [
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
    const ready = await requireRouterReady(req);
    if (ready instanceof Response) return ready;
    const router = ready;

    const jobRows = await db
      .select({ routerEarningsCents: jobs.routerEarningsCents })
      .from(jobs)
      .where(
        and(
          eq(jobs.claimedByUserId, router.userId), // Prisma routerId @map("claimedByUserId")
          isNotNull(jobs.routedAt),
          inArray(jobs.status, [...PENDING_EARNING_STATUSES] as unknown as any),
        ),
      );

    const pendingRouterEarningsCents = jobRows.reduce(
      (sum, j) => sum + Number((j.routerEarningsCents as any) ?? 0),
      0,
    );
    return NextResponse.json({ pendingRouterEarningsCents });
  } catch (err) {
    const { status, message } = toHttpError(err);
    return NextResponse.json({ error: message }, { status });
  }
}

