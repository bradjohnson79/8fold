/**
 * Migration: v4_contractor_trade_skills + v4_contractor_certifications (idempotent).
 *
 * Creates two new tables:
 *   v4_contractor_trade_skills  — per-trade years of experience and approval status
 *   v4_contractor_certifications — optional cert uploads linked to a trade skill
 *
 * Run:
 *   pnpm -C apps/api exec tsx scripts/migrate-contractor-trade-skills.ts
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(SCRIPT_DIR, "..", ".env.local") });

import { Client } from "pg";

function mustEnv(name: string): string {
  const v = String(process.env[name] ?? "").trim();
  if (!v) throw new Error(`${name} is not set`);
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
  console.log(`[migrate] Connected. Schema: ${schema}`);

  // 1. v4_contractor_trade_skills
  await client.query(`
    CREATE TABLE IF NOT EXISTS ${q("v4_contractor_trade_skills")} (
      id                  text PRIMARY KEY,
      contractor_user_id  text NOT NULL REFERENCES ${q("User")}(id) ON DELETE CASCADE,
      trade_category      "TradeCategory" NOT NULL,
      years_experience    integer NOT NULL,
      approved            boolean NOT NULL DEFAULT false,
      created_at          timestamptz NOT NULL DEFAULT now(),
      updated_at          timestamptz NOT NULL DEFAULT now(),
      UNIQUE (contractor_user_id, trade_category)
    )
  `);
  console.log("[migrate] v4_contractor_trade_skills: table ensured");

  // Index for fast router matching: (trade_category, approved)
  await client.query(`
    CREATE INDEX IF NOT EXISTS trade_skill_lookup_idx
      ON ${q("v4_contractor_trade_skills")} (trade_category, approved)
  `);
  console.log("[migrate] trade_skill_lookup_idx: index ensured");

  // 2. v4_contractor_certifications
  await client.query(`
    CREATE TABLE IF NOT EXISTS ${q("v4_contractor_certifications")} (
      id                    text PRIMARY KEY,
      contractor_user_id    text NOT NULL REFERENCES ${q("User")}(id) ON DELETE CASCADE,
      trade_skill_id        text NOT NULL REFERENCES ${q("v4_contractor_trade_skills")}(id) ON DELETE CASCADE,
      certification_name    text NOT NULL,
      issuing_organization  text,
      certificate_image_url text,
      certificate_type      text,
      issued_at             timestamptz,
      verified              boolean NOT NULL DEFAULT false,
      created_at            timestamptz NOT NULL DEFAULT now()
    )
  `);
  console.log("[migrate] v4_contractor_certifications: table ensured");

  await client.end();
  console.log("[migrate] Done.");
}

main().catch((err) => {
  console.error("[migrate] FATAL:", err);
  process.exit(1);
});
