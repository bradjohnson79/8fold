/**
 * Production-safe migration: v4_notification_templates + v4_notification_delivery_logs.
 *
 * Idempotent — uses CREATE TABLE IF NOT EXISTS and CREATE INDEX IF NOT EXISTS.
 *
 * Run:
 *   pnpm -C apps/api exec tsx scripts/apply-notification-template-schema.ts
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(SCRIPT_DIR, "..", ".env.local") });

import { Client } from "pg";

function mustEnv(name: string): string {
  const v = String(process.env[name] ?? "").trim();
  if (!v) throw new Error(`[apply-notification-template-schema] ${name} is not set`);
  return v;
}

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
  const DATABASE_URL = mustEnv("DATABASE_URL");
  const schema = schemaFromDatabaseUrl(DATABASE_URL);
  const q = (t: string) => `"${schema}"."${t}"`;

  const client = new Client({ connectionString: DATABASE_URL });
  await client.connect();
  console.log(`[migration] Connected — schema: ${schema}`);

  // ── 1. v4_notification_templates ───────────────────────────────────────────
  await client.query(`
    CREATE TABLE IF NOT EXISTS ${q("v4_notification_templates")} (
      id                  TEXT PRIMARY KEY,
      notification_type   TEXT NOT NULL,
      category            TEXT NOT NULL DEFAULT 'System',
      email_subject       TEXT,
      email_template      TEXT,
      in_app_template     TEXT,
      enabled_email       BOOLEAN NOT NULL DEFAULT TRUE,
      enabled_in_app      BOOLEAN NOT NULL DEFAULT TRUE,
      supports_email      BOOLEAN NOT NULL DEFAULT TRUE,
      supports_in_app     BOOLEAN NOT NULL DEFAULT TRUE,
      variables           JSONB,
      updated_at          TIMESTAMPTZ,
      updated_by          TEXT
    )
  `);
  console.log("[migration] v4_notification_templates: table ensured ✓");

  await client.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS v4_notification_templates_type_uq
      ON ${q("v4_notification_templates")} (notification_type)
  `);
  await client.query(`
    CREATE INDEX IF NOT EXISTS v4_notification_templates_category_idx
      ON ${q("v4_notification_templates")} (category)
  `);
  console.log("[migration] v4_notification_templates: indexes ensured ✓");

  // ── 2. v4_notification_delivery_logs ───────────────────────────────────────
  await client.query(`
    CREATE TABLE IF NOT EXISTS ${q("v4_notification_delivery_logs")} (
      id                  TEXT PRIMARY KEY,
      notification_id     TEXT,
      notification_type   TEXT NOT NULL,
      recipient_user_id   TEXT NOT NULL,
      recipient_email     TEXT,
      channel             TEXT NOT NULL,
      status              TEXT NOT NULL,
      error_message       TEXT,
      event_id            TEXT,
      dedupe_key          TEXT,
      is_test             BOOLEAN NOT NULL DEFAULT FALSE,
      metadata            JSONB,
      created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  console.log("[migration] v4_notification_delivery_logs: table ensured ✓");

  await client.query(`
    CREATE INDEX IF NOT EXISTS v4_notif_delivery_recipient_created_idx
      ON ${q("v4_notification_delivery_logs")} (recipient_user_id, created_at)
  `);
  await client.query(`
    CREATE INDEX IF NOT EXISTS v4_notif_delivery_type_status_idx
      ON ${q("v4_notification_delivery_logs")} (notification_type, status)
  `);
  await client.query(`
    CREATE INDEX IF NOT EXISTS v4_notif_delivery_is_test_created_idx
      ON ${q("v4_notification_delivery_logs")} (is_test, created_at)
  `);
  await client.query(`
    CREATE INDEX IF NOT EXISTS v4_notif_delivery_created_idx
      ON ${q("v4_notification_delivery_logs")} (created_at)
  `);
  await client.query(`
    CREATE INDEX IF NOT EXISTS v4_notif_delivery_channel_status_idx
      ON ${q("v4_notification_delivery_logs")} (channel, status)
  `);
  console.log("[migration] v4_notification_delivery_logs: indexes ensured ✓");

  await client.end();
  console.log("\n[migration] Notification template schema migration complete.");
  console.log("  Next: run seed script or call resetToDefault() for priority templates.");
}

main().catch((err) => {
  console.error("[migration] FATAL:", err);
  process.exit(1);
});
