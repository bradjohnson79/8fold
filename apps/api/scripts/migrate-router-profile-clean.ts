#!/usr/bin/env npx tsx
/**
 * Router Dashboard Reset migration:
 * - Normalize RouterProfile address columns
 * - Drop legacy RouterProfile columns (addressPrivate + payout/contact legacy fields)
 *
 * This repo treats Postgres schema as DB-authoritative, so we apply schema changes via a script
 * (idempotent, explicit `--execute` flag).
 */

import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { sql } from "drizzle-orm";

function hasExecuteFlag(argv: string[]): boolean {
  return argv.includes("--execute");
}

function quoteIdent(v: string): string {
  return `"${String(v).replace(/"/g, "\"\"")}"`;
}

function tableIdent(schema: string, table: string): string {
  return `${quoteIdent(schema)}.${quoteIdent(table)}`;
}

async function columnExists(opts: { schema: string; table: string; column: string }): Promise<boolean> {
  const { db } = await import("../db/drizzle");
  const r = await db.execute(sql`
    select exists (
      select 1
      from information_schema.columns
      where table_schema = ${opts.schema}
        and table_name = ${opts.table}
        and column_name = ${opts.column}
    ) as present
  `);
  return Boolean((r as any)?.rows?.[0]?.present);
}

async function runSql(execute: boolean, statement: string): Promise<void> {
  const { db } = await import("../db/drizzle");
  // eslint-disable-next-line no-console
  console.log(execute ? `[EXEC] ${statement}` : `[DRY]  ${statement}`);
  if (!execute) return;
  await db.execute(sql.raw(statement));
}

async function main() {
  const execute = hasExecuteFlag(process.argv.slice(2));

  const scriptDir = path.dirname(fileURLToPath(import.meta.url));
  dotenv.config({ path: path.join(scriptDir, "..", ".env.local") });
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required (apps/api/.env.local)");

  const { DB_SCHEMA } = await import("../db/schema/_dbSchema");
  const schema = DB_SCHEMA || "public";
  const table = "RouterProfile";

  // 1) Rename `street` -> `address` (if needed)
  const hasStreet = await columnExists({ schema, table, column: "street" });
  const hasAddress = await columnExists({ schema, table, column: "address" });
  if (hasStreet && !hasAddress) {
    await runSql(execute, `alter table ${tableIdent(schema, table)} rename column ${quoteIdent("street")} to ${quoteIdent("address")}`);
  }

  // 2) Rename `state` -> `stateProvince` (if needed)
  const hasState = await columnExists({ schema, table, column: "state" });
  const hasStateProvince = await columnExists({ schema, table, column: "stateProvince" });
  if (hasState && !hasStateProvince) {
    await runSql(
      execute,
      `alter table ${tableIdent(schema, table)} rename column ${quoteIdent("state")} to ${quoteIdent("stateProvince")}`,
    );
  }

  // 3) Drop legacy columns (idempotent)
  const dropCols = [
    // Address legacy
    "addressPrivate",

    // Activation/approval (not used in instant-access model)
    "status",

    // Contact / notifications legacy
    "phone",
    "notifyViaEmail",
    "notifyViaSms",

    // Payout legacy (moved to PayoutMethod table details JSON)
    "payoutMethod",
    "payoutStatus",
    "stripeAccountId",
    "stripePayoutsEnabled",
  ] as const;

  for (const col of dropCols) {
    const present = await columnExists({ schema, table, column: col });
    if (!present) continue;
    await runSql(execute, `alter table ${tableIdent(schema, table)} drop column if exists ${quoteIdent(col)}`);
  }

  // eslint-disable-next-line no-console
  console.log(JSON.stringify({ ok: true, execute, schema, table }, null, 2));
}

main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error(e);
  process.exit(1);
});

