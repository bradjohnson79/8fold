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

  // 5. All full-schema columns — idempotent ADD COLUMN IF NOT EXISTS.
  //    Covers columns added after the initial CREATE TABLE, including
  //    page-level metadata, OG fields, JSONB blobs, and social URLs.
  await client.query(`
    ALTER TABLE seo_settings
      ADD COLUMN IF NOT EXISTS site_title             TEXT,
      ADD COLUMN IF NOT EXISTS site_description       TEXT,
      ADD COLUMN IF NOT EXISTS default_meta_title     TEXT,
      ADD COLUMN IF NOT EXISTS default_meta_description TEXT,
      ADD COLUMN IF NOT EXISTS og_title               TEXT,
      ADD COLUMN IF NOT EXISTS og_description         TEXT,
      ADD COLUMN IF NOT EXISTS og_image               TEXT,
      ADD COLUMN IF NOT EXISTS twitter_card_image     TEXT,
      ADD COLUMN IF NOT EXISTS canonical_domain       TEXT,
      ADD COLUMN IF NOT EXISTS robots_txt             TEXT,
      ADD COLUMN IF NOT EXISTS page_templates         JSONB,
      ADD COLUMN IF NOT EXISTS distribution_config    JSONB,
      ADD COLUMN IF NOT EXISTS tracking_events        JSONB,
      ADD COLUMN IF NOT EXISTS ga4_measurement_id     TEXT,
      ADD COLUMN IF NOT EXISTS meta_pixel_id          TEXT,
      ADD COLUMN IF NOT EXISTS index_now_key          TEXT,
      ADD COLUMN IF NOT EXISTS facebook_url           TEXT,
      ADD COLUMN IF NOT EXISTS twitter_url            TEXT,
      ADD COLUMN IF NOT EXISTS linkedin_url           TEXT,
      ADD COLUMN IF NOT EXISTS updated_by             TEXT
  `);
  console.log("[migrate-seo-tables] All SEO settings columns ensured ✓");

  // 6. Ensure updated_at has correct type and default (may differ on older installs)
  await client.query(`
    ALTER TABLE seo_settings
      ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
  `);
  console.log("[migrate-seo-tables] updated_at column ensured ✓");

  // 7. seo_sitemap_type enum — required for seo_sitemap_cache table.
  //    Postgres has no CREATE TYPE IF NOT EXISTS, so guard via DO block.
  await client.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_type WHERE typname = 'seo_sitemap_type'
      ) THEN
        CREATE TYPE seo_sitemap_type AS ENUM (
          'index', 'jobs', 'services', 'contractors', 'cities', 'service-locations'
        );
      END IF;
    END
    $$
  `);
  console.log("[migrate-seo-tables] seo_sitemap_type enum ensured ✓");

  // 8. seo_sitemap_cache — stores generated XML per sitemap type (1-hour TTL).
  //    A unique index on sitemap_type enforces the one-row-per-type pattern.
  await client.query(`
    CREATE TABLE IF NOT EXISTS seo_sitemap_cache (
      id           TEXT PRIMARY KEY,
      sitemap_type seo_sitemap_type NOT NULL,
      xml_content  TEXT NOT NULL,
      url_count    INTEGER NOT NULL DEFAULT 0,
      generated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
    )
  `);
  await client.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS seo_sitemap_cache_type_uq
      ON seo_sitemap_cache (sitemap_type)
  `);
  console.log("[migrate-seo-tables] seo_sitemap_cache table + index created ✓");

  // 9. seo_indexing_log — audit trail for IndexNow / Google ping submissions.
  await client.query(`
    CREATE TABLE IF NOT EXISTS seo_indexing_log (
      id             TEXT PRIMARY KEY,
      url            TEXT NOT NULL,
      engine         TEXT NOT NULL,
      status         TEXT NOT NULL,
      response_code  INTEGER,
      error_message  TEXT,
      triggered_by   TEXT,
      created_at     TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
    )
  `);
  await client.query(`
    CREATE INDEX IF NOT EXISTS seo_indexing_log_engine_created_idx
      ON seo_indexing_log (engine, created_at)
  `);
  await client.query(`
    CREATE INDEX IF NOT EXISTS seo_indexing_log_status_created_idx
      ON seo_indexing_log (status, created_at)
  `);
  await client.query(`
    CREATE INDEX IF NOT EXISTS seo_indexing_log_created_idx
      ON seo_indexing_log (created_at)
  `);
  console.log("[migrate-seo-tables] seo_indexing_log table + indexes created ✓");

  // 10. seo_page_generation_queue — admin-driven content generation queue.
  await client.query(`
    CREATE TABLE IF NOT EXISTS seo_page_generation_queue (
      id                TEXT PRIMARY KEY,
      city              TEXT NOT NULL,
      service           TEXT NOT NULL,
      slug              TEXT NOT NULL,
      template_type     TEXT NOT NULL,
      status            TEXT NOT NULL DEFAULT 'pending',
      preview_data      JSONB,
      generated_content JSONB,
      requested_by      TEXT,
      created_at        TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
      processed_at      TIMESTAMP WITH TIME ZONE
    )
  `);
  await client.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS seo_page_unique_slug
      ON seo_page_generation_queue (slug)
  `);
  console.log("[migrate-seo-tables] seo_page_generation_queue table created ✓");

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
