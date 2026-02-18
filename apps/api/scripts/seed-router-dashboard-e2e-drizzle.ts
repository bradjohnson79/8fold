import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { assertNotProductionSeed } from "./_seedGuard";

// Env isolation: load from apps/api/.env.local only (no repo-root fallback).
const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const API_ENV_PATH = path.join(SCRIPT_DIR, "..", ".env.local");
dotenv.config({ path: API_ENV_PATH });

function ensureDatabaseUrl() {
  if (process.env.DATABASE_URL) return;
  if (!fs.existsSync(API_ENV_PATH)) throw new Error("DATABASE_URL not set and apps/api/.env.local not found");
  const txt = fs.readFileSync(API_ENV_PATH, "utf8");
  const m = txt.match(/^DATABASE_URL\s*=\s*(.+)$/m);
  if (!m) throw new Error("DATABASE_URL missing in apps/api/.env.local");
  process.env.DATABASE_URL = m[1].trim();
}

async function main() {
  assertNotProductionSeed("seed-router-dashboard-e2e-drizzle.ts");
  ensureDatabaseUrl();

  const { isDevelopmentMocksEnabled } = await import("../src/config/developmentMocks");
  if (!isDevelopmentMocksEnabled()) {
    console.error("E2E seed scripts require DEVELOPMENT_MOCKS=true.");
    process.exit(1);
  }

  const { and, eq } = await import("drizzle-orm");
  const { db } = await import("../db/drizzle");
  const { contractors } = await import("../db/schema/contractor");
  const { jobAssignments } = await import("../db/schema/jobAssignment");
  const { jobDispatches } = await import("../db/schema/jobDispatch");
  const { jobPayments } = await import("../db/schema/jobPayment");
  const { jobPhotos } = await import("../db/schema/jobPhoto");
  const { jobs } = await import("../db/schema/job");
  const { routers } = await import("../db/schema/router");
  const { routerProfiles } = await import("../db/schema/routerProfile");
  const { users } = await import("../db/schema/user");

  const routerEmail = "router.e2e@8fold.local";
  const now = new Date();

  const existingUser = await db
    .select({ id: users.id, role: users.role })
    .from(users)
    .where(eq(users.email, routerEmail))
    .limit(1);
  let routerUserId = existingUser[0]?.id ?? null;
  if (routerUserId) {
    const currentRole = String(existingUser[0]?.role ?? "").toUpperCase();
    if (currentRole !== "ROUTER") {
      throw new Error(`ROLE_IMMUTABLE: existing role=${currentRole} attempted=ROUTER for ${routerEmail}`);
    }
    // Update non-role fields only.
    await db.update(users).set({ status: "ACTIVE", country: "US", updatedAt: now } as any).where(eq(users.id, routerUserId));
  } else {
    routerUserId = crypto.randomUUID();
    await db.insert(users).values({
      id: routerUserId,
      clerkUserId: `seed:e2e:${routerEmail}`,
      email: routerEmail,
      role: "ROUTER",
      status: "ACTIVE",
      country: "US",
      createdAt: now,
      updatedAt: now,
    } as any);
  }

  await db
    .insert(routerProfiles)
    .values({
      id: crypto.randomUUID(),
      userId: routerUserId,
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
      userId: routerUserId,
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
    await db
      .update(jobs)
      .set({
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
      } as any)
      .where(eq(jobs.id, jobId));
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
  await db
    .insert(jobPayments)
    .values({
      id: crypto.randomUUID(),
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
        routerUserId,
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

