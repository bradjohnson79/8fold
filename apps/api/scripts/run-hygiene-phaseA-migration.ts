#!/usr/bin/env tsx
/**
 * Run Hygiene Phase A migration (0063 jobs legacy cleanup).
 * Reads DATABASE_URL from .env.local.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "node:fs";
import dotenv from "dotenv";
import { Client } from "pg";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "..", ".env.local") });

const MIGRATION_PATH = path.join(__dirname, "..", "..", "..", "migrations", "hygiene_phaseA", "0063_jobs_legacy_cleanup.sql");

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL required (apps/api/.env.local)");
    process.exit(1);
  }

  const sql = fs.readFileSync(MIGRATION_PATH, "utf-8");
  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    await client.query(sql);
    console.log("Phase A migration 0063 applied.");
  } finally {
    await client.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
