#!/usr/bin/env tsx
/**
 * One-off migration: copy critical admin data from 8fold_test -> public.
 *
 * Safety defaults:
 * - Dry-run by default (no writes)
 * - Execute mode is transactional
 * - Insert-missing-only (preserve existing public rows)
 *
 * Usage:
 *   pnpm -C apps/api exec tsx scripts/migrate-critical-admin-data-to-public.ts
 *   pnpm -C apps/api exec tsx scripts/migrate-critical-admin-data-to-public.ts --execute
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { Client } from "pg";

type TableSpec = {
  table: string;
  pk: string;
};

type TableReport = {
  table: string;
  sourceExists: boolean;
  targetExists: boolean;
  sourceCount: number;
  targetBefore: number;
  candidateInserts: number;
  insertedCount: number;
  targetAfter: number;
  copyColumns: string[];
};

type Report = {
  ok: boolean;
  mode: "dry-run" | "execute";
  sourceSchema: string;
  targetSchema: string;
  timestamp: string;
  database: string;
  preflightErrors: string[];
  tables: TableReport[];
};

const SOURCE_SCHEMA = "8fold_test";
const TARGET_SCHEMA = "public";

const TABLES: TableSpec[] = [
  { table: "JobPosterProfile", pk: "id" },
  { table: "support_tickets", pk: "id" },
  { table: "support_messages", pk: "id" },
  { table: "support_attachments", pk: "id" },
  { table: "dispute_cases", pk: "id" },
];

function quoteIdent(id: string): string {
  return `"${id.replaceAll(`"`, `""`)}"`;
}

function parseArgs(argv: string[]) {
  return {
    execute: argv.includes("--execute"),
  };
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

type ColumnMeta = {
  column_name: string;
  is_nullable: "YES" | "NO";
  column_default: string | null;
  data_type: string;
  udt_name: string;
};

async function getColumns(
  client: Client,
  schema: string,
  table: string,
): Promise<ColumnMeta[]> {
  const res = await client.query<ColumnMeta>(
    `
      SELECT column_name, is_nullable, column_default, data_type, udt_name
      FROM information_schema.columns
      WHERE table_schema = $1
        AND table_name = $2
      ORDER BY ordinal_position
    `,
    [schema, table],
  );
  return res.rows;
}

async function countRows(client: Client, schema: string, table: string): Promise<number> {
  const sql = `SELECT count(*)::bigint AS c FROM ${quoteIdent(schema)}.${quoteIdent(table)}`;
  const res = await client.query<{ c: string }>(sql);
  return Number(res.rows[0]?.c ?? "0");
}

async function countCandidateInserts(
  client: Client,
  table: string,
  pk: string,
): Promise<number> {
  const sql = `
    SELECT count(*)::bigint AS c
    FROM ${quoteIdent(SOURCE_SCHEMA)}.${quoteIdent(table)} s
    WHERE NOT EXISTS (
      SELECT 1
      FROM ${quoteIdent(TARGET_SCHEMA)}.${quoteIdent(table)} t
      WHERE t.${quoteIdent(pk)} = s.${quoteIdent(pk)}
    )
  `;
  const res = await client.query<{ c: string }>(sql);
  return Number(res.rows[0]?.c ?? "0");
}

async function insertMissingRows(
  client: Client,
  table: string,
  pk: string,
  columns: string[],
  sourceColsByName: Map<string, ColumnMeta>,
  targetColsByName: Map<string, ColumnMeta>,
): Promise<number> {
  const colList = columns.map((c) => quoteIdent(c)).join(", ");
  const selectCols = columns
    .map((c) => {
      const src = sourceColsByName.get(c);
      const tgt = targetColsByName.get(c);
      if (!src || !tgt) return `s.${quoteIdent(c)}`;
      // Cross-schema enum values must be recast into target enum type.
      if (tgt.data_type === "USER-DEFINED") {
        return `(s.${quoteIdent(c)}::text)::${quoteIdent(TARGET_SCHEMA)}.${quoteIdent(tgt.udt_name)}`;
      }
      return `s.${quoteIdent(c)}`;
    })
    .join(", ");
  const sql = `
    INSERT INTO ${quoteIdent(TARGET_SCHEMA)}.${quoteIdent(table)} (${colList})
    SELECT ${selectCols}
    FROM ${quoteIdent(SOURCE_SCHEMA)}.${quoteIdent(table)} s
    WHERE NOT EXISTS (
      SELECT 1
      FROM ${quoteIdent(TARGET_SCHEMA)}.${quoteIdent(table)} t
      WHERE t.${quoteIdent(pk)} = s.${quoteIdent(pk)}
    )
  `;
  const res = await client.query(sql);
  return res.rowCount ?? 0;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const scriptDir = path.dirname(fileURLToPath(import.meta.url));
  const apiRoot = path.resolve(scriptDir, "..");
  const repoRoot = path.resolve(scriptDir, "..", "..", "..");
  dotenv.config({ path: path.join(apiRoot, ".env.local") });

  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL required (apps/api/.env.local)");

  const dbName = (() => {
    try {
      const u = new URL(url);
      return u.pathname.replace(/^\//, "") || "unknown";
    } catch {
      return "unknown";
    }
  })();

  const report: Report = {
    ok: false,
    mode: args.execute ? "execute" : "dry-run",
    sourceSchema: SOURCE_SCHEMA,
    targetSchema: TARGET_SCHEMA,
    timestamp: new Date().toISOString(),
    database: dbName,
    preflightErrors: [],
    tables: [],
  };

  const client = new Client({ connectionString: url });
  await client.connect();

  try {
    for (const spec of TABLES) {
      const sourceExists = await tableExists(client, SOURCE_SCHEMA, spec.table);
      const targetExists = await tableExists(client, TARGET_SCHEMA, spec.table);
      const sourceCols = sourceExists ? await getColumns(client, SOURCE_SCHEMA, spec.table) : [];
      const targetCols = targetExists ? await getColumns(client, TARGET_SCHEMA, spec.table) : [];
      const sourceColNames = new Set(sourceCols.map((c) => c.column_name));
      const copyColumns = targetCols.map((c) => c.column_name).filter((c) => sourceColNames.has(c));

      if (!sourceExists) report.preflightErrors.push(`Missing source table: ${SOURCE_SCHEMA}.${spec.table}`);
      if (!targetExists) report.preflightErrors.push(`Missing target table: ${TARGET_SCHEMA}.${spec.table}`);
      if (sourceExists && targetExists && !copyColumns.includes(spec.pk)) {
        report.preflightErrors.push(`Missing PK column mapping (${spec.pk}) for ${spec.table}`);
      }

      // Guard: don't execute if target has required columns source cannot provide and no DB defaults.
      const unmappedRequired = targetCols.filter(
        (c) => c.is_nullable === "NO" && c.column_default == null && !sourceColNames.has(c.column_name),
      );
      if (unmappedRequired.length > 0) {
        report.preflightErrors.push(
          `Unmapped NOT NULL columns in target ${spec.table}: ${unmappedRequired.map((c) => c.column_name).join(", ")}`,
        );
      }

      const sourceCount = sourceExists ? await countRows(client, SOURCE_SCHEMA, spec.table) : 0;
      const targetBefore = targetExists ? await countRows(client, TARGET_SCHEMA, spec.table) : 0;
      const candidateInserts = sourceExists && targetExists ? await countCandidateInserts(client, spec.table, spec.pk) : 0;

      report.tables.push({
        table: spec.table,
        sourceExists,
        targetExists,
        sourceCount,
        targetBefore,
        candidateInserts,
        insertedCount: 0,
        targetAfter: targetBefore,
        copyColumns,
      });
    }

    if (report.preflightErrors.length > 0) {
      throw new Error(`Preflight failed with ${report.preflightErrors.length} error(s)`);
    }

    if (args.execute) {
      await client.query("BEGIN");
      try {
        await client.query(`SET LOCAL search_path TO ${quoteIdent(TARGET_SCHEMA)}`);
        for (const spec of TABLES) {
          const tableReport = report.tables.find((t) => t.table === spec.table);
          if (!tableReport) throw new Error(`Internal error: missing report row for ${spec.table}`);
          const sourceCols = await getColumns(client, SOURCE_SCHEMA, spec.table);
          const targetCols = await getColumns(client, TARGET_SCHEMA, spec.table);
          tableReport.insertedCount = await insertMissingRows(
            client,
            spec.table,
            spec.pk,
            tableReport.copyColumns,
            new Map(sourceCols.map((c) => [c.column_name, c])),
            new Map(targetCols.map((c) => [c.column_name, c])),
          );
        }
        await client.query("COMMIT");
      } catch (e) {
        await client.query("ROLLBACK");
        throw e;
      }
    }

    for (const spec of TABLES) {
      const tableReport = report.tables.find((t) => t.table === spec.table);
      if (!tableReport) continue;
      tableReport.targetAfter = await countRows(client, TARGET_SCHEMA, spec.table);
    }

    report.ok = true;
  } catch (err) {
    report.ok = false;
    if (report.preflightErrors.length === 0) {
      report.preflightErrors.push(err instanceof Error ? err.message : String(err));
    }
    throw err;
  } finally {
    const outPath = path.join(repoRoot, "docs", "CRITICAL_ADMIN_DATA_MIGRATION_REPORT.json");
    fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
    await client.end();
    // eslint-disable-next-line no-console
    console.log(JSON.stringify({ ok: report.ok, mode: report.mode, reportPath: outPath, preflightErrors: report.preflightErrors }, null, 2));
  }
}

main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error(e);
  process.exit(1);
});

