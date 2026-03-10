/**
 * SEO tables migration — production-safe, idempotent.
 *
 * Creates:
 *  1. seo_settings table (single-row configuration)
 *  2. seo_index_queue table (IndexNow submission queue)
 *  3. Partial unique index on seo_index_queue to prevent duplicate entries
 *
 * Run:
 *   pnpm -C apps/api exec tsx scripts/migrate-seo-tables.ts
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(SCRIPT_DIR, "..", ".env.local") });

import { Client } from "pg";

function mustEnv(name: string): string {
  const v = String(process.env[name] ?? "").trim();
  if (!v) throw new Error(`[migrate-seo-tables] ${name} is not set`);
  return v;
}

async function main() {
  const DATABASE_URL = mustEnv("DATABASE_URL");
  const client = new Client({ connectionString: DATABASE_URL });
  await client.connect();
  console.log("[migrate-seo-tables] Connected ✓");

  // 1. seo_settings — single row, admin-controlled SEO configuration
  await client.query(`
    CREATE TABLE IF NOT EXISTS seo_settings (
      id             TEXT PRIMARY KEY DEFAULT (gen_random_uuid())::text,
      meta_pixel_id  TEXT,
      ga4_measurement_id TEXT,
      index_now_key  TEXT,
      canonical_domain TEXT,
      robots_txt     TEXT,
      og_image       TEXT,
      twitter_card_image TEXT,
      updated_at     TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
      updated_by     TEXT
    )
  `);
  console.log("[migrate-seo-tables] seo_settings table created ✓");

  // 2. seo_index_queue — IndexNow submission queue processed by Vercel Cron
  await client.query(`
    CREATE TABLE IF NOT EXISTS seo_index_queue (
      id           TEXT PRIMARY KEY DEFAULT (gen_random_uuid())::text,
      url          TEXT NOT NULL,
      action       TEXT NOT NULL CHECK (action IN ('CREATE', 'UPDATE', 'DELETE')),
      created_at   TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
      processed_at TIMESTAMP WITH TIME ZONE
    )
  `);
  console.log("[migrate-seo-tables] seo_index_queue table created ✓");

  // 3. Partial unique index — prevents duplicate (url, action) entries while unprocessed.
  //    This stops repeated JOB_UPDATED events from flooding the queue.
  await client.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS seo_index_queue_url_action_unprocessed
      ON seo_index_queue (url, action)
      WHERE processed_at IS NULL
  `);
  console.log("[migrate-seo-tables] Partial unique index on seo_index_queue created ✓");

  // 4. Indexes for efficient queue processing
  await client.query(`
    CREATE INDEX IF NOT EXISTS seo_index_queue_url_idx ON seo_index_queue (url)
  `);
  await client.query(`
    CREATE INDEX IF NOT EXISTS seo_index_queue_processed_at_idx ON seo_index_queue (processed_at)
  `);
  await client.query(`
    CREATE INDEX IF NOT EXISTS seo_settings_updated_at_idx ON seo_settings (updated_at)
  `);
  console.log("[migrate-seo-tables] Indexes created ✓");

  // 5. Social profile URL columns (for JSON-LD sameAs + footer icons)
  await client.query(`
    ALTER TABLE seo_settings ADD COLUMN IF NOT EXISTS facebook_url TEXT
  `);
  await client.query(`
    ALTER TABLE seo_settings ADD COLUMN IF NOT EXISTS twitter_url TEXT
  `);
  await client.query(`
    ALTER TABLE seo_settings ADD COLUMN IF NOT EXISTS linkedin_url TEXT
  `);
  console.log("[migrate-seo-tables] Social URL columns added ✓");

  await client.end();

  console.log("\n[migrate-seo-tables] Migration complete.");
  console.log("  Next steps:");
  console.log("  1. Verify apps/api/db/schema/seoSettings.ts and seoIndexQueue.ts are exported");
  console.log("  2. Deploy API");
}

main().catch((err) => {
  console.error("[migrate-seo-tables] FATAL:", err);
  process.exit(1);
});
