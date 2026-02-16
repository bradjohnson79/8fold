import path from "node:path";
import crypto from "node:crypto";
import { assertNotProductionSeed } from "./_seedGuard";

function envOrThrow(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is required`);
  return v;
}

async function main() {
  assertNotProductionSeed("seed-audit-users.ts");
  // Ensure env is loaded before importing db.
  const dotenv = await import("dotenv");
  dotenv.config({ path: path.join(process.cwd(), ".env.local") });
  envOrThrow("DATABASE_URL");

  const { isDevelopmentMocksEnabled } = await import("../src/config/developmentMocks");
  if (!isDevelopmentMocksEnabled()) {
    console.error("Seed scripts require DEVELOPMENT_MOCKS=true. Set in .env to create audit users.");
    process.exit(1);
  }

  const { eq } = await import("drizzle-orm");
  const { sql } = await import("drizzle-orm");
  const { db } = await import("../db/drizzle");
  const { users } = await import("../db/schema/user");
  const { jobPosterProfiles } = await import("../db/schema/jobPosterProfile");
  const { routers } = await import("../db/schema/router");
  const { routerProfiles } = await import("../db/schema/routerProfile");
  const { contractorAccounts } = await import("../db/schema/contractorAccount");
  const { contractors } = await import("../db/schema/contractor");

  const NOW = new Date();

  const posterEmail = "poster.audit@8fold.local";
  const routerEmail = "router.audit@8fold.local";
  const contractorEmail = "contractor.audit@8fold.local";

  async function upsertUserByEmail(email: string, role: string) {
    const existing = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
    const id = existing[0]?.id ?? crypto.randomUUID();
    if (existing.length) {
      await db.update(users).set({ role: role as any, status: "ACTIVE" as any, updatedAt: NOW }).where(eq(users.id, id));
      return id;
    }
    await db.insert(users).values({
      id,
      email,
      role: role as any,
      status: "ACTIVE" as any,
      country: "CA" as any,
      createdAt: NOW,
      updatedAt: NOW,
      accountStatus: "ACTIVE",
      suspendedUntil: null,
      archivedAt: null,
      deletionReason: null,
    } as any);
    return id;
  }

  const posterUserId = await upsertUserByEmail(posterEmail, "JOB_POSTER");
  const routerUserId = await upsertUserByEmail(routerEmail, "ROUTER");
  const contractorUserId = await upsertUserByEmail(contractorEmail, "CONTRACTOR");

  // Auth schema user rows (public.User) for Session FK integrity.
  async function upsertAuthUser(id: string, email: string, role: string) {
    // Canonical roles only. Auth schema must include JOB_POSTER (backfill-role-taxonomy).
    const authRole = role;
    await db.execute(sql`
      insert into "public"."User" ("id", "email", "role")
      values (${id}, ${email}, ${authRole}::"public"."UserRole")
      on conflict ("id") do update
      set "email" = excluded."email",
          "role" = excluded."role"
    `);
  }
  await upsertAuthUser(posterUserId, posterEmail, "JOB_POSTER");
  await upsertAuthUser(routerUserId, routerEmail, "ROUTER");
  await upsertAuthUser(contractorUserId, contractorEmail, "CONTRACTOR");

  // Langley, BC coords (approx)
  const langleyLat = 49.1044;
  const langleyLng = -122.8011;

  // JobPosterProfile: userId must be unique; id has no DB default.
  const existingPosterProfile = await db
    .select({ id: jobPosterProfiles.id })
    .from(jobPosterProfiles)
    .where(eq(jobPosterProfiles.userId, posterUserId))
    .limit(1);
  if (existingPosterProfile.length) {
    await db
      .update(jobPosterProfiles)
      .set({
        name: "Poster Audit",
        email: posterEmail,
        phone: "6040000000",
        address: "20000 64 Ave",
        city: "Langley",
        stateProvince: "BC",
        country: "CA" as any,
        lat: langleyLat,
        lng: langleyLng,
        defaultJobLocation: "20000 64 Ave, Langley, BC",
        updatedAt: NOW,
      } as any)
      .where(eq(jobPosterProfiles.userId, posterUserId));
  } else {
    await db.insert(jobPosterProfiles).values({
      id: crypto.randomUUID(),
      userId: posterUserId,
      name: "Poster Audit",
      email: posterEmail,
      phone: "6040000000",
      address: "20000 64 Ave",
      city: "Langley",
      stateProvince: "BC",
      country: "CA" as any,
      lat: langleyLat,
      lng: langleyLng,
      defaultJobLocation: "20000 64 Ave, Langley, BC",
      createdAt: NOW,
      updatedAt: NOW,
    } as any);
  }

  // Router profile gate requires RouterProfile.status === "ACTIVE"
  const existingRouterProfile = await db
    .select({ id: routerProfiles.id })
    .from(routerProfiles)
    .where(eq(routerProfiles.userId, routerUserId))
    .limit(1);
  if (existingRouterProfile.length) {
    await db
      .update(routerProfiles)
      .set({
        name: "Router Audit",
        state: "BC",
        lat: langleyLat,
        lng: langleyLng,
        status: "ACTIVE",
        updatedAt: NOW,
      } as any)
      .where(eq(routerProfiles.userId, routerUserId));
  } else {
    await db.insert(routerProfiles).values({
      id: crypto.randomUUID(),
      userId: routerUserId,
      name: "Router Audit",
      state: "BC",
      lat: langleyLat,
      lng: langleyLng,
      status: "ACTIVE",
      createdAt: NOW,
      updatedAt: NOW,
    } as any);
  }

  // Routers table is first-class gate (must exist + ACTIVE)
  const existingRouter = await db.select({ userId: routers.userId }).from(routers).where(eq(routers.userId, routerUserId)).limit(1);
  if (existingRouter.length) {
    await db
      .update(routers)
      .set({
        termsAccepted: true,
        profileComplete: true,
        homeCountry: "CA" as any,
        homeRegionCode: "BC",
        homeCity: "Langley",
        isSeniorRouter: true,
        dailyRouteLimit: 10,
        status: "ACTIVE" as any,
      } as any)
      .where(eq(routers.userId, routerUserId));
  } else {
    await db.insert(routers).values({
      userId: routerUserId,
      createdByAdmin: true,
      isActive: true,
      isMock: false,
      isTest: true,
      termsAccepted: true,
      profileComplete: true,
      homeCountry: "CA" as any,
      homeRegionCode: "BC",
      homeCity: "Langley",
      isSeniorRouter: true,
      dailyRouteLimit: 10,
      status: "ACTIVE" as any,
      createdAt: NOW,
    } as any);
  }

  // Contractor account (authenticated profile surface)
  const existingContractorAccount = await db
    .select({ userId: contractorAccounts.userId })
    .from(contractorAccounts)
    .where(eq(contractorAccounts.userId, contractorUserId))
    .limit(1);
  if (existingContractorAccount.length) {
    await db
      .update(contractorAccounts)
      .set({
        isActive: true,
        isMock: false,
        isTest: true,
        wizardCompleted: true,
        status: "APPROVED",
        firstName: "Contractor",
        lastName: "Audit",
        businessName: "Audit Contracting",
        tradeCategory: "FURNITURE_ASSEMBLY",
        serviceRadiusKm: 25,
        country: "CA" as any,
        regionCode: "BC",
        city: "Langley",
        isApproved: true,
      } as any)
      .where(eq(contractorAccounts.userId, contractorUserId));
  } else {
    await db.insert(contractorAccounts).values({
      userId: contractorUserId,
      createdByAdmin: true,
      isActive: true,
      isMock: false,
      isTest: true,
      wizardCompleted: true,
      status: "APPROVED",
      firstName: "Contractor",
      lastName: "Audit",
      businessName: "Audit Contracting",
      tradeCategory: "FURNITURE_ASSEMBLY",
      serviceRadiusKm: 25,
      country: "CA" as any,
      regionCode: "BC",
      city: "Langley",
      isApproved: true,
      jobsCompleted: 0,
      createdAt: NOW,
    } as any);
  }

  // Legacy Contractor table (used by some dispatch/conversation lookups)
  const existingContractor = await db.select({ id: contractors.id }).from(contractors).where(eq(contractors.email, contractorEmail)).limit(1);
  if (existingContractor.length) {
    await db
      .update(contractors)
      .set({
        status: "APPROVED",
        businessName: "Audit Contracting",
        trade: "CARPENTRY",
        email: contractorEmail,
        country: "CA" as any,
        regionCode: "BC",
        lat: langleyLat,
        lng: langleyLng,
        tradeCategories: ["FURNITURE_ASSEMBLY", "JUNK_REMOVAL"] as any,
        regions: ["langley-bc"] as any,
      } as any)
      .where(eq(contractors.id, existingContractor[0]!.id));
  } else {
    await db.insert(contractors).values({
      id: crypto.randomUUID(),
      status: "APPROVED",
      businessName: "Audit Contracting",
      contactName: "Contractor Audit",
      phone: "6040000001",
      email: contractorEmail,
      country: "CA" as any,
      regionCode: "BC",
      trade: "CARPENTRY",
      tradeCategories: ["FURNITURE_ASSEMBLY", "JUNK_REMOVAL"] as any,
      automotiveEnabled: false,
      lat: langleyLat,
      lng: langleyLng,
      regions: ["langley-bc"] as any,
      createdAt: NOW,
    } as any);
  }

  // eslint-disable-next-line no-console
  console.log(JSON.stringify({ ok: true, posterUserId, routerUserId, contractorUserId }, null, 2));
}

main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error(e);
  process.exit(1);
});

