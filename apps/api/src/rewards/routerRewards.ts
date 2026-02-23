import crypto from "node:crypto";
import { and, eq, ne, or, sql } from "drizzle-orm";
import { jobs } from "@/db/schema/job";
import { ledgerEntries } from "@/db/schema/ledgerEntry";
import { routerRewards } from "@/db/schema/routerReward";
import { routers } from "@/db/schema/router";
import { users } from "@/db/schema/user";

export const ROUTER_REFERRAL_REWARD_CENTS = 500;

type Tx = any;

function asUpper(v: unknown): string {
  return String(v ?? "").trim().toUpperCase();
}

export async function maybeCreateRouterReferralRewardForUser(opts: {
  tx: Tx;
  jobId: string;
  referredUserId: string;
}): Promise<{ created: boolean; rewardId?: string; routerUserId?: string }>{
  const { tx, jobId, referredUserId } = opts;
  if (!referredUserId) return { created: false };

  const uRows = await tx
    .select({ id: users.id, role: users.role, referredByRouterId: users.referredByRouterId })
    .from(users)
    .where(eq(users.id, referredUserId))
    .limit(1);
  const u = uRows[0] ?? null;
  if (!u) return { created: false };

  const referredBy = String(u.referredByRouterId ?? "").trim();
  if (!referredBy) return { created: false };
  if (referredBy === referredUserId) return { created: false };

  const userRole = asUpper(u.role);
  if (userRole === "ROUTER" || userRole === "ADMIN") return { created: false }; // routers/admins are not eligible for referral rewards

  // Ensure the router exists and is active.
  const rUserRows = await tx
    .select({ id: users.id, role: users.role })
    .from(users)
    .where(eq(users.id, referredBy))
    .limit(1);
  const rUser = rUserRows[0] ?? null;
  if (!rUser || asUpper(rUser.role) !== "ROUTER") return { created: false };

  const rRows = await tx
    .select({ userId: routers.userId, status: routers.status })
    .from(routers)
    .where(and(eq(routers.userId, referredBy), eq(routers.status, "ACTIVE" as any)))
    .limit(1);
  if (!rRows[0]?.userId) return { created: false };

  // "First completed job" guard: only issue reward for first COMPLETED_APPROVED job.
  // Note: We check against existing completed jobs before this one.
  const priorCompleted = await tx
    .select({ id: jobs.id })
    .from(jobs)
    .where(
      and(
        eq(jobs.status, "COMPLETED_APPROVED" as any),
        eq(jobs.is_mock, false),
        ne(jobs.id, jobId),
        or(eq(jobs.job_poster_user_id, referredUserId), eq(jobs.contractor_user_id, referredUserId)),
      ),
    )
    .limit(1);
  if (priorCompleted[0]?.id) return { created: false };

  const rewardId = crypto.randomUUID();
  const inserted = await tx
    .insert(routerRewards)
    .values({
      id: rewardId,
      routerUserId: referredBy,
      referredUserId,
      jobId,
      amount: ROUTER_REFERRAL_REWARD_CENTS,
      status: "PENDING",
    } as any)
    .onConflictDoNothing({ target: [routerRewards.referredUserId] })
    .returning({ id: routerRewards.id });

  if (!inserted[0]?.id) return { created: false };
  return { created: true, rewardId, routerUserId: referredBy };
}

async function platformAvailableCents(tx: Tx, platformUserId: string): Promise<number> {
  const rows = await tx
    .select({
      available: sql<number>`coalesce(sum(case when ${ledgerEntries.direction} = 'CREDIT' then ${ledgerEntries.amountCents} else -${ledgerEntries.amountCents} end), 0)::int`,
    })
    .from(ledgerEntries)
    .where(and(eq(ledgerEntries.userId, platformUserId), eq(ledgerEntries.bucket, "AVAILABLE" as any)))
    .limit(1);
  return Number(rows[0]?.available ?? 0);
}

export async function trySettleRouterReward(opts: {
  tx: Tx;
  platformUserId: string;
  reward: { id: string; routerUserId: string; jobId: string; amount: number; status: string };
}): Promise<{ settled: boolean; reason?: string }>{
  const { tx, platformUserId, reward } = opts;
  if (!reward?.id) return { settled: false, reason: "MISSING_REWARD" };
  if (asUpper(reward.status) !== "PENDING") return { settled: false, reason: "NOT_PENDING" };

  // Only settle after payout is released (refund-safe: refund blocks after RELEASED).
  const jobRows = await tx
    .select({ id: jobs.id, payoutStatus: jobs.payout_status, paymentStatus: jobs.payment_status })
    .from(jobs)
    .where(eq(jobs.id, reward.jobId))
    .limit(1);
  const job = jobRows[0] ?? null;
  if (!job) return { settled: false, reason: "JOB_MISSING" };
  if (asUpper(job.paymentStatus) === "REFUNDED") return { settled: false, reason: "JOB_REFUNDED" };
  if (asUpper(job.payoutStatus) !== "RELEASED") return { settled: false, reason: "PAYOUT_NOT_RELEASED" };

  const amount = Number(reward.amount ?? 0);
  if (!Number.isInteger(amount) || amount <= 0) return { settled: false, reason: "BAD_AMOUNT" };

  const available = await platformAvailableCents(tx, platformUserId);
  if (available < amount) return { settled: false, reason: "PLATFORM_INSUFFICIENT" };

  const memo = `Router referral reward ($${(amount / 100).toFixed(2)})`;

  await tx.insert(ledgerEntries).values({
    id: crypto.randomUUID(),
    userId: platformUserId,
    jobId: reward.jobId,
    type: "ADJUSTMENT",
    direction: "DEBIT",
    bucket: "AVAILABLE",
    amountCents: amount,
    memo,
  } as any);

  await tx.insert(ledgerEntries).values({
    id: crypto.randomUUID(),
    userId: reward.routerUserId,
    jobId: reward.jobId,
    type: "ADJUSTMENT",
    direction: "CREDIT",
    bucket: "AVAILABLE",
    amountCents: amount,
    memo,
  } as any);

  const now = new Date();
  await tx
    .update(routerRewards)
    .set({ status: "PAID", paidAt: now } as any)
    .where(and(eq(routerRewards.id, reward.id), eq(routerRewards.status, "PENDING" as any)));

  return { settled: true };
}

export async function settlePendingRouterRewardsForRouter(opts: {
  tx: Tx;
  platformUserId: string;
  routerUserId: string;
  limit?: number;
}): Promise<{ settled: number }>{
  const { tx, platformUserId, routerUserId } = opts;
  const limit = Math.max(1, Math.min(50, Number(opts.limit ?? 25)));

  const pending = await tx
    .select({
      id: routerRewards.id,
      routerUserId: routerRewards.routerUserId,
      referredUserId: routerRewards.referredUserId,
      jobId: routerRewards.jobId,
      amount: routerRewards.amount,
      status: routerRewards.status,
    })
    .from(routerRewards)
    .where(and(eq(routerRewards.routerUserId, routerUserId), eq(routerRewards.status, "PENDING" as any)))
    .limit(limit);

  let settled = 0;
  for (const r of pending) {
    const out = await trySettleRouterReward({
      tx,
      platformUserId,
      reward: { id: r.id, routerUserId: r.routerUserId, jobId: r.jobId, amount: Number(r.amount ?? 0), status: String(r.status) },
    });
    if (out.settled) settled += 1;
  }

  return { settled };
}

