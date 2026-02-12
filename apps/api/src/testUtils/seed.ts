import { randomUUID } from "crypto";
import { db as appDb } from "../../db/drizzle";
import { contractors, jobs, users } from "../../db/schema";

type DbLike = typeof appDb;

export async function seedTestUser(db: DbLike, authUserId: string, role: "USER" | "ADMIN") {
  const id = randomUUID();
  const out =
    (
      await db
        .insert(users)
        .values({ id, authUserId, role: role as any })
        .onConflictDoUpdate({
          target: users.authUserId,
          set: { role: role as any },
        })
        .returning()
    )[0] ?? null;
  return out;
}

export async function seedApprovedContractor(db: DbLike, businessName: string) {
  const id = randomUUID();
  const out =
    (
      await db
        .insert(contractors)
        .values({
          id,
          status: "APPROVED",
          businessName,
          country: "US" as any,
          regionCode: "TX",
          trade: "PLUMBING",
          categories: ["plumbing"],
          regions: ["tx"],
          approvedAt: new Date(),
        } as any)
        .returning()
    )[0] ?? null;
  return out;
}

export async function seedOpenJob(
  db: DbLike,
  opts?: Partial<{ routerEarningsCents: number; brokerFeeCents: number }>,
) {
  const id = randomUUID();
  const out =
    (
      await db
        .insert(jobs)
        .values({
          id,
          status: "PUBLISHED" as any,
          title: "Test Job",
          scope: "Test scope",
          region: "austin-tx",
          country: "US" as any,
          currency: "USD" as any,
          serviceType: "plumbing",
          jobType: "urban" as any,
          lat: 30.2672,
          lng: -97.7431,
          timeWindow: "Today",
          routerEarningsCents: opts?.routerEarningsCents ?? 2500,
          brokerFeeCents: opts?.brokerFeeCents ?? 5000,
          publishedAt: new Date(),
        } as any)
        .returning()
    )[0] ?? null;
  return out;
}

