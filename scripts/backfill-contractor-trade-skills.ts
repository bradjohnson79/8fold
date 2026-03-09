/**
 * Backfill existing contractors into v4_contractor_trade_skills.
 *
 * For each contractor_profiles_v4 row that has trade_categories set:
 *   - Inserts a v4_contractor_trade_skills record per trade
 *     (years_experience=3, approved=true — preserves existing contractor eligibility)
 *   - Skips trades that already exist (ON CONFLICT DO NOTHING)
 *   - Filters to valid canonical trade values
 *
 * Safe to run multiple times.
 *
 * Run (from repo root):
 *   DATABASE_URL=<url> npx tsx scripts/backfill-contractor-trade-skills.ts
 *   or dry-run:
 *   DRY_RUN=true DATABASE_URL=<url> npx tsx scripts/backfill-contractor-trade-skills.ts
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import dotenv from "dotenv";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(SCRIPT_DIR, "..", "apps", "api", ".env.local") });

import { Client } from "pg";

const DRY_RUN = String(process.env.DRY_RUN ?? "").toLowerCase() === "true";

const DATABASE_URL = (process.env.DATABASE_URL ?? "").trim();
if (!DATABASE_URL) {
  console.error("[backfill] ERROR: DATABASE_URL is not set");
  process.exit(1);
}

const VALID_TRADES = new Set([
  "PLUMBING", "ELECTRICAL", "HVAC", "APPLIANCE", "HANDYMAN", "PAINTING",
  "CARPENTRY", "DRYWALL", "ROOFING", "JANITORIAL_CLEANING", "LANDSCAPING",
  "FENCING", "SNOW_REMOVAL", "JUNK_REMOVAL", "MOVING", "AUTOMOTIVE",
  "FURNITURE_ASSEMBLY", "WELDING", "JACK_OF_ALL_TRADES",
]);

function schemaFromDatabaseUrl(url: string): string {
  try {
    const u = new URL(url);
    const s = u.searchParams.get("schema");
    return s && /^[a-zA-Z0-9_]+$/.test(s) ? s : "public";
  } catch {
    return "public";
  }
}

async function main() {
  const schema = schemaFromDatabaseUrl(DATABASE_URL);
  const q = (t: string) => `"${schema}"."${t}"`;

  const client = new Client({ connectionString: DATABASE_URL });
  await client.connect();
  console.log(`[backfill] Connected — schema: ${schema} | DRY_RUN: ${DRY_RUN}`);

  // Verify the target table exists before proceeding
  const tableCheck = await client.query<{ exists: boolean }>(`
    SELECT EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = $1 AND table_name = 'v4_contractor_trade_skills'
    ) AS exists
  `, [schema]);

  if (!tableCheck.rows[0]?.exists) {
    console.error("[backfill] FATAL: v4_contractor_trade_skills does not exist.");
    console.error("  Run apply-contractor-trade-schema.ts first.");
    await client.end();
    process.exit(1);
  }

  // Load all contractor profiles with trade_categories
  const { rows: profiles } = await client.query<{
    user_id: string;
    trade_categories: unknown;
  }>(`
    SELECT user_id, trade_categories
    FROM ${q("contractor_profiles_v4")}
    WHERE trade_categories IS NOT NULL
      AND jsonb_array_length(trade_categories) > 0
  `);

  console.log(`[backfill] Found ${profiles.length} contractor profiles with trade_categories.`);

  let inserted = 0;
  let skippedExisting = 0;
  let skippedInvalid = 0;

  for (const profile of profiles) {
    const userId = profile.user_id;
    let categories: string[] = [];

    try {
      const raw = typeof profile.trade_categories === "string"
        ? JSON.parse(profile.trade_categories)
        : profile.trade_categories;
      categories = Array.isArray(raw) ? raw.map(String) : [];
    } catch {
      console.warn(`[backfill] Could not parse trade_categories for user ${userId}`);
      continue;
    }

    for (const rawTrade of categories) {
      const tradeCategory = rawTrade.trim().toUpperCase();

      if (!VALID_TRADES.has(tradeCategory)) {
        console.warn(`[backfill] Skipping unknown trade "${tradeCategory}" for user ${userId}`);
        skippedInvalid++;
        continue;
      }

      if (DRY_RUN) {
        console.log(`[backfill] [DRY] would insert trade=${tradeCategory} for user=${userId}`);
        inserted++;
        continue;
      }

      const result = await client.query(
        `INSERT INTO ${q("v4_contractor_trade_skills")}
           (id, contractor_user_id, trade_category, years_experience, approved, created_at, updated_at)
         VALUES ($1, $2, $3, 3, true, NOW(), NOW())
         ON CONFLICT (contractor_user_id, trade_category) DO NOTHING`,
        [randomUUID(), userId, tradeCategory],
      );

      if ((result.rowCount ?? 0) > 0) {
        inserted++;
      } else {
        skippedExisting++;
      }
    }
  }

  await client.end();

  console.log("\n[backfill] Complete.");
  console.log(`  Inserted:              ${inserted}`);
  console.log(`  Skipped (conflict):    ${skippedExisting}`);
  console.log(`  Skipped (bad enum):    ${skippedInvalid}`);
  if (DRY_RUN) {
    console.log("  (DRY_RUN — no DB writes performed)");
  }
}

main().catch((err) => {
  console.error("[backfill] FATAL:", err);
  process.exit(1);
});
