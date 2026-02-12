/**
 * Money integrity baseline checks (read-only).
 *
 * Runs the Phase 4 SQL checks:
 * - SELECT COUNT(*) FROM "PayoutRequest";
 * - SELECT SUM("amountCents") FROM "PayoutRequest";
 * - SELECT COUNT(*) FROM "Job";
 *
 * Uses schema-qualified names for determinism: 8fold_test.
 *
 * Run:
 *   pnpm exec tsx scripts/money-integrity-check.ts
 */
import path from "node:path";
import { Client } from "pg";

async function main() {
  const repoRoot = process.cwd();
  const dotenv = await import("dotenv");
  dotenv.config({ path: path.join(repoRoot, "apps/api/.env.local") });
  dotenv.config({ path: path.join(repoRoot, ".env") });

  const DATABASE_URL = process.env.DATABASE_URL;
  if (!DATABASE_URL) throw new Error("DATABASE_URL missing");

  const pg = new Client({ connectionString: DATABASE_URL });
  await pg.connect();

  const now = new Date().toISOString();

  const payoutReqCount = await pg
    .query(`SELECT COUNT(*)::bigint AS count FROM "8fold_test"."PayoutRequest";`)
    .then((r) => BigInt(r.rows[0]?.count ?? 0));

  const payoutReqSum = await pg
    .query(`SELECT COALESCE(SUM("amountCents"), 0)::bigint AS sum FROM "8fold_test"."PayoutRequest";`)
    .then((r) => BigInt(r.rows[0]?.sum ?? 0));

  const jobCount = await pg
    .query(`SELECT COUNT(*)::bigint AS count FROM "8fold_test"."Job";`)
    .then((r) => BigInt(r.rows[0]?.count ?? 0));

  await pg.end();

  // eslint-disable-next-line no-console
  console.log(
    JSON.stringify(
      {
        ok: true,
        timestamp: now,
        payoutRequest: { count: payoutReqCount.toString(), sumAmountCents: payoutReqSum.toString() },
        job: { count: jobCount.toString() },
      },
      null,
      2,
    ),
  );
}

main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error(e);
  process.exit(1);
});

