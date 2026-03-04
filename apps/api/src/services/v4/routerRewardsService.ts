import { eq, sql, desc } from "drizzle-orm";
import { db } from "@/db/drizzle";
import { routerProfilesV4 } from "@/db/schema/routerProfileV4";
import { v4RouterRewardEvents } from "@/db/schema/v4RouterRewardEvents";

export async function addRouterReward({
  routerUserId,
  eventType,
  amountCents,
  jobId,
}: {
  routerUserId: string;
  eventType: string;
  amountCents: number;
  jobId?: string;
}) {
  await db.transaction(async (tx) => {
    await tx.insert(v4RouterRewardEvents).values({
      routerUserId,
      eventType,
      amountCents,
      jobId: jobId ?? null,
    });

    await tx
      .update(routerProfilesV4)
      .set({
        rewardsBalanceCents: sql`rewards_balance_cents + ${amountCents}` as any,
      })
      .where(eq(routerProfilesV4.userId, routerUserId));
  });
}

export async function getRouterRewardsBalance(userId: string): Promise<number> {
  const rows = await db
    .select({ rewardsBalanceCents: routerProfilesV4.rewardsBalanceCents })
    .from(routerProfilesV4)
    .where(eq(routerProfilesV4.userId, userId))
    .limit(1);
  return rows[0]?.rewardsBalanceCents ?? 0;
}

export async function getRouterRewardHistory(userId: string) {
  return db
    .select()
    .from(v4RouterRewardEvents)
    .where(eq(v4RouterRewardEvents.routerUserId, userId))
    .orderBy(desc(v4RouterRewardEvents.createdAt))
    .limit(20);
}
