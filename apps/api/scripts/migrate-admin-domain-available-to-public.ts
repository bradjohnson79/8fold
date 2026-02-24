#!/usr/bin/env tsx
/**
 * Admin-domain-all migration (safe subset):
 * - Reads from 8fold_test
 * - Writes to public
 * - Preserves existing public rows (insert-missing-only)
 * - Skips tables missing in source/target
 *
 * Usage:
 *   pnpm -C apps/api exec tsx scripts/migrate-admin-domain-available-to-public.ts
 *   pnpm -C apps/api exec tsx scripts/migrate-admin-domain-available-to-public.ts --execute
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { Client } from "pg";

type ColumnMeta = {
  column_name: string;
  is_nullable: "YES" | "NO";
  column_default: string | null;
  data_type: string;
  udt_name: string;
};

type TableSpec = {
  table: string;
  pk: string;
};

type TableReport = {
  table: string;
  sourceExists: boolean;
  targetExists: boolean;
  skipped: boolean;
  skipReason: string | null;
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
  warnings: string[];
  tables: TableReport[];
};

const SOURCE_SCHEMA = "8fold_test";
const TARGET_SCHEMA = "public";

// Dependency-aware order (broad admin domain)
const TABLES: TableSpec[] = [
  { table: "User", pk: "id" },
  { table: "AdminUser", pk: "id" },
  { table: "admin_sessions", pk: "id" },
  { table: "AuditLog", pk: "id" },
  { table: "RouterProfile", pk: "id" },
  { table: "routers", pk: "userId" },
  { table: "Contractor", pk: "id" },
  { table: "contractor_accounts", pk: "userId" },
  { table: "JobPosterProfile", pk: "id" },
  { table: "Job", pk: "id" },
  { table: "JobAssignment", pk: "id" },
  { table: "JobDispatch", pk: "id" },
  { table: "JobPayment", pk: "id" },
  { table: "conversations", pk: "id" },
  { table: "messages", pk: "id" },
  { table: "support_tickets", pk: "id" },
  { table: "support_messages", pk: "id" },
  { table: "support_attachments", pk: "id" },
  { table: "dispute_cases", pk: "id" },
  { table: "dispute_evidence", pk: "id" },
  { table: "dispute_votes", pk: "id" },
  { table: "dispute_alerts", pk: "id" },
  { table: "dispute_enforcement_actions", pk: "id" },
];

const UNIQUE_CONFLICT_COLUMNS: Record<string, string[]> = {
  User: ["email", "clerkUserId", "authUserId"],
  AdminUser: ["email"],
  JobPosterProfile: ["userId"],
};

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

async function getColumns(client: Client, schema: string, table: string): Promise<ColumnMeta[]> {
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

async function countCandidateInserts(client: Client, table: string, pk: string): Promise<number> {
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
      if (tgt.data_type === "USER-DEFINED") {
        return `(s.${quoteIdent(c)}::text)::${quoteIdent(TARGET_SCHEMA)}.${quoteIdent(tgt.udt_name)}`;
      }
      if (tgt.data_type === "ARRAY" && tgt.udt_name.startsWith("_") && /^[A-Z]/.test(tgt.udt_name.slice(1))) {
        const baseEnum = tgt.udt_name.slice(1);
        return `(s.${quoteIdent(c)}::text[])::${quoteIdent(TARGET_SCHEMA)}.${quoteIdent(baseEnum)}[]`;
      }
      return `s.${quoteIdent(c)}`;
    })
    .join(", ");

  const conflictCols = (UNIQUE_CONFLICT_COLUMNS[table] ?? []).filter((c) => columns.includes(c));
  const uniqueGuards = conflictCols
    .map(
      (c) => `
    AND (
      s.${quoteIdent(c)} IS NULL
      OR NOT EXISTS (
        SELECT 1
        FROM ${quoteIdent(TARGET_SCHEMA)}.${quoteIdent(table)} ux
        WHERE ux.${quoteIdent(c)} = s.${quoteIdent(c)}
      )
    )`,
    )
    .join("\n");

  const sql = `
    INSERT INTO ${quoteIdent(TARGET_SCHEMA)}.${quoteIdent(table)} (${colList})
    SELECT ${selectCols}
    FROM ${quoteIdent(SOURCE_SCHEMA)}.${quoteIdent(table)} s
    WHERE NOT EXISTS (
      SELECT 1
      FROM ${quoteIdent(TARGET_SCHEMA)}.${quoteIdent(table)} t
      WHERE t.${quoteIdent(pk)} = s.${quoteIdent(pk)}
    )
    ${uniqueGuards}
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
    mode: args.execute ? "execute" : "dry-run",
    sourceSchema: SOURCE_SCHEMA,
    targetSchema: TARGET_SCHEMA,
    timestamp: new Date().toISOString(),
    database,
    warnings: [],
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

      let skipped = false;
      let skipReason: string | null = null;
      if (!sourceExists || !targetExists) {
        skipped = true;
        skipReason = "missing_source_or_target_table";
      } else if (!copyColumns.includes(spec.pk)) {
        skipped = true;
        skipReason = "missing_pk_in_copy_columns";
      } else {
        const unmappedRequired = targetCols.filter(
          (c) => c.is_nullable === "NO" && c.column_default == null && !sourceColNames.has(c.column_name),
        );
        if (unmappedRequired.length > 0) {
          skipped = true;
          skipReason = `unmapped_required_columns:${unmappedRequired.map((c) => c.column_name).join(",")}`;
        }
      }

      if (skipped) {
        report.warnings.push(`${spec.table}: ${skipReason}`);
      }

      const sourceCount = sourceExists ? await countRows(client, SOURCE_SCHEMA, spec.table) : 0;
      const targetBefore = targetExists ? await countRows(client, TARGET_SCHEMA, spec.table) : 0;
      const candidateInserts = !skipped && sourceExists && targetExists
        ? await countCandidateInserts(client, spec.table, spec.pk)
        : 0;

      report.tables.push({
        table: spec.table,
        sourceExists,
        targetExists,
        skipped,
        skipReason,
        sourceCount,
        targetBefore,
        candidateInserts,
        insertedCount: 0,
        targetAfter: targetBefore,
        copyColumns,
      });
    }

    if (args.execute) {
      await client.query("BEGIN");
      try {
        await client.query(`SET LOCAL search_path TO ${quoteIdent(TARGET_SCHEMA)}`);
        for (const spec of TABLES) {
          const tableReport = report.tables.find((t) => t.table === spec.table);
          if (!tableReport || tableReport.skipped) continue;
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
      if (!tableReport || !tableReport.targetExists) continue;
      tableReport.targetAfter = await countRows(client, TARGET_SCHEMA, spec.table);
    }
  } catch (err) {
    report.ok = false;
    report.warnings.push(err instanceof Error ? err.message : String(err));
    throw err;
  } finally {
    const outPath = path.join(repoRoot, "docs", "ADMIN_DOMAIN_AVAILABLE_MIGRATION_REPORT.json");
    fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
    await client.end();
    // eslint-disable-next-line no-console
    console.log(JSON.stringify({ ok: report.ok, mode: report.mode, reportPath: outPath, warnings: report.warnings.length }, null, 2));
  }
}

main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error(e);
  process.exit(1);
});

