/**
 * Production-safe migration: v4_contractor_trade_skills + v4_contractor_certifications.
 *
 * Safe to run multiple times — uses CREATE TABLE IF NOT EXISTS and IF NOT EXISTS for indexes.
 * Uses TEXT for trade_category (not the pgEnum) for maximum portability.
 *
 * Run:
 *   pnpm -C apps/api exec tsx scripts/apply-contractor-trade-schema.ts
 *   or with explicit DATABASE_URL:
 *   DATABASE_URL=<url> pnpm -C apps/api exec tsx scripts/apply-contractor-trade-schema.ts
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(SCRIPT_DIR, "..", ".env.local") });

import { Client } from "pg";

function mustEnv(name: string): string {
  const v = String(process.env[name] ?? "").trim();
  if (!v) throw new Error(`[apply-contractor-trade-schema] ${name} is not set`);
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

async function tableExists(client: Client, schema: string, tableName: string): Promise<boolean> {
  const res = await client.query<{ exists: boolean }>(`
    SELECT EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = $1 AND table_name = $2
    ) AS exists
  `, [schema, tableName]);
  return Boolean(res.rows[0]?.exists);
}

async function main() {
  const DATABASE_URL = mustEnv("DATABASE_URL");
  const schema = schemaFromDatabaseUrl(DATABASE_URL);
  const q = (t: string) => `"${schema}"."${t}"`;
  const userTable = q("User");

  const client = new Client({ connectionString: DATABASE_URL });
  await client.connect();
  console.log(`[apply-contractor-trade-schema] Connected — schema: ${schema}`);

  // ── 1. v4_contractor_trade_skills ──────────────────────────────────────────
  const skillsExists = await tableExists(client, schema, "v4_contractor_trade_skills");
  if (skillsExists) {
    console.log("[apply-contractor-trade-schema] v4_contractor_trade_skills: already exists — skipping create");
  } else {
    await client.query(`
      CREATE TABLE IF NOT EXISTS ${q("v4_contractor_trade_skills")} (
        id                  TEXT PRIMARY KEY,
        contractor_user_id  TEXT NOT NULL REFERENCES ${userTable}(id) ON DELETE CASCADE,
        trade_category      TEXT NOT NULL,
        years_experience    INTEGER NOT NULL,
        approved            BOOLEAN NOT NULL DEFAULT FALSE,
        created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (contractor_user_id, trade_category)
      )
    `);
    console.log("[apply-contractor-trade-schema] v4_contractor_trade_skills: created ✓");
  }

  // Index for router matching (fast lookup by trade + approval status)
  await client.query(`
    CREATE INDEX IF NOT EXISTS trade_skill_lookup_idx
      ON ${q("v4_contractor_trade_skills")} (trade_category, approved)
  `);
  console.log("[apply-contractor-trade-schema] trade_skill_lookup_idx: ensured ✓");

  // ── 2. v4_contractor_certifications ────────────────────────────────────────
  const certsExists = await tableExists(client, schema, "v4_contractor_certifications");
  if (certsExists) {
    console.log("[apply-contractor-trade-schema] v4_contractor_certifications: already exists — skipping create");
  } else {
    await client.query(`
      CREATE TABLE IF NOT EXISTS ${q("v4_contractor_certifications")} (
        id                    TEXT PRIMARY KEY,
        contractor_user_id    TEXT NOT NULL REFERENCES ${userTable}(id) ON DELETE CASCADE,
        trade_skill_id        TEXT NOT NULL REFERENCES ${q("v4_contractor_trade_skills")}(id) ON DELETE CASCADE,
        certification_name    TEXT NOT NULL,
        issuing_organization  TEXT,
        certificate_image_url TEXT,
        certificate_type      TEXT,
        issued_at             TIMESTAMPTZ,
        verified              BOOLEAN NOT NULL DEFAULT FALSE,
        created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    console.log("[apply-contractor-trade-schema] v4_contractor_certifications: created ✓");
  }

  await client.end();

  console.log("\n[apply-contractor-trade-schema] Migration complete.");
  console.log("  Next steps:");
  console.log("  1. Run backfill: tsx scripts/backfill-contractor-trade-skills.ts");
  console.log("  2. Deploy API");
}

main().catch((err) => {
  console.error("[apply-contractor-trade-schema] FATAL:", err);
  process.exit(1);
});
