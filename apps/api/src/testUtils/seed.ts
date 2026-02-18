import { randomUUID } from "crypto";
import { eq } from "drizzle-orm";
import { db as appDb } from "@/server/db/drizzle";
import { contractors, jobs, users } from "../../db/schema";

type DbLike = typeof appDb;

export async function seedTestUser(
  db: DbLike,
  clerkUserId: string,
  role: "JOB_POSTER" | "CONTRACTOR" | "ROUTER" | "ADMIN",
) {
  const id = randomUUID();
  const inserted =
    (
      await db
        .insert(users)
        .values({ id, clerkUserId, role: role as any } as any)
        .onConflictDoNothing({ target: users.clerkUserId })
        .returning()
    )[0] ?? null;
  if (inserted) return inserted;

  const existing = (
    await db
      .select()
      .from(users)
      .where(eq(users.clerkUserId, clerkUserId))
      .limit(1)
  )[0] ?? null;
  if (existing && String((existing as any).role ?? "").toUpperCase() !== role) {
    throw new Error(`ROLE_IMMUTABLE: existing role=${String((existing as any).role)} attempted=${role}`);
  }
  return existing;
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

