import "dotenv/config";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { assertNotProductionSeed } from "./_seedGuard";

function sha256(s: string): string {
  return crypto.createHash("sha256").update(s).digest("hex");
}

function ensureDatabaseUrl() {
  if (process.env.DATABASE_URL) return;
  const p = path.join(process.cwd(), ".env.local");
  if (!fs.existsSync(p)) throw new Error("DATABASE_URL not set and apps/api/.env.local not found");
  const txt = fs.readFileSync(p, "utf8");
  const m = txt.match(/^DATABASE_URL\s*=\s*(.+)$/m);
  if (!m) throw new Error("DATABASE_URL missing in apps/api/.env.local");
  process.env.DATABASE_URL = m[1].trim();
}

async function main() {
  assertNotProductionSeed("seed-contractor-dashboard-e2e-drizzle.ts");
  ensureDatabaseUrl();

  const { isDevelopmentMocksEnabled } = await import("../src/config/developmentMocks");
  if (!isDevelopmentMocksEnabled()) {
    console.error("E2E seed scripts require DEVELOPMENT_MOCKS=true.");
    process.exit(1);
  }

  const { and, eq, sql } = await import("drizzle-orm");
  const { db } = await import("../db/drizzle");
  const { contractorAccounts } = await import("../db/schema/contractorAccount");
  const { contractors } = await import("../db/schema/contractor");
  const { jobAssignments } = await import("../db/schema/jobAssignment");
  const { jobDispatches } = await import("../db/schema/jobDispatch");
  const { jobPayments } = await import("../db/schema/jobPayment");
  const { jobs } = await import("../db/schema/job");
  const { users } = await import("../db/schema/user");

  const contractorEmail = "contractor.e2e@8fold.local";
  const posterEmail = "poster.e2e@8fold.local";
  const routerEmail = "router.e2e@8fold.local";
  const now = new Date();

  const contractorUser = await db
    .insert(users)
    .values({
      id: crypto.randomUUID(),
      email: contractorEmail,
      role: "CONTRACTOR",
      status: "ACTIVE",
      country: "US",
      phone: "+1 555 0100",
      createdAt: now,
      updatedAt: now,
    } as any)
    .onConflictDoUpdate({
      target: users.email,
      set: { role: "CONTRACTOR", status: "ACTIVE", country: "US", phone: "+1 555 0100", updatedAt: now } as any,
    })
    .returning({ id: users.id });

  const posterUser = await db
    .insert(users)
    .values({
      id: crypto.randomUUID(),
      email: posterEmail,
      role: "JOB_POSTER",
      status: "ACTIVE",
      country: "US",
      phone: "+1 555 0200",
      name: "E2E Poster",
      createdAt: now,
      updatedAt: now,
    } as any)
    .onConflictDoUpdate({
      target: users.email,
      set: { role: "JOB_POSTER", status: "ACTIVE", country: "US", phone: "+1 555 0200", name: "E2E Poster", updatedAt: now } as any,
    })
    .returning({ id: users.id });

  const routerUser = await db
    .insert(users)
    .values({
      id: crypto.randomUUID(),
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
    .returning({ id: users.id });

  await db
    .insert(contractorAccounts)
    .values({
      userId: contractorUser[0]!.id,
      tradeCategory: "HANDYMAN",
      regionCode: "TX",
      country: "US",
      wizardCompleted: true,
      isApproved: true,
      isActive: true,
      createdAt: now,
    } as any)
    .onConflictDoUpdate({
      target: contractorAccounts.userId,
      set: { tradeCategory: "HANDYMAN", regionCode: "TX", wizardCompleted: true, isApproved: true, isActive: true } as any,
    });

  const existingContractor = await db
    .select({ id: contractors.id })
    .from(contractors)
    .where(sql<boolean>`lower(${contractors.email}) = ${contractorEmail.toLowerCase()}`)
    .limit(1);
  const contractorId = existingContractor[0]?.id ?? crypto.randomUUID();
  if (existingContractor[0]?.id) {
    await db
      .update(contractors)
      .set({
        status: "APPROVED",
        businessName: "E2E Contractor Co",
        email: contractorEmail,
        phone: "+1 555 0100",
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
      .where(eq(contractors.id, contractorId));
  } else {
    await db.insert(contractors).values({
      id: contractorId,
      status: "APPROVED",
      businessName: "E2E Contractor Co",
      email: contractorEmail,
      phone: "+1 555 0100",
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

  const jobTitle = "E2E: Contractor booking + payment release";
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
        claimedByUserId: routerUser[0]!.id,
        claimedAt: null,
        contactedAt: null,
        routedAt: null,
        firstRoutedAt: null,
        adminRoutedById: null,
        contractorUserId: null,
        jobPosterUserId: posterUser[0]!.id,
        customerApprovedAt: null,
        customerRejectedAt: null,
        routerApprovedAt: null,
        paymentReleasedAt: null,
        contractorCompletedAt: null,
        contractorCompletionSummary: null,
        archived: false,
      } as any)
      .where(eq(jobs.id, jobId));
  } else {
    await db.insert(jobs).values({
      id: jobId,
      status: "PUBLISHED",
      title: jobTitle,
      scope:
        "Verify contractor dashboard: accept offer with booking date/time window, unlock poster contact, complete job, release payment.",
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
      claimedByUserId: routerUser[0]!.id,
      jobPosterUserId: posterUser[0]!.id,
    } as any);
  }

  await db.delete(jobDispatches).where(eq(jobDispatches.jobId, jobId));
  await db.delete(jobAssignments).where(eq(jobAssignments.jobId, jobId));

  const paymentIntentId = `pi_e2e_contractor_${jobId}`;
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
      set: { status: "CAPTURED", stripePaymentIntentStatus: "succeeded", escrowLockedAt: now, paymentCapturedAt: now, updatedAt: now } as any,
    });
  await db.update(jobs).set({ paymentCapturedAt: now, escrowLockedAt: now } as any).where(eq(jobs.id, jobId));

  const rawToken = crypto.randomBytes(24).toString("hex");
  const tokenHash = sha256(rawToken);
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

  const dispatch = await db
    .insert(jobDispatches)
    .values({
      id: crypto.randomUUID(),
      status: "PENDING",
      tokenHash,
      jobId,
      contractorId,
      routerUserId: routerUser[0]!.id,
      expiresAt,
      createdAt: now,
      updatedAt: now,
    } as any)
    .returning({ id: jobDispatches.id });

  await db
    .update(jobs)
    .set({ routedAt: now, routingStatus: "ROUTED_BY_ROUTER", firstRoutedAt: now } as any)
    .where(eq(jobs.id, jobId));

  console.log(
    JSON.stringify(
      {
        ok: true,
        contractorEmail,
        contractorUserId: contractorUser[0]!.id,
        contractorId,
        posterEmail,
        posterUserId: posterUser[0]!.id,
        routerEmail,
        routerUserId: routerUser[0]!.id,
        jobId,
        dispatchId: dispatch[0]!.id,
        dispatchToken: process.env.NODE_ENV !== "production" && process.env.ALLOW_DEV_OTP_ECHO === "true" ? rawToken : undefined,
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

