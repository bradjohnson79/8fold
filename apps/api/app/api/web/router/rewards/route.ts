import { and, eq, sql } from "drizzle-orm";
import { db } from "../../../../../db/drizzle";
import { users } from "../../../../../db/schema/user";
import { routerRewards } from "../../../../../db/schema/routerReward";
import { requireRouter } from "../../../../../src/auth/rbac";
import { handleApiError } from "../../../../../src/lib/errorHandler";
import { ok } from "../../../../../src/lib/api/respond";
import { getOrCreatePlatformUserId } from "../../../../../src/system/platformUser";
import { settlePendingRouterRewardsForRouter } from "../../../../../src/rewards/routerRewards";

export async function GET(req: Request) {
  try {
    const router = await requireRouter(req);
    const platformUserId = await getOrCreatePlatformUserId();

    const data = await db.transaction(async (tx) => {
      // Attempt to settle any pending rewards that have become payout-safe.
      await settlePendingRouterRewardsForRouter({ tx, platformUserId, routerUserId: router.userId, limit: 25 });

      const [referredUsersRows, pendingRows, paidRows] = await Promise.all([
        tx
          .select({ c: sql<number>`count(*)::int` })
          .from(users)
          .where(eq(users.referredByRouterId, router.userId))
          .limit(1),
        tx
          .select({ c: sql<number>`count(*)::int` })
          .from(routerRewards)
          .where(and(eq(routerRewards.routerUserId, router.userId), eq(routerRewards.status, "PENDING" as any)))
          .limit(1),
        tx
          .select({ c: sql<number>`count(*)::int` })
          .from(routerRewards)
          .where(and(eq(routerRewards.routerUserId, router.userId), eq(routerRewards.status, "PAID" as any)))
          .limit(1),
      ]);

      const totalReferredUsers = Number(referredUsersRows[0]?.c ?? 0);
      const pendingRewards = Number(pendingRows[0]?.c ?? 0);
      const paidRewards = Number(paidRows[0]?.c ?? 0);

      return {
        totalReferredUsers,
        completedReferredJobs: paidRewards,
        pendingRewards,
        paidRewards,
      };
    });

    return ok(data);
  } catch (err) {
    return handleApiError(err, "GET /api/web/router/rewards");
  }
}

