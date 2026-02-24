#!/usr/bin/env tsx
/**
 * Audit-only script: admin-domain-all copy candidates from 8fold_test -> public.
 *
 * This script does NOT write to the database.
 * It reports:
 * - source/target table existence
 * - row counts
 * - PK columns
 * - candidate inserts (insert-missing-only estimate)
 *
 * Usage:
 *   pnpm -C apps/api exec tsx scripts/audit-admin-domain-copy-candidates.ts
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { Client } from "pg";

const SOURCE_SCHEMA = "8fold_test";
const TARGET_SCHEMA = "public";

const ADMIN_DOMAIN_TABLES: string[] = [
  "User",
  "AdminUser",
  "admin_sessions",
  "AuditLog",
  "RouterProfile",
  "routers",
  "Contractor",
  "contractor_accounts",
  "JobPosterProfile",
  "Job",
  "JobAssignment",
  "JobDispatch",
  "JobPayment",
  "conversations",
  "messages",
  "support_tickets",
  "support_messages",
  "support_attachments",
  "dispute_cases",
  "dispute_evidence",
  "dispute_votes",
  "dispute_alerts",
  "dispute_enforcement_actions",
];

type TableAudit = {
  table: string;
  sourceExists: boolean;
  targetExists: boolean;
  sourceCount: number;
  targetCount: number;
  pkColumns: string[];
  candidateInserts: number | null;
  note: string | null;
};

type Report = {
  ok: boolean;
  mode: "audit-only";
  sourceSchema: string;
  targetSchema: string;
  database: string;
  timestamp: string;
  tables: TableAudit[];
  warnings: string[];
};

function quoteIdent(id: string): string {
  return `"${id.replaceAll(`"`, `""`)}"`;
}

async function tableExists(client: Client, schema: string, table: string): Promise<boolean> {
  const res = await client.query<{ exists: boolean }>(
    `
      SELECT EXISTS (
        SELECT 1
        FROM information_schema.tables
        WHERE table_schema = $1
          AND table_name = $2
      ) AS exists
    `,
    [schema, table],
  );
  return Boolean(res.rows[0]?.exists);
}

async function countRows(client: Client, schema: string, table: string): Promise<number> {
  const sql = `SELECT count(*)::bigint AS c FROM ${quoteIdent(schema)}.${quoteIdent(table)}`;
  const res = await client.query<{ c: string }>(sql);
  return Number(res.rows[0]?.c ?? "0");
}

async function getPkColumns(client: Client, schema: string, table: string): Promise<string[]> {
  const res = await client.query<{ column_name: string }>(
    `
      SELECT kcu.column_name
      FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu
        ON tc.constraint_name = kcu.constraint_name
       AND tc.table_schema = kcu.table_schema
      WHERE tc.table_schema = $1
        AND tc.table_name = $2
        AND tc.constraint_type = 'PRIMARY KEY'
      ORDER BY kcu.ordinal_position
    `,
    [schema, table],
  );
  return res.rows.map((r) => r.column_name);
}

async function countCandidateInsertsByPk(
  client: Client,
  table: string,
  pkColumns: string[],
): Promise<number> {
  const joinPredicate = pkColumns.map((c) => `t.${quoteIdent(c)} = s.${quoteIdent(c)}`).join(" AND ");
  const sql = `
    SELECT count(*)::bigint AS c
    FROM ${quoteIdent(SOURCE_SCHEMA)}.${quoteIdent(table)} s
    WHERE NOT EXISTS (
      SELECT 1
      FROM ${quoteIdent(TARGET_SCHEMA)}.${quoteIdent(table)} t
      WHERE ${joinPredicate}
    )
  `;
  const res = await client.query<{ c: string }>(sql);
  return Number(res.rows[0]?.c ?? "0");
}

async function main() {
  const scriptDir = path.dirname(fileURLToPath(import.meta.url));
  const apiRoot = path.resolve(scriptDir, "..");
  const repoRoot = path.resolve(scriptDir, "..", "..", "..");
  dotenv.config({ path: path.join(apiRoot, ".env.local") });

  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL required (apps/api/.env.local)");

  const database = (() => {
    try {
      const u = new URL(url);
      return u.pathname.replace(/^\//, "") || "unknown";
    } catch {
      return "unknown";
    }
  })();

  const report: Report = {
    ok: true,
    mode: "audit-only",
    sourceSchema: SOURCE_SCHEMA,
    targetSchema: TARGET_SCHEMA,
    database,
    timestamp: new Date().toISOString(),
    tables: [],
    warnings: [],
  };

  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    for (const table of ADMIN_DOMAIN_TABLES) {
      const sourceExists = await tableExists(client, SOURCE_SCHEMA, table);
      const targetExists = await tableExists(client, TARGET_SCHEMA, table);
      const sourceCount = sourceExists ? await countRows(client, SOURCE_SCHEMA, table) : 0;
      const targetCount = targetExists ? await countRows(client, TARGET_SCHEMA, table) : 0;
      const pkColumns = targetExists ? await getPkColumns(client, TARGET_SCHEMA, table) : [];

      let candidateInserts: number | null = null;
      let note: string | null = null;

      if (!sourceExists || !targetExists) {
        note = "missing_source_or_target_table";
      } else if (pkColumns.length === 0) {
        note = "no_primary_key_on_target";
      } else {
        candidateInserts = await countCandidateInsertsByPk(client, table, pkColumns);
      }

      if (note) {
        report.warnings.push(`${table}: ${note}`);
      }

      report.tables.push({
        table,
        sourceExists,
        targetExists,
        sourceCount,
        targetCount,
        pkColumns,
        candidateInserts,
        note,
      });
    }
  } finally {
    await client.end();
  }

  const outPath = path.join(repoRoot, "docs", "ADMIN_DOMAIN_COPY_CANDIDATES_REPORT.json");
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
  // eslint-disable-next-line no-console
  console.log(JSON.stringify({ ok: report.ok, reportPath: outPath, warnings: report.warnings.length }, null, 2));
}

main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error(e);
  process.exit(1);
});

