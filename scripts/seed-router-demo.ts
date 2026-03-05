/**
 * Router Demo E2E — Seed Script
 * Seeds a demo router, contractor, and 3 DEMO jobs in Langley, BC.
 * Idempotent: safe to re-run. Uses deterministic IDs and upserts.
 *
 * Run: pnpm exec tsx scripts/seed-router-demo.ts
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { Client } from "pg";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, "..");
const API_ENV_PATH = path.join(REPO_ROOT, "apps/api/.env.local");

dotenv.config({ path: API_ENV_PATH });

function ensureDatabaseUrl(): string {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  if (!fs.existsSync(API_ENV_PATH)) throw new Error("DATABASE_URL not set and apps/api/.env.local not found");
  const txt = fs.readFileSync(API_ENV_PATH, "utf8");
  const m = txt.match(/^DATABASE_URL\s*=\s*(.+)$/m);
  if (!m) throw new Error("DATABASE_URL missing in apps/api/.env.local");
  process.env.DATABASE_URL = m[1].trim();
  return process.env.DATABASE_URL;
}

function getSchema(dbUrl: string): string | null {
  try {
    const u = new URL(dbUrl);
    return u.searchParams.get("schema")?.trim() || null;
  } catch {
    return null;
  }
}

const ROUTER_USER_ID = "demo-router-ca-bc-001";
const CONTRACTOR_USER_ID = "demo-contractor-ca-bc-001";
const JOB_IDS = {
  fence: "demo-job-fence-001",
  couch: "demo-job-couch-001",
  cabinet: "demo-job-cabinet-001",
};
const BATCH = "DEMO_ROUTER_E2E";

async function main() {
  if (process.env.NODE_ENV === "production") {
    throw new Error("Refusing to run seed script in production");
  }

  const url = ensureDatabaseUrl();
  const client = new Client({ connectionString: url });
  await client.connect();

  const schema = getSchema(url);
  if (schema) {
    await client.query(`set search_path to "${schema}", public`);
  }

  const routerEmail = "demo.router@8fold.local";
  const contractorEmail = "demo.contractor@8fold.local";

  // ── Router User ──
  await client.query(
    `INSERT INTO "User" (id, "clerkUserId", email, role, status, country, "createdAt", "updatedAt")
     VALUES ($1, $2, $3, 'ROUTER', 'ACTIVE', 'CA', NOW(), NOW())
     ON CONFLICT (id) DO UPDATE SET status = 'ACTIVE', country = 'CA', "updatedAt" = NOW()`,
    [ROUTER_USER_ID, `seed:demo:${routerEmail}`, routerEmail],
  );

  // ── Router Profile V4 ──
  const rpCheck = await client.query(
    `SELECT id FROM router_profiles_v4 WHERE user_id = $1 LIMIT 1`,
    [ROUTER_USER_ID],
  );
  if (rpCheck.rows.length > 0) {
    await client.query(
      `UPDATE router_profiles_v4
       SET home_country_code = 'CA', home_region_code = 'BC',
           home_latitude = 49.1044, home_longitude = -122.6604, updated_at = NOW()
       WHERE user_id = $1`,
      [ROUTER_USER_ID],
    );
  } else {
    await client.query(
      `INSERT INTO router_profiles_v4
       (id, user_id, contact_name, phone, home_region, home_country_code, home_region_code,
        service_areas, availability, home_latitude, home_longitude, created_at, updated_at)
       VALUES ($1, $2, 'Demo Router (BC)', '+1 604 555 0300', 'bc', 'CA', 'BC',
               '["langley-bc"]'::jsonb, '{}'::jsonb, 49.1044, -122.6604, NOW(), NOW())`,
      [crypto.randomUUID(), ROUTER_USER_ID],
    );
  }

  // ── Router (legacy table) ──
  await client.query(
    `INSERT INTO routers ("userId", "homeCountry", "homeRegionCode", "homeCity", status,
                          "dailyRouteLimit", "isSeniorRouter", "termsAccepted", "profileComplete", "createdAt")
     VALUES ($1, 'CA', 'BC', 'Langley', 'ACTIVE', 10, true, true, true, NOW())
     ON CONFLICT ("userId") DO UPDATE SET
       "homeCountry" = 'CA', "homeRegionCode" = 'BC', "homeCity" = 'Langley',
       status = 'ACTIVE', "isSeniorRouter" = true, "termsAccepted" = true, "profileComplete" = true`,
    [ROUTER_USER_ID],
  );

  // ── Contractor User ──
  await client.query(
    `INSERT INTO "User" (id, "clerkUserId", email, role, status, country, "stateCode", "createdAt", "updatedAt")
     VALUES ($1, $2, $3, 'CONTRACTOR', 'ACTIVE', 'CA', 'BC', NOW(), NOW())
     ON CONFLICT (id) DO UPDATE SET status = 'ACTIVE', country = 'CA', "stateCode" = 'BC', "updatedAt" = NOW()`,
    [CONTRACTOR_USER_ID, `seed:demo:${contractorEmail}`, contractorEmail],
  );

  // ── Contractor Profile V4 ──
  const cpCheck = await client.query(
    `SELECT id FROM contractor_profiles_v4 WHERE user_id = $1 LIMIT 1`,
    [CONTRACTOR_USER_ID],
  );
  if (cpCheck.rows.length > 0) {
    await client.query(
      `UPDATE contractor_profiles_v4
       SET country_code = 'CA', home_region_code = 'BC',
           trade_categories = '["HANDYMAN","MOVING"]'::jsonb,
           home_latitude = 49.1044, home_longitude = -122.6604,
           service_radius_km = 50, updated_at = NOW()
       WHERE user_id = $1`,
      [CONTRACTOR_USER_ID],
    );
  } else {
    await client.query(
      `INSERT INTO contractor_profiles_v4
       (id, user_id, contact_name, phone, business_name, country_code, home_region_code,
        city, trade_categories, service_radius_km, home_latitude, home_longitude, created_at, updated_at)
       VALUES ($1, $2, 'Demo Contractor (BC)', '+1 604 555 0400', 'Demo Langley Services',
               'CA', 'BC', 'Langley', '["HANDYMAN","MOVING"]'::jsonb, 50, 49.1044, -122.6604, NOW(), NOW())`,
      [crypto.randomUUID(), CONTRACTOR_USER_ID],
    );
  }

  // ── Contractor Account ──
  await client.query(
    `INSERT INTO contractor_accounts
     ("userId", "isActive", "wizardCompleted", "waiverAccepted", "waiverAcceptedAt",
      "tradeCategory", "serviceRadiusKm", country, "regionCode", city,
      "stripeAccountId", "payoutStatus", "isApproved", "createdAt")
     VALUES ($1, true, true, true, NOW(), 'HANDYMAN', 50, 'CA', 'BC', 'Langley',
             'acct_demo_contractor', 'ACTIVE', true, NOW())
     ON CONFLICT ("userId") DO UPDATE SET
       "isActive" = true, "wizardCompleted" = true, "waiverAccepted" = true,
       "tradeCategory" = 'HANDYMAN', "serviceRadiusKm" = 50,
       country = 'CA', "regionCode" = 'BC', city = 'Langley',
       "stripeAccountId" = 'acct_demo_contractor', "payoutStatus" = 'ACTIVE', "isApproved" = true`,
    [CONTRACTOR_USER_ID],
  );

  // ── Clear old DEMO jobs and insert fresh ──
  await client.query(`DELETE FROM jobs WHERE mock_seed_batch = $1`, [BATCH]);

  const demoJobs = [
    {
      id: JOB_IDS.fence,
      title: "DEMO: Langley Fence Repair (2 panels)",
      scope: "Replace 2 damaged cedar fence panels (6ft). Customer supplies materials. Bring standard tools.",
      trade_category: "HANDYMAN",
      is_regional: false,
      job_type: "urban",
      lat: 49.1044,
      lng: -122.6604,
    },
    {
      id: JOB_IDS.couch,
      title: "DEMO: Langley Couch Move",
      scope: "Move sectional couch from 2nd floor to ground-level suite. Two-person job, ~45 min.",
      trade_category: "MOVING",
      is_regional: false,
      job_type: "urban",
      lat: 49.1055,
      lng: -122.659,
    },
    {
      id: JOB_IDS.cabinet,
      title: "DEMO: Langley Cabinet Mount",
      scope: "Wall-mount 3 IKEA upper cabinets in kitchen. Verify studs, level, and secure to wall.",
      trade_category: "HANDYMAN",
      is_regional: true,
      job_type: "regional",
      lat: 49.1032,
      lng: -122.6621,
    },
  ];

  for (const j of demoJobs) {
    await client.query(
      `INSERT INTO jobs
       (id, status, routing_status, archived, cancel_request_pending,
        title, scope, region, country, country_code, state_code, region_code, city,
        currency, payment_currency, trade_category, service_type, job_type, is_regional,
        lat, lng, is_mock, mock_seed_batch, job_source,
        labor_total_cents, amount_cents, total_amount_cents,
        contractor_payout_cents, router_earnings_cents, broker_fee_cents,
        posted_at, published_at, created_at, updated_at)
       VALUES
       ($1, 'OPEN_FOR_ROUTING', 'UNROUTED', false, false,
        $2, $3, 'langley-bc', 'CA', 'CA', 'BC', 'BC', 'Langley',
        'CAD', 'cad', $4, 'handyman', $5, $6,
        $7, $8, false, $9, 'MOCK',
        25000, 35000, 35000, 25000, 4500, 5500,
        NOW(), NOW(), NOW(), NOW())`,
      [j.id, j.title, j.scope, j.trade_category, j.job_type, j.is_regional, j.lat, j.lng, BATCH],
    );
  }

  await client.end();

  console.log(
    JSON.stringify(
      {
        ok: true,
        batch: BATCH,
        routerUserId: ROUTER_USER_ID,
        routerEmail,
        contractorUserId: CONTRACTOR_USER_ID,
        contractorEmail,
        jobs: demoJobs.map((j) => ({ id: j.id, title: j.title, trade: j.trade_category, regional: j.is_regional })),
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
