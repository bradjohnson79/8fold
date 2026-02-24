#!/usr/bin/env tsx
/**
 * Verifies DB uniqueness constraints for TransferRecord and LedgerEntry.
 * Run after migrations 0065, 0066.
 *
 * Usage:
 *   DOTENV_CONFIG_PATH=.env.local pnpm -C apps/api exec tsx scripts/verify-uniqueness-constraints.ts
 */

import { Client } from "pg";

function mustEnv(name: string): string {
  const v = String(process.env[name] ?? "").trim();
  if (!v) throw new Error(`${name} is required`);
  return v;
}

function schemaFromUrl(url: string): string {
  try {
    const u = new URL(url);
    const s = u.searchParams.get("schema");
    return s && /^[a-zA-Z0-9_]+$/.test(s) ? s : "public";
  } catch {
    return "public";
  }
}

async function main() {
  const url = mustEnv("DATABASE_URL");
  const schema = schemaFromUrl(url);
  const client = new Client({ connectionString: url });
  await client.connect();

  const results: { name: string; pass: boolean; detail: string }[] = [];

  try {
    // 1) TransferRecord unique(jobId, role)
    const trIdx = await client.query(
      `SELECT 1 FROM pg_indexes WHERE schemaname = $1 AND tablename = 'TransferRecord' AND indexdef LIKE '%jobId%role%' AND indexdef LIKE '%UNIQUE%'`,
      [schema]
    );
    results.push({
      name: "TransferRecord_job_role_uniq",
      pass: (trIdx.rows?.length ?? 0) > 0,
      detail: (trIdx.rows?.length ?? 0) > 0 ? "exists" : "missing",
    });

    // 2) LedgerEntry unique(jobId, type, stripeRef) partial
    const leIdx = await client.query(
      `SELECT 1 FROM pg_indexes WHERE schemaname = $1 AND tablename = 'LedgerEntry' AND indexname = 'LedgerEntry_job_type_stripeRef_uniq'`,
      [schema]
    );
    results.push({
      name: "LedgerEntry_job_type_stripeRef_uniq",
      pass: (leIdx.rows?.length ?? 0) > 0,
      detail: (leIdx.rows?.length ?? 0) > 0 ? "exists" : "missing",
    });

    // 3) AdminAdjustmentIdempotency table
    const aaTable = await client.query(
      `SELECT 1 FROM information_schema.tables WHERE table_schema = $1 AND table_name = 'AdminAdjustmentIdempotency'`,
      [schema]
    );
    results.push({
      name: "AdminAdjustmentIdempotency_table",
      pass: (aaTable.rows?.length ?? 0) > 0,
      detail: (aaTable.rows?.length ?? 0) > 0 ? "exists" : "missing",
    });
  } finally {
    await client.end();
  }

  const passed = results.filter((r) => r.pass).length;
  const total = results.length;

  console.log(JSON.stringify({ schema, results, passed, total }, null, 2));

  if (passed < total) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

export {};
