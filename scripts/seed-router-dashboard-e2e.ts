import "dotenv/config";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { assertNotProductionSeed } from "../apps/api/scripts/_seedGuard";

/**
 * Drizzle-first seed for Router Dashboard E2E.
 *
 * Usage:
 *   pnpm tsx scripts/seed-router-dashboard-e2e.ts
 */

function ensureDatabaseUrl() {
  if (process.env.DATABASE_URL) return;
  const p = path.join(process.cwd(), "apps/api/.env.local");
  if (!fs.existsSync(p)) throw new Error("DATABASE_URL not set and apps/api/.env.local not found");
  const txt = fs.readFileSync(p, "utf8");
  const m = txt.match(/^DATABASE_URL\s*=\s*(.+)$/m);
  if (!m) throw new Error("DATABASE_URL missing in apps/api/.env.local");
  process.env.DATABASE_URL = m[1].trim();
}

async function main() {
  assertNotProductionSeed("scripts/seed-router-dashboard-e2e.ts");
  ensureDatabaseUrl();

  const { db } = await import("../apps/api/db/drizzle");
  const { users } = await import("../apps/api/db/schema/user");
  const { routerProfiles } = await import("../apps/api/db/schema/routerProfile");
  const { routers } = await import("../apps/api/db/schema/router");
  const { contractors } = await import("../apps/api/db/schema/contractor");
  const { jobs } = await import("../apps/api/db/schema/job");
  const { jobDispatches } = await import("../apps/api/db/schema/jobDispatch");
  const { jobAssignments } = await import("../apps/api/db/schema/jobAssignment");
  const { jobPhotos } = await import("../apps/api/db/schema/jobPhoto");
  const { jobPayments } = await import("../apps/api/db/schema/jobPayment");
  const { and, eq } = await import("drizzle-orm");

  const routerEmail = "router.e2e@8fold.local";
  const now = new Date();

  const routerUserId = crypto.randomUUID();
  const routerUser = await db
    .insert(users)
    .values({
      id: routerUserId,
      email: routerEmail,
      role: "ROUTER",
      status: "ACTIVE",
      country: "US",
      createdAt: now,
      updatedAt: now,
    } as any)
    .onConflictDoUpdate({
      target: users.email,
      set: { role: "ROUTER", status: "ACTIVE", country: "US", updatedAt: now } as any,
    })
    .returning({ id: users.id, email: users.email });

  const userId = routerUser[0]!.id;

  await db
    .insert(routerProfiles)
    .values({
      id: crypto.randomUUID(),
      userId,
      status: "ACTIVE",
      name: "E2E Router",
      state: "TX",
      lat: 30.2672,
      lng: -97.7431,
      notifyViaEmail: true,
      notifyViaSms: false,
      createdAt: now,
      updatedAt: now,
    } as any)
    .onConflictDoUpdate({
      target: routerProfiles.userId,
      set: {
        status: "ACTIVE",
        name: "E2E Router",
        state: "TX",
        lat: 30.2672,
        lng: -97.7431,
        notifyViaEmail: true,
        notifyViaSms: false,
        updatedAt: now,
      } as any,
    });

  await db
    .insert(routers)
    .values({
      userId,
      homeCountry: "US",
      homeRegionCode: "TX",
      homeCity: "Austin",
      status: "ACTIVE",
      dailyRouteLimit: 10,
      isSeniorRouter: false,
      termsAccepted: true,
      profileComplete: true,
      createdAt: now,
    } as any)
    .onConflictDoUpdate({
      target: routers.userId,
      set: {
        homeCountry: "US",
        homeRegionCode: "TX",
        homeCity: "Austin",
        status: "ACTIVE",
        termsAccepted: true,
        profileComplete: true,
      } as any,
    });

  const contractorNames = [
    "Austin Handy Pros",
    "Lone Star Fix-It",
    "Capital City Repairs",
    "Hill Country Helpers",
    "ATX Home Services",
  ];

  const seededContractors: Array<{ id: string; businessName: string }> = [];
  for (const businessName of contractorNames) {
    const existing = await db
      .select({ id: contractors.id })
      .from(contractors)
      .where(eq(contractors.businessName, businessName))
      .limit(1);
    const id = existing[0]?.id ?? crypto.randomUUID();
    if (existing[0]?.id) {
      await db
        .update(contractors)
        .set({
          status: "APPROVED",
          businessName,
          country: "US",
          regionCode: "TX",
          trade: "CARPENTRY",
          tradeCategories: ["HANDYMAN"],
          categories: ["handyman"],
          regions: ["austin-tx"],
          lat: 30.2672,
          lng: -97.7431,
          automotiveEnabled: false,
          approvedAt: now,
        } as any)
        .where(eq(contractors.id, id));
    } else {
      await db.insert(contractors).values({
        id,
        status: "APPROVED",
        businessName,
        country: "US",
        regionCode: "TX",
        trade: "CARPENTRY",
        tradeCategories: ["HANDYMAN"],
        categories: ["handyman"],
        regions: ["austin-tx"],
        lat: 30.2672,
        lng: -97.7431,
        automotiveEnabled: false,
        approvedAt: now,
        createdAt: now,
      } as any);
    }
    seededContractors.push({ id, businessName });
  }

  const jobTitle = "E2E: Garage cleanup & small repairs";
  const existingJob = await db
    .select({ id: jobs.id })
    .from(jobs)
    .where(and(eq(jobs.title, jobTitle), eq(jobs.isMock, false), eq(jobs.jobSource, "REAL"), eq(jobs.country, "US"), eq(jobs.regionCode, "TX")))
    .limit(1);

  const jobId = existingJob[0]?.id ?? crypto.randomUUID();
  if (existingJob[0]?.id) {
    await db.update(jobs).set({
      status: "PUBLISHED",
      routingStatus: "UNROUTED",
      claimedByUserId: null,
      claimedAt: null,
      contactedAt: null,
      routedAt: null,
      firstRoutedAt: null,
      adminRoutedById: null,
      contractorUserId: null,
      archived: false,
    } as any).where(eq(jobs.id, jobId));
  } else {
    await db.insert(jobs).values({
      id: jobId,
      status: "PUBLISHED",
      title: jobTitle,
      scope:
        "Customer needs a quick garage cleanup and a few small repairs (tighten hinges, patch minor drywall). No direct customer contact for router.",
      region: "austin-tx",
      country: "US",
      regionCode: "TX",
      regionName: "Austin, TX",
      city: "Austin",
      postalCode: "78701",
      serviceType: "handyman",
      tradeCategory: "HANDYMAN",
      jobType: "urban",
      lat: 30.2672,
      lng: -97.7431,
      routerEarningsCents: 4500,
      brokerFeeCents: 9000,
      contractorPayoutCents: 25000,
      laborTotalCents: 25000,
      materialsTotalCents: 0,
      transactionFeeCents: 0,
      publicStatus: "OPEN",
      jobSource: "REAL",
      isMock: false,
      publishedAt: now,
      postedAt: now,
      createdAt: now,
    } as any);
  }

  // Reset derived artifacts for idempotent E2E runs.
  await db.delete(jobDispatches).where(eq(jobDispatches.jobId, jobId));
  await db.delete(jobAssignments).where(eq(jobAssignments.jobId, jobId));
  await db.delete(jobPhotos).where(eq(jobPhotos.jobId, jobId));

  const paymentIntentId = `pi_e2e_${jobId}`;
  const paymentId = crypto.randomUUID();
  await db
    .insert(jobPayments)
    .values({
      id: paymentId,
      jobId,
      stripePaymentIntentId: paymentIntentId,
      stripePaymentIntentStatus: "succeeded",
      stripeChargeId: `ch_e2e_${jobId}`,
      amountCents: 25000 + 4500 + 9000,
      status: "CAPTURED",
      escrowLockedAt: now,
      paymentCapturedAt: now,
      createdAt: now,
      updatedAt: now,
    } as any)
    .onConflictDoUpdate({
      target: jobPayments.stripePaymentIntentId,
      set: { status: "CAPTURED", stripePaymentIntentStatus: "succeeded", paymentCapturedAt: now, updatedAt: now } as any,
    });

  await db.update(jobs).set({ paymentCapturedAt: now, escrowLockedAt: now } as any).where(eq(jobs.id, jobId));

  console.log(
    JSON.stringify(
      {
        ok: true,
        routerEmail,
        routerUserId: userId,
        jobId,
        contractors: seededContractors,
      },
      null,
      2,
    ),
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

