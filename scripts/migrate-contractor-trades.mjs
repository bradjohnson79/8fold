/**
 * Backfill existing contractors into v4_contractor_trade_skills.
 *
 * For each contractor_profiles_v4 row that has trade_categories set:
 *   - Normalizes trade_categories to canonical UPPER(TRIM()) values
 *   - Inserts a v4_contractor_trade_skills record per trade (years_experience=3, approved=true)
 *   - Skips trades that already exist (ON CONFLICT DO NOTHING)
 *   - Skips trade values that don't match the TradeCategory enum
 *
 * Run:
 *   DATABASE_URL=<url> node scripts/migrate-contractor-trades.mjs
 *   or:
 *   DRY_RUN=true DATABASE_URL=<url> node scripts/migrate-contractor-trades.mjs
 */

import { createRequire } from "module";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Load API env
dotenv.config({ path: path.join(__dirname, "..", "apps", "api", ".env.local") });

const require = createRequire(import.meta.url);
const { Client } = require("pg");

const DRY_RUN = String(process.env.DRY_RUN ?? "").toLowerCase() === "true";

const DATABASE_URL = process.env.DATABASE_URL?.trim();
if (!DATABASE_URL) {
  console.error("[migrate-contractor-trades] ERROR: DATABASE_URL is not set");
  process.exit(1);
}

const VALID_ENUM = new Set([
  "PLUMBING", "ELECTRICAL", "HVAC", "APPLIANCE", "HANDYMAN", "PAINTING",
  "CARPENTRY", "DRYWALL", "ROOFING", "JANITORIAL_CLEANING", "LANDSCAPING",
  "FENCING", "SNOW_REMOVAL", "JUNK_REMOVAL", "MOVING", "AUTOMOTIVE",
  "FURNITURE_ASSEMBLY", "WELDING", "JACK_OF_ALL_TRADES",
]);

function schemaFromDatabaseUrl(url) {
  try {
    const u = new URL(url);
    const s = u.searchParams.get("schema");
    return s && /^[a-zA-Z0-9_]+$/.test(s) ? s : "public";
  } catch {
    return "public";
  }
}

function q(schema, table) {
  return `"${schema}"."${table}"`;
}

function randomId() {
  return crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2) + Date.now().toString(36);
}

async function main() {
  const schema = schemaFromDatabaseUrl(DATABASE_URL);
  const profilesT = q(schema, "contractor_profiles_v4");
  const skillsT = q(schema, "v4_contractor_trade_skills");

  const client = new Client({ connectionString: DATABASE_URL });
  await client.connect();
  console.log(`[migrate] Connected — schema: ${schema} | DRY_RUN: ${DRY_RUN}`);

  // Step 1: Normalize trade_categories to canonical UPPER(TRIM()) deduped values
  console.log("[migrate] Step 1: Normalizing trade_categories to canonical uppercase...");
  if (!DRY_RUN) {
    await client.query(`
      UPDATE ${profilesT}
      SET trade_categories = (
        SELECT jsonb_agg(DISTINCT upper(trim(x::text)))
        FROM jsonb_array_elements_text(trade_categories) AS x
      )
      WHERE trade_categories IS NOT NULL
        AND jsonb_array_length(trade_categories) > 0
    `);
    console.log("[migrate] trade_categories normalized.");
  } else {
    console.log("[migrate] [DRY_RUN] Skipping normalization update.");
  }

  // Step 2: Load all contractor profiles with trade categories
  const { rows: profiles } = await client.query(`
    SELECT user_id, trade_categories
    FROM ${profilesT}
    WHERE trade_categories IS NOT NULL
      AND jsonb_array_length(trade_categories) > 0
  `);

  console.log(`[migrate] Found ${profiles.length} contractor profiles with trade categories.`);

  let inserted = 0;
  let skippedInvalid = 0;
  let skippedExisting = 0;

  for (const profile of profiles) {
    const userId = profile.user_id;
    let categories = [];
    try {
      categories = typeof profile.trade_categories === "string"
        ? JSON.parse(profile.trade_categories)
        : profile.trade_categories;
    } catch {
      console.warn(`[migrate] Could not parse trade_categories for user ${userId}`);
      continue;
    }
    if (!Array.isArray(categories)) continue;

    for (const raw of categories) {
      const tradeCategory = String(raw ?? "").trim().toUpperCase();
      if (!VALID_ENUM.has(tradeCategory)) {
        console.warn(`[migrate] Skipping invalid trade "${tradeCategory}" for user ${userId}`);
        skippedInvalid++;
        continue;
      }

      if (!DRY_RUN) {
        const result = await client.query(
          `INSERT INTO ${skillsT}
             (id, contractor_user_id, trade_category, years_experience, approved, created_at, updated_at)
           VALUES ($1, $2, $3::\"TradeCategory\", 3, true, NOW(), NOW())
           ON CONFLICT (contractor_user_id, trade_category) DO NOTHING`,
          [randomId(), userId, tradeCategory],
        );
        if (result.rowCount > 0) {
          inserted++;
        } else {
          skippedExisting++;
        }
      } else {
        console.log(`[migrate] [DRY_RUN] Would insert trade=${tradeCategory} for user=${userId}`);
        inserted++;
      }
    }
  }

  await client.end();

  console.log(`\n[migrate] Done.`);
  console.log(`  Inserted:         ${inserted}`);
  console.log(`  Skipped (exists): ${skippedExisting}`);
  console.log(`  Skipped (invalid enum): ${skippedInvalid}`);
  if (DRY_RUN) {
    console.log(`  (DRY_RUN mode — no changes written to database)`);
  }
}

main().catch((err) => {
  console.error("[migrate-contractor-trades] FATAL:", err);
  process.exit(1);
});
