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

  async function ensureUser(email: string, role: "JOB_POSTER" | "CONTRACTOR" | "ROUTER", extra: Record<string, unknown>) {
    const existing = await db.select({ id: users.id, role: users.role }).from(users).where(eq(users.email, email)).limit(1);
    const id = existing[0]?.id ?? null;
    if (id) {
      const currentRole = String(existing[0]?.role ?? "").toUpperCase();
      if (currentRole !== role) throw new Error(`ROLE_IMMUTABLE: existing role=${currentRole} attempted=${role} for ${email}`);
      await db.update(users).set({ ...extra, status: "ACTIVE", updatedAt: now } as any).where(eq(users.id, id));
      return id;
    }
    const newId = crypto.randomUUID();
    await db.insert(users).values({
      id: newId,
      clerkUserId: `seed:e2e:${email.toLowerCase()}`,
      email,
      role,
      status: "ACTIVE",
      createdAt: now,
      updatedAt: now,
      ...extra,
    } as any);
    return newId;
  }

  const posterUserId = await ensureUser(posterEmail, "JOB_POSTER", {
    country: "CA",
    name: "E2E Poster (BC)",
    phone: "+1 604 555 0200",
  });

  await db
    .insert(jobPosterProfiles)
    .values({
      id: crypto.randomUUID(),
      userId: posterUserId,
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

  const routerUserId = await ensureUser(routerEmail, "ROUTER", { country: "CA" });

  await db
    .insert(routerProfiles)
    .values({
      id: crypto.randomUUID(),
      userId: routerUserId,
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
      userId: routerUserId,
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

  const contractorUserId = await ensureUser(contractorEmail, "CONTRACTOR", { country: "CA", phone: "+1 604 555 0100" });

  await db
    .insert(contractorAccounts)
    .values({
      userId: contractorUserId,
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
        posterUserId,
        routerEmail,
        routerUserId,
        contractorEmail,
        contractorUserId,
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

