#!/usr/bin/env tsx
/**
 * Runs the SEO Admin migration (seo_settings columns + seo_templates table).
 * Uses DATABASE_URL from apps/api/.env.local.
 *
 * Usage: pnpm -C apps/api exec tsx scripts/run-seo-admin-migration.ts
 *    or: DOTENV_CONFIG_PATH=apps/api/.env.local pnpm exec tsx apps/api/scripts/run-seo-admin-migration.ts
 */
import { Client } from "pg";
import * as fs from "fs";
import * as path from "path";
import dotenv from "dotenv";

function loadEnv() {
  if (process.env.DATABASE_URL) return;
  // Try .env.local (when cwd is apps/api) or apps/api/.env.local (when cwd is repo root)
  const candidates = [
    path.join(process.cwd(), ".env.local"),
    path.join(process.cwd(), "apps/api/.env.local"),
  ];
  const envPath = candidates.find((p) => fs.existsSync(p));
  if (!envPath) throw new Error("DATABASE_URL not set and .env.local not found");
  dotenv.config({ path: envPath });
}

async function main() {
  loadEnv();
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL required");

  // Sanity check: host "base" usually means a misparsed or placeholder URL
  try {
    const u = new URL(url.replace(/^postgres:/, "postgresql:"));
    if (u.hostname === "base") {
      console.error("Invalid DATABASE_URL: host is 'base'. Check for typos or unexpanded variables in apps/api/.env.local");
      process.exit(1);
    }
  } catch {
    // URL parse failed; let pg try anyway
  }

  const client = new Client({ connectionString: url });
  await client.connect();

  try {
    console.log("Running SEO Admin migration...");

    await client.query(`
      ALTER TABLE seo_settings
        ADD COLUMN IF NOT EXISTS enable_google_indexing BOOLEAN DEFAULT true,
        ADD COLUMN IF NOT EXISTS enable_index_now BOOLEAN DEFAULT true,
        ADD COLUMN IF NOT EXISTS auto_index_new_jobs BOOLEAN DEFAULT true;
    `);
    console.log("  ✓ seo_settings columns added");

    await client.query(`
      CREATE TABLE IF NOT EXISTS seo_templates (
        id TEXT PRIMARY KEY DEFAULT (gen_random_uuid())::text,
        template_key TEXT NOT NULL UNIQUE,
        title_template TEXT NOT NULL,
        description_template TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `);
    console.log("  ✓ seo_templates table created");

    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS seo_templates_template_key_uq ON seo_templates (template_key);
    `);

    await client.query(`
      INSERT INTO seo_templates (template_key, title_template, description_template)
      VALUES
        ('job_page', '{job_title} in {city}, {region} | 8Fold', 'Find trusted {trade} professionals in {city}. Post your job on 8Fold and connect with local contractors today.'),
        ('contractor_profile', '{contractor_name} — {trade} Contractor | 8Fold', '{contractor_name} is a verified {trade} contractor available on 8Fold.'),
        ('location_page', 'Local {trade} in {city}, {region} | 8Fold', 'Find trusted {trade} professionals in {city}. Post your job on 8Fold and connect with local contractors today.'),
        ('service_page', '{trade} Services | Hire Local Contractors | 8Fold', 'Find trusted {trade} professionals near you. Connect with skilled local trades through 8Fold.')
      ON CONFLICT (template_key) DO NOTHING;
    `);
    console.log("  ✓ Templates seeded");

    console.log("\nSEO Admin migration complete.");
  } finally {
    await client.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
