import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { sql } from "drizzle-orm";
import { db } from "@/server/db/drizzle";

// Env isolation: load from apps/api/.env.local only (no repo-root fallback).
const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(SCRIPT_DIR, "..", ".env.local") });

type Counts = {
  usersSeen: number;
  jobPostersCreated: number;
  jobPostersSkipped: number;
  routersCreated: number;
  routersSkipped: number;
  contractorAccountsCreated: number;
  contractorAccountsSkipped: number;
  errors: number;
};

type CountryCode = "US" | "CA";
type UserRole = "USER" | "ADMIN" | "CUSTOMER" | "CONTRACTOR" | "ROUTER" | "JOB_POSTER";
type TradeCategory = string;

function slugCity(city: string): string {
  return city
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function toDefaultRegionFromProfileCityState(opts: { city?: string | null; stateProvince?: string | null }): string | null {
  const city = (opts.city ?? "").trim();
  const state = (opts.stateProvince ?? "").trim();
  if (!city || !state) return null;
  return `${slugCity(city)}-${state.toLowerCase()}`;
}

function defaultRegionCodeForCountry(country: CountryCode): string {
  return country === "CA" ? "BC" : "TX";
}

function tradeCategoryFromInventory(arr: unknown): TradeCategory | null {
  if (!Array.isArray(arr)) return null;
  const first = arr[0];
  if (typeof first !== "string" || !first) return null;
  return first as TradeCategory;
}

async function main() {
  const counts: Counts = {
    usersSeen: 0,
    jobPostersCreated: 0,
    jobPostersSkipped: 0,
    routersCreated: 0,
    routersSkipped: 0,
    contractorAccountsCreated: 0,
    contractorAccountsSkipped: 0,
    errors: 0
  };

  const now = new Date();

  try {
    let cursor: string | null = null;
    const take = 250;

    // Iterate users in stable order for deterministic runs.
    // Safe to re-run: we only create rows when missing.
    // No deletes, no updates to existing extension rows.
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const where = cursor ? sql`where u."id" > ${cursor}` : sql``;
      const res = await db.execute(sql`
        select
          u."id",
          u."role",
          u."country",
          u."email",
          u."phone",
          jp."userId" as "jobPosterUserId",
          r."userId" as "routerUserId",
          ca."userId" as "contractorAccountUserId",
          jpp."city" as "jobPosterCity",
          jpp."stateProvince" as "jobPosterStateProvince",
          rp."state" as "routerState"
        from "User" u
        left join "job_posters" jp on jp."userId" = u."id"
        left join "routers" r on r."userId" = u."id"
        left join "contractor_accounts" ca on ca."userId" = u."id"
        left join "job_poster_profiles" jpp on jpp."userId" = u."id"
        left join "router_profiles" rp on rp."userId" = u."id"
        ${where}
        order by u."id" asc
        limit ${take}
      `);
      const users: Array<{
        id: string;
        role: UserRole;
        country: CountryCode;
        email: string | null;
        phone: string | null;
        jobPosterUserId: string | null;
        routerUserId: string | null;
        contractorAccountUserId: string | null;
        jobPosterCity: string | null;
        jobPosterStateProvince: string | null;
        routerState: string | null;
      }> = res.rows as any;

      if (users.length === 0) break;

      for (const u of users) {
        counts.usersSeen += 1;
        try {
          const role = u.role as UserRole;

          if (role === "JOB_POSTER") {
            if (u.jobPosterUserId) {
              counts.jobPostersSkipped += 1;
              console.log(`[skip] job_posters userId=${u.id} (already exists)`);
            } else {
              const defaultRegion = toDefaultRegionFromProfileCityState({
                city: u.jobPosterCity,
                stateProvince: u.jobPosterStateProvince
              });
              await db.execute(sql`
                insert into "job_posters" ("userId", "defaultRegion", "totalJobsPosted", "createdAt")
                values (${u.id}, ${defaultRegion ?? null}, ${0}, ${now})
              `);
              counts.jobPostersCreated += 1;
              console.log(`[create] job_posters userId=${u.id} defaultRegion=${defaultRegion ?? "null"}`);
            }
          } else if (role === "ROUTER") {
            if (u.routerUserId) {
              counts.routersSkipped += 1;
              console.log(`[skip] routers userId=${u.id} (already exists)`);
            } else {
              const profileState = (u.routerState ?? "").trim().toUpperCase();
              const homeRegionCode = profileState && profileState.length === 2 ? profileState : defaultRegionCodeForCountry(u.country);

              await db.execute(sql`
                insert into "routers" (
                  "userId",
                  "homeCountry",
                  "homeRegionCode",
                  "homeCity",
                  "isSeniorRouter",
                  "dailyRouteLimit",
                  "routesCompleted",
                  "routesFailed",
                  "status",
                  "createdAt"
                )
                values (
                  ${u.id},
                  ${u.country},
                  ${homeRegionCode},
                  ${null},
                  ${false},
                  ${10},
                  ${0},
                  ${0},
                  ${"ACTIVE"},
                  ${now}
                )
              `);
              counts.routersCreated += 1;
              console.log(`[create] routers userId=${u.id} homeRegionCode=${homeRegionCode}`);
            }
          } else if (role === "CONTRACTOR") {
            if (u.contractorAccountUserId) {
              counts.contractorAccountsSkipped += 1;
              console.log(`[skip] contractor_accounts userId=${u.id} (already exists)`);
            } else {
              // Best-effort: try to map from inventory contractor by email/phone for regionCode/tradeCategory.
              const email = (u.email ?? "").trim();
              const phone = (u.phone ?? "").trim();
              const invWhere = email
                ? sql`where c."email" ilike ${email} limit 1`
                : phone
                  ? sql`where c."phone" like ${"%" + phone + "%"} limit 1`
                  : sql`limit 0`;
              const invRes = await db.execute(sql`
                select c."country", c."regionCode", c."tradeCategories"
                from "Contractor" c
                ${invWhere}
              `);
              const inventory = (invRes.rows[0] ?? null) as
                | { country: CountryCode | null; regionCode: string | null; tradeCategories: unknown }
                | null;

              const country = (inventory?.country ?? u.country) as CountryCode;
              const regionCode = (inventory?.regionCode ?? defaultRegionCodeForCountry(country)).trim().toUpperCase();
              const tradeCategory = tradeCategoryFromInventory(inventory?.tradeCategories) ?? ("HANDYMAN" as TradeCategory);

              await db.execute(sql`
                insert into "contractor_accounts" (
                  "userId",
                  "tradeCategory",
                  "serviceRadiusKm",
                  "country",
                  "regionCode",
                  "city",
                  "isApproved",
                  "jobsCompleted",
                  "rating",
                  "createdAt"
                )
                values (
                  ${u.id},
                  ${String(tradeCategory)},
                  ${25},
                  ${country},
                  ${regionCode},
                  ${null},
                  ${false},
                  ${0},
                  ${null},
                  ${now}
                )
              `);
              counts.contractorAccountsCreated += 1;
              console.log(
                `[create] contractor_accounts userId=${u.id} tradeCategory=${tradeCategory} regionCode=${regionCode}`
              );
            }
          } else if (role === "ADMIN") {
            // Admins do not get role-extension rows.
          }
        } catch (err) {
          counts.errors += 1;
          console.error(`[error] userId=${u.id}`, err);
        }
      }

      cursor = users[users.length - 1]?.id ?? null;
      if (!cursor) break;
    }
  } finally {
  }

  console.log("\n=== Backfill summary ===");
  console.log(JSON.stringify(counts, null, 2));
  if (counts.errors > 0) {
    process.exitCode = 1;
  }
}

void main();

