import "dotenv/config";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { assertNotProductionSeed } from "./_seedGuard";

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
  assertNotProductionSeed("seed-e2e-bc-langley-drizzle.ts");
  ensureDatabaseUrl();

  const { isDevelopmentMocksEnabled } = await import("../src/config/developmentMocks");
  if (!isDevelopmentMocksEnabled()) {
    console.error("E2E seed scripts require DEVELOPMENT_MOCKS=true.");
    process.exit(1);
  }

  const { and, eq, sql } = await import("drizzle-orm");
  const { db } = await import("../db/drizzle");
  const { users } = await import("../db/schema/user");
  const { jobPosterProfiles } = await import("../db/schema/jobPosterProfile");
  const { routerProfiles } = await import("../db/schema/routerProfile");
  const { routers } = await import("../db/schema/router");
  const { contractorAccounts } = await import("../db/schema/contractorAccount");
  const { contractors } = await import("../db/schema/contractor");

  const now = new Date();

  const posterEmail = "poster.bc.e2e@8fold.local";
  const routerEmail = "router.bc.e2e@8fold.local";
  const contractorEmail = "contractor.bc.e2e@8fold.local";

  const langley = { city: "Langley", regionCode: "BC", lat: 49.1044, lng: -122.6600 };
  const vancouver = { city: "Vancouver", regionCode: "BC", lat: 49.2827, lng: -123.1207 };

  const poster = await db
    .insert(users)
    .values({
      id: crypto.randomUUID(),
      email: posterEmail,
      role: "JOB_POSTER",
      status: "ACTIVE",
      country: "CA",
      name: "E2E Poster (BC)",
      phone: "+1 604 555 0200",
      createdAt: now,
      updatedAt: now,
    } as any)
    .onConflictDoUpdate({
      target: users.email,
      set: { role: "JOB_POSTER", status: "ACTIVE", country: "CA", name: "E2E Poster (BC)", phone: "+1 604 555 0200", updatedAt: now } as any,
    })
    .returning({ id: users.id });

  await db
    .insert(jobPosterProfiles)
    .values({
      id: crypto.randomUUID(),
      userId: poster[0]!.id,
      name: "E2E Poster (BC)",
      email: posterEmail,
      phone: "+1 604 555 0200",
      address: "20000 56 Ave",
      city: langley.city,
      stateProvince: langley.regionCode,
      country: "CA",
      lat: langley.lat,
      lng: langley.lng,
      createdAt: now,
      updatedAt: now,
    } as any)
    .onConflictDoUpdate({
      target: jobPosterProfiles.userId,
      set: {
        name: "E2E Poster (BC)",
        email: posterEmail,
        phone: "+1 604 555 0200",
        address: "20000 56 Ave",
        city: langley.city,
        stateProvince: langley.regionCode,
        country: "CA",
        lat: langley.lat,
        lng: langley.lng,
        updatedAt: now,
      } as any,
    });

  const router = await db
    .insert(users)
    .values({
      id: crypto.randomUUID(),
      email: routerEmail,
      role: "ROUTER",
      status: "ACTIVE",
      country: "CA",
      createdAt: now,
      updatedAt: now,
    } as any)
    .onConflictDoUpdate({
      target: users.email,
      set: { role: "ROUTER", status: "ACTIVE", country: "CA", updatedAt: now } as any,
    })
    .returning({ id: users.id });

  await db
    .insert(routerProfiles)
    .values({
      id: crypto.randomUUID(),
      userId: router[0]!.id,
      status: "ACTIVE",
      name: "E2E Router (BC)",
      state: "BC",
      lat: vancouver.lat,
      lng: vancouver.lng,
      notifyViaEmail: true,
      notifyViaSms: false,
      createdAt: now,
      updatedAt: now,
    } as any)
    .onConflictDoUpdate({
      target: routerProfiles.userId,
      set: { status: "ACTIVE", name: "E2E Router (BC)", state: "BC", lat: vancouver.lat, lng: vancouver.lng, notifyViaEmail: true, notifyViaSms: false, updatedAt: now } as any,
    });

  await db
    .insert(routers)
    .values({
      userId: router[0]!.id,
      homeCountry: "CA",
      homeRegionCode: "BC",
      homeCity: vancouver.city,
      status: "ACTIVE",
      dailyRouteLimit: 10,
      isSeniorRouter: true,
      termsAccepted: true,
      profileComplete: true,
      createdAt: now,
    } as any)
    .onConflictDoUpdate({
      target: routers.userId,
      set: { homeCountry: "CA", homeRegionCode: "BC", homeCity: vancouver.city, status: "ACTIVE", isSeniorRouter: true, termsAccepted: true, profileComplete: true } as any,
    });

  const contractorUser = await db
    .insert(users)
    .values({
      id: crypto.randomUUID(),
      email: contractorEmail,
      role: "CONTRACTOR",
      status: "ACTIVE",
      country: "CA",
      phone: "+1 604 555 0100",
      createdAt: now,
      updatedAt: now,
    } as any)
    .onConflictDoUpdate({
      target: users.email,
      set: { role: "CONTRACTOR", status: "ACTIVE", country: "CA", phone: "+1 604 555 0100", updatedAt: now } as any,
    })
    .returning({ id: users.id });

  await db
    .insert(contractorAccounts)
    .values({
      userId: contractorUser[0]!.id,
      tradeCategory: "HANDYMAN",
      regionCode: "BC",
      country: "CA",
      city: vancouver.city,
      wizardCompleted: true,
      isApproved: true,
      isActive: true,
      createdAt: now,
    } as any)
    .onConflictDoUpdate({
      target: contractorAccounts.userId,
      set: { tradeCategory: "HANDYMAN", regionCode: "BC", country: "CA", city: vancouver.city, wizardCompleted: true, isApproved: true, isActive: true } as any,
    });

  const existingInventory = await db
    .select({ id: contractors.id })
    .from(contractors)
    .where(sql<boolean>`lower(${contractors.email}) = ${contractorEmail.toLowerCase()}`)
    .limit(1);
  const inventoryId = existingInventory[0]?.id ?? crypto.randomUUID();
  if (existingInventory[0]?.id) {
    await db
      .update(contractors)
      .set({
        status: "APPROVED",
        businessName: "E2E Contractor (BC)",
        email: contractorEmail,
        phone: "+1 604 555 0100",
        country: "CA",
        regionCode: "BC",
        trade: "CARPENTRY",
        tradeCategories: ["HANDYMAN"],
        categories: ["handyman"],
        regions: ["vancouver-bc"],
        lat: vancouver.lat,
        lng: vancouver.lng,
        automotiveEnabled: false,
        approvedAt: now,
      } as any)
      .where(eq(contractors.id, inventoryId));
  } else {
    await db.insert(contractors).values({
      id: inventoryId,
      status: "APPROVED",
      businessName: "E2E Contractor (BC)",
      email: contractorEmail,
      phone: "+1 604 555 0100",
      country: "CA",
      regionCode: "BC",
      trade: "CARPENTRY",
      tradeCategories: ["HANDYMAN"],
      categories: ["handyman"],
      regions: ["vancouver-bc"],
      lat: vancouver.lat,
      lng: vancouver.lng,
      automotiveEnabled: false,
      approvedAt: now,
      createdAt: now,
    } as any);
  }

  // Sanity readback: ensure router + contractor are within 150km-ish for Langley.
  const distKm = Math.round(
    Math.acos(
      Math.sin((langley.lat * Math.PI) / 180) * Math.sin((vancouver.lat * Math.PI) / 180) +
        Math.cos((langley.lat * Math.PI) / 180) *
          Math.cos((vancouver.lat * Math.PI) / 180) *
          Math.cos(((vancouver.lng - langley.lng) * Math.PI) / 180),
    ) * 6371,
  );

  console.log(
    JSON.stringify(
      {
        ok: true,
        posterEmail,
        posterUserId: poster[0]!.id,
        routerEmail,
        routerUserId: router[0]!.id,
        contractorEmail,
        contractorUserId: contractorUser[0]!.id,
        contractorId: inventoryId,
        approxDistanceKmLangleyToVancouver: distKm,
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

