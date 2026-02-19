import { NextResponse } from "next/server";
import { z } from "zod";
import { and, desc, eq, gt, isNotNull } from "drizzle-orm";
import { handleApiError } from "@/src/lib/errorHandler";
import { db } from "@/db/drizzle";
import { jobs } from "@/db/schema/job";
import { users } from "@/db/schema/user";
import { requireFinancialTier } from "../_lib/requireFinancial";

const QuerySchema = z.object({
  take: z.coerce.number().int().min(1).max(2000).optional(),
});

function isCompletedStatus(s: string): boolean {
  // Job status enum includes both legacy and current variants; keep this permissive.
  return (
    s === "COMPLETED" ||
    s === "COMPLETED_APPROVED" ||
    s === "CUSTOMER_APPROVED" ||
    s === "CONTRACTOR_COMPLETED"
  );
}

export async function GET(req: Request) {
  const auth = await requireFinancialTier(req, "ADMIN_OPERATOR");
  if (auth instanceof NextResponse) return auth;

  try {
    const url = new URL(req.url);
    const parsed = QuerySchema.safeParse({ take: url.searchParams.get("take") ?? undefined });
    if (!parsed.success) return NextResponse.json({ ok: false, error: "invalid_query" }, { status: 400 });

    const take = parsed.data.take ?? 500;

    // Express proxy signal (current schema): jobs with a non-zero transactionFeeCents.
    // This is a visibility-only approximation until an explicit Express model exists.
    const rows = await db
      .select({
        contractorUserId: jobs.contractorUserId,
        status: jobs.status,
        completedAt: jobs.releasedAt,
        transactionFeeCents: jobs.transactionFeeCents,
        userEmail: users.email,
      })
      .from(jobs)
      .innerJoin(users, eq(users.id, jobs.contractorUserId))
      .where(and(isNotNull(jobs.contractorUserId), gt(jobs.transactionFeeCents, 0)))
      .orderBy(desc(jobs.releasedAt))
      .limit(take);

    const byContractor = new Map<
      string,
      {
        contractorUserId: string;
        contractorEmail: string | null;
        expressJobsCompleted: number;
        consecutiveCleanCount: number;
        // latest-to-oldest statuses for streak calc
        _recentStatuses: string[];
      }
    >();

    for (const r of rows as any[]) {
      const contractorUserId = String(r.contractorUserId ?? "").trim();
      if (!contractorUserId) continue;
      const status = String(r.status ?? "").trim();
      const isCompleted = isCompletedStatus(status);
      if (!isCompleted) continue;

      const cur =
        byContractor.get(contractorUserId) ??
        {
          contractorUserId,
          contractorEmail: r.userEmail ?? null,
          expressJobsCompleted: 0,
          consecutiveCleanCount: 0,
          _recentStatuses: [] as string[],
        };

      cur.expressJobsCompleted += 1;
      cur._recentStatuses.push(status);
      byContractor.set(contractorUserId, cur);
    }

    // "Clean streak" approximation: count recent express completions until first DISPUTED appears.
    for (const cur of byContractor.values()) {
      let streak = 0;
      for (const s of cur._recentStatuses) {
        if (s === "DISPUTED") break;
        streak += 1;
      }
      cur.consecutiveCleanCount = streak;
    }

    const GOAL = 8;
    const out = Array.from(byContractor.values())
      .sort((a, b) => b.expressJobsCompleted - a.expressJobsCompleted)
      .slice(0, 500)
      .map((c) => {
        const progress = Math.min(GOAL, c.consecutiveCleanCount);
        return {
          contractorUserId: c.contractorUserId,
          contractorEmail: c.contractorEmail,
          expressJobsCompleted: c.expressJobsCompleted,
          consecutiveCleanCount: c.consecutiveCleanCount,
          bonusEligibilityProgress: `${progress}/${GOAL}`,
          nextEligibleBonusPayoutDate: null as string | null,
          bonusPaid: false,
        };
      });

    return NextResponse.json({ ok: true, data: { rows: out } }, { status: 200 });
  } catch (err) {
    return handleApiError(err, "GET /api/admin/financial/incentives", { userId: auth.userId });
  }
}

