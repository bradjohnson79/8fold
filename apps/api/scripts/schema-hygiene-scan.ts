#!/usr/bin/env tsx
/**
 * Schema Hygiene Diagnostic Scan
 *
 * Read-only diagnostic: DB structure vs Drizzle schema alignment.
 * No modifications. No migrations. No assumptions.
 *
 * Phases:
 *   1. DB structure snapshot → reports/db_structure_snapshot.json
 *   2. Drizzle schema snapshot → reports/drizzle_schema_snapshot.json
 *   3. Drift detection → reports/schema_drift_report.json
 *   4. Severity ranking → reports/schema_drift_ranked.md
 *   5. Query integrity scan → reports/query_integrity_report.md
 *   6. Hygiene summary dashboard (printed)
 *
 * Usage: pnpm -C apps/api exec tsx scripts/schema-hygiene-scan.ts
 */
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { Client } from "pg";
import { getTableConfig } from "drizzle-orm/pg-core";
import * as schema from "../db/schema";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..", "..", "..");
const REPORTS_DIR = path.join(REPO_ROOT, "reports");

dotenv.config({ path: path.join(__dirname, "..", ".env.local") });

// --- Types ---
type DbTable = {
  schema: string;
  name: string;
  columns: Array<{
    name: string;
    dataType: string;
    udtName: string;
    isNullable: boolean;
    columnDefault: string | null;
  }>;
  primaryKey: string[];
};

type DbEnum = {
  schema: string;
  name: string;
  labels: string[];
};

type DbFk = {
  name: string;
  referencingSchema: string;
  referencingTable: string;
  referencedSchema: string;
  referencedTable: string;
  columns: Array<{ from: string; to: string }>;
};

type DbIndex = {
  schema: string;
  table: string;
  name: string;
  columns: string[];
  unique: boolean;
};

// --- Phase 1: DB Structure Snapshot ---
async function phase1DbStructure(client: Client): Promise<object> {
  const schemas = ["public", "directory_engine", "8fold_shadow", "8fold_test"];

  const tables: Array<{ schema: string; name: string; rowCount?: number }> = [];
  for (const s of schemas) {
    const r = await client.query<{ table_schema: string; table_name: string }>(
      `SELECT table_schema, table_name FROM information_schema.tables
       WHERE table_schema = $1 AND table_type = 'BASE TABLE' ORDER BY table_name`,
      [s]
    );
    for (const row of r.rows) {
      tables.push({ schema: row.table_schema, name: row.table_name });
    }
  }

  const columnsRes = await client.query<{
    table_schema: string;
    table_name: string;
    column_name: string;
    data_type: string;
    udt_name: string;
    is_nullable: "YES" | "NO";
    column_default: string | null;
  }>(
    `SELECT table_schema, table_name, column_name, data_type, udt_name, is_nullable, column_default
     FROM information_schema.columns
     WHERE table_schema = ANY($1::text[])
     ORDER BY table_schema, table_name, ordinal_position`,
    [schemas]
  );

  const pkRes = await client.query<{ nspname: string; relname: string; cols: string[] }>(
    `SELECT n.nspname, t.relname, array_agg(a.attname ORDER BY x.ord) as cols
     FROM pg_constraint c
     JOIN pg_class t ON t.oid = c.conrelid
     JOIN pg_namespace n ON n.oid = t.relnamespace
     JOIN LATERAL unnest(c.conkey) WITH ORDINALITY AS x(attnum, ord) ON true
     JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = x.attnum AND NOT a.attisdropped
     WHERE c.contype = 'p' AND n.nspname = ANY($1::text[])
     GROUP BY n.nspname, t.relname`,
    [schemas]
  );

  const pkMap = new Map<string, string[]>();
  for (const r of pkRes.rows) {
    pkMap.set(`${r.nspname}.${r.relname}`, r.cols ?? []);
  }

  const tablesDetail: Record<string, DbTable> = {};
  for (const r of columnsRes.rows) {
    const key = `${r.table_schema}.${r.table_name}`;
    if (!tablesDetail[key]) {
      tablesDetail[key] = {
        schema: r.table_schema,
        name: r.table_name,
        columns: [],
        primaryKey: pkMap.get(key) ?? [],
      };
    }
    tablesDetail[key].columns.push({
      name: r.column_name,
      dataType: r.data_type,
      udtName: r.udt_name,
      isNullable: r.is_nullable === "YES",
      columnDefault: r.column_default,
    });
  }

  const enumsRes = await client.query<{ nspname: string; typname: string; enumlabel: string }>(
    `SELECT n.nspname, t.typname, e.enumlabel
     FROM pg_type t
     JOIN pg_namespace n ON n.oid = t.typnamespace
     JOIN pg_enum e ON e.enumtypid = t.oid
     WHERE n.nspname = ANY($1::text[])
     ORDER BY n.nspname, t.typname, e.enumsortorder`,
    [schemas]
  );

  const enumsMap = new Map<string, string[]>();
  for (const r of enumsRes.rows) {
    const key = `${r.nspname}.${r.typname}`;
    if (!enumsMap.has(key)) enumsMap.set(key, []);
    enumsMap.get(key)!.push(r.enumlabel);
  }
  const enums: DbEnum[] = Array.from(enumsMap.entries()).map(([k, labels]) => {
    const [schema, name] = k.split(".");
    return { schema, name, labels };
  });

  const fkRes = await client.query<{
    conname: string;
    ref_schema: string;
    ref_table: string;
    refed_schema: string;
    refed_table: string;
    ref_col: string;
    refed_col: string;
  }>(
    `SELECT
       c.conname,
       nr.nspname AS ref_schema, tr.relname AS ref_table,
       nf.nspname AS refed_schema, tf.relname AS refed_table,
       ar.attname AS ref_col, af.attname AS refed_col
     FROM pg_constraint c
     JOIN pg_class tr ON tr.oid = c.conrelid
     JOIN pg_namespace nr ON nr.oid = tr.relnamespace
     JOIN pg_class tf ON tf.oid = c.confrelid
     JOIN pg_namespace nf ON nf.oid = tf.relnamespace
     JOIN pg_attribute ar ON ar.attrelid = c.conrelid AND ar.attnum = ANY(c.conkey) AND NOT ar.attisdropped
     JOIN pg_attribute af ON af.attrelid = c.confrelid AND af.attnum = ANY(c.confkey) AND NOT af.attisdropped
     WHERE c.contype = 'f' AND nr.nspname = ANY($1::text[])
     ORDER BY c.conname`,
    [schemas]
  );

  const fkMap = new Map<string, DbFk>();
  for (const r of fkRes.rows) {
    const key = r.conname;
    if (!fkMap.has(key)) {
      fkMap.set(key, {
        name: r.conname,
        referencingSchema: r.ref_schema,
        referencingTable: r.ref_table,
        referencedSchema: r.refed_schema,
        referencedTable: r.refed_table,
        columns: [],
      });
    }
    fkMap.get(key)!.columns.push({ from: r.ref_col, to: r.refed_col });
  }
  const foreignKeys = Array.from(fkMap.values());

  const idxRes = await client.query<{
    schemaname: string;
    tablename: string;
    indexname: string;
    indexdef: string;
  }>(
    `SELECT schemaname, tablename, indexname, indexdef
     FROM pg_indexes
     WHERE schemaname = ANY($1::text[])
     ORDER BY schemaname, tablename`,
    [schemas]
  );

  const indexes: DbIndex[] = idxRes.rows.map((r) => {
    const unique = r.indexdef.includes("UNIQUE");
    const match = r.indexdef.match(/\(([^)]+)\)/);
    const columns = match ? match[1].split(",").map((c) => c.trim().replace(/^"|"$/g, "")) : [];
    return {
      schema: r.schemaname,
      table: r.tablename,
      name: r.indexname,
      columns,
      unique,
    };
  });

  const snapshot = {
    generatedAt: new Date().toISOString(),
    schemas,
    tables: tables.map((t) => ({ ...t })),
    tablesDetail: Object.fromEntries(
      Object.entries(tablesDetail).map(([k, v]) => [k, { ...v }])
    ),
    enums,
    foreignKeys,
    indexes,
  };

  fs.writeFileSync(
    path.join(REPORTS_DIR, "db_structure_snapshot.json"),
    JSON.stringify(snapshot, null, 2)
  );
  return snapshot;
}

// --- Phase 2: Drizzle Schema Snapshot ---
function phase2DrizzleSchema(): object {
  const drizzleTables: Array<{
    schema: string;
    name: string;
    columns: Array<{
      name: string;
      notNull: boolean;
      hasDefault: boolean;
      sqlType: string;
      enumType?: string;
    }>;
    primaryKey: string[];
  }> = [];

  for (const [k, v] of Object.entries(schema)) {
    if (!v || typeof v !== "object") continue;
    try {
      const cfg = getTableConfig(v as any);
      const schemaName = (cfg as any).schema ?? "public";
      const cols = Object.entries(cfg.columns).map(([colKey, col]: [string, any]) => {
        const name = col?.name ?? colKey;
        const sqlType = typeof col?.getSQLType === "function" ? col.getSQLType() : String(col?.dataType ?? "");
        const enumMatch = sqlType.match(/^"([^"]+)"$/);
        return {
          name,
          notNull: Boolean(col?.notNull),
          hasDefault: Boolean(col?.hasDefault),
          sqlType: sqlType.replace(/^"|"$/g, ""),
          enumType: enumMatch ? enumMatch[1] : undefined,
        };
      });
      drizzleTables.push({
        schema: schemaName,
        name: cfg.name,
        columns: cols,
        primaryKey: (cfg.primaryKeys?.[0]?.columns ?? []).map((c: any) => String(c?.name ?? "")),
      });
    } catch {
      // Skip non-table exports (enums, schemas, etc.)
    }
  }

  const drizzleEnums: Array<{ name: string; values: string[] }> = [];
  for (const [k, v] of Object.entries(schema)) {
    const anyV = v as any;
    if (!anyV) continue;
    const enumName = anyV.enumName ?? anyV?.[Symbol.for("drizzle:PgEnum")]?.enumName;
    const enumValues = anyV.enumValues ?? anyV?.[Symbol.for("drizzle:PgEnum")]?.enumValues;
    if (typeof enumName === "string" && Array.isArray(enumValues)) {
      drizzleEnums.push({ name: enumName, values: enumValues.map(String) });
    }
  }

  const seen = new Set<string>();
  const uniqueEnums = drizzleEnums.filter((e) => (seen.has(e.name) ? false : (seen.add(e.name), true)));

  const snapshot = {
    generatedAt: new Date().toISOString(),
    tables: drizzleTables,
    enums: uniqueEnums.sort((a, b) => a.name.localeCompare(b.name)),
  };

  fs.writeFileSync(
    path.join(REPORTS_DIR, "drizzle_schema_snapshot.json"),
    JSON.stringify(snapshot, null, 2)
  );
  return snapshot;
}

// --- Phase 3: Drift Detection ---
type DriftIssue = {
  kind: string;
  severity: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
  table?: string;
  schema?: string;
  column?: string;
  detail: string;
  expected?: string;
  actual?: string;
};

function phase3DriftDetection(dbSnapshot: any, drizzleSnapshot: any): DriftIssue[] {
  const issues: DriftIssue[] = [];
  const dbTables = new Map<string, DbTable>();
  for (const [k, v] of Object.entries(dbSnapshot.tablesDetail || {})) {
    dbTables.set(k, v as DbTable);
  }
  const dbEnums = new Map<string, DbEnum>();
  for (const e of dbSnapshot.enums || []) {
    dbEnums.set(`${(e as DbEnum).schema}.${(e as DbEnum).name}`, e as DbEnum);
  }

  const drizzleTables = (drizzleSnapshot.tables || []) as Array<{
    schema: string;
    name: string;
    columns: Array<{ name: string; notNull: boolean; hasDefault: boolean; sqlType: string; enumType?: string }>;
    primaryKey: string[];
  }>;
  const drizzleEnums = (drizzleSnapshot.enums || []) as Array<{ name: string; values: string[] }>;

  for (const dt of drizzleTables) {
    const schemaName = dt.schema || "public";
    const dbKey = `${schemaName}.${dt.name}`;
    const dbTable = dbTables.get(dbKey);

    if (!dbTable) {
      issues.push({
        kind: "MISSING_TABLE_IN_DB",
        severity: "CRITICAL",
        table: dt.name,
        schema: schemaName,
        detail: `Drizzle table ${dbKey} does not exist in database`,
      });
      continue;
    }

    const dbColMap = new Map(dbTable.columns.map((c) => [c.name, c]));
    const drizzleColMap = new Map(dt.columns.map((c) => [c.name, c]));

    for (const [colName, dc] of drizzleColMap) {
      const dbCol = dbColMap.get(colName);
      if (!dbCol) {
        issues.push({
          kind: "MISSING_COLUMN_IN_DB",
          severity: "CRITICAL",
          table: dt.name,
          schema: schemaName,
          column: colName,
          detail: `Column ${colName} in Drizzle does not exist in DB`,
        });
        continue;
      }

      if (dc.enumType && dbCol.dataType === "USER-DEFINED") {
        const dbEnum = dbEnums.get(`${schemaName}.${dbCol.udtName}`);
        if (dbEnum) {
          const drizzleEnum = drizzleEnums.find((e) => e.name === dc.enumType);
          if (drizzleEnum) {
            const dbSet = new Set(dbEnum.labels);
            const dzSet = new Set(drizzleEnum.values);
            const missingInDb = drizzleEnum.values.filter((v) => !dbSet.has(v));
            const extraInDb = dbEnum.labels.filter((v) => !dzSet.has(v));
            if (missingInDb.length > 0) {
              issues.push({
                kind: "ENUM_LABEL_MISSING_IN_DB",
                severity: "CRITICAL",
                table: dt.name,
                schema: schemaName,
                column: colName,
                detail: `Enum ${dc.enumType} has labels in Drizzle not in DB: ${missingInDb.join(", ")}`,
                expected: missingInDb.join(", "),
                actual: "missing in DB",
              });
            }
            if (extraInDb.length > 0) {
              issues.push({
                kind: "ENUM_LABEL_EXTRA_IN_DB",
                severity: "MEDIUM",
                table: dt.name,
                schema: schemaName,
                column: colName,
                detail: `Enum ${dc.enumType} has extra labels in DB: ${extraInDb.join(", ")}`,
              });
            }
          }
        }
      }

      if (dc.enumType && dbCol.dataType !== "USER-DEFINED") {
        issues.push({
          kind: "TYPE_MISMATCH",
          severity: "CRITICAL",
          table: dt.name,
          schema: schemaName,
          column: colName,
          detail: `Drizzle expects enum ${dc.enumType}, DB has ${dbCol.dataType} (${dbCol.udtName})`,
          expected: `enum ${dc.enumType}`,
          actual: `${dbCol.dataType} (${dbCol.udtName})`,
        });
      }

      if (dc.notNull && dbCol.isNullable) {
        issues.push({
          kind: "NULLABLE_MISMATCH",
          severity: "HIGH",
          table: dt.name,
          schema: schemaName,
          column: colName,
          detail: `Drizzle NOT NULL, DB allows NULL`,
          expected: "NOT NULL",
          actual: "NULLABLE",
        });
      }

      if (!dc.hasDefault && dbCol.columnDefault && dbCol.dataType !== "USER-DEFINED") {
        // DB has default, Drizzle doesn't declare - usually fine
      }
      if (dc.hasDefault && !dbCol.columnDefault && dc.notNull) {
        issues.push({
          kind: "DEFAULT_MISMATCH",
          severity: "HIGH",
          table: dt.name,
          schema: schemaName,
          column: colName,
          detail: `Drizzle has default, DB has no default for NOT NULL column`,
        });
      }
    }

    for (const [colName] of dbColMap) {
      if (!drizzleColMap.has(colName)) {
        issues.push({
          kind: "EXTRA_COLUMN_IN_DB",
          severity: "MEDIUM",
          table: dt.name,
          schema: schemaName,
          column: colName,
          detail: `DB has column ${colName} not in Drizzle schema`,
        });
      }
    }
  }

  for (const [dbKey, dbTable] of dbTables) {
    const [schemaName, tableName] = dbKey.split(".");
    const found = drizzleTables.some((dt) => (dt.schema || "public") === schemaName && dt.name === tableName);
    if (!found && (schemaName === "public" || schemaName === "directory_engine")) {
      issues.push({
        kind: "EXTRA_TABLE_IN_DB",
        severity: "LOW",
        table: tableName,
        schema: schemaName,
        detail: `DB has table ${dbKey} not in Drizzle schema`,
      });
    }
  }

  const report = { generatedAt: new Date().toISOString(), issues };
  fs.writeFileSync(
    path.join(REPORTS_DIR, "schema_drift_report.json"),
    JSON.stringify(report, null, 2)
  );
  return issues;
}

// --- Phase 4: Severity Ranking ---
function phase4SeverityRanking(issues: DriftIssue[]): string {
  const critical = issues.filter((i) => i.severity === "CRITICAL");
  const high = issues.filter((i) => i.severity === "HIGH");
  const medium = issues.filter((i) => i.severity === "MEDIUM");
  const low = issues.filter((i) => i.severity === "LOW");

  const lines: string[] = [
    "# Schema Drift — Ranked Report",
    "",
    `Generated: ${new Date().toISOString()}`,
    "",
    "## Summary",
    "",
    `| Severity | Count |`,
    `|----------|-------|`,
    `| CRITICAL | ${critical.length} |`,
    `| HIGH     | ${high.length} |`,
    `| MEDIUM   | ${medium.length} |`,
    `| LOW      | ${low.length} |`,
    `| **Total** | **${issues.length}** |`,
    "",
    "---",
    "",
  ];

  const bySev = [
    { label: "CRITICAL", items: critical },
    { label: "HIGH", items: high },
    { label: "MEDIUM", items: medium },
    { label: "LOW", items: low },
  ];

  for (const { label, items } of bySev) {
    if (items.length === 0) continue;
    lines.push(`## ${label} (${items.length})`);
    lines.push("");
    for (const i of items) {
      lines.push(`- **${i.kind}** | ${i.table ?? "-"} | ${i.column ?? "-"} | ${i.detail}`);
    }
    lines.push("");
  }

  const outPath = path.join(REPORTS_DIR, "schema_drift_ranked.md");
  fs.writeFileSync(outPath, lines.join("\n"));
  return outPath;
}

// --- Phase 5: Query Integrity Scan ---
function phase5QueryIntegrity(): string {
  const repoFiles = [
    "src/server/repos/jobPublicRepo.drizzle.ts",
    "src/services/routerJobService.ts",
    "app/api/public/jobs/recent/route.ts",
    "app/api/web/router/routable-jobs/route.ts",
    "app/api/web/router/routed-jobs/route.ts",
    "app/api/admin/jobs/route.ts",
    "app/api/jobs/[id]/route.ts",
  ];

  const drizzleTables = new Set<string>();
  const varToTable = new Map<string, string>();
  const drizzleColumns = new Map<string, Set<string>>();

  for (const [k, v] of Object.entries(schema)) {
    if (!v || typeof v !== "object") continue;
    try {
      const cfg = getTableConfig(v as any);
      drizzleTables.add(cfg.name);
      drizzleTables.add(k);
      varToTable.set(k, cfg.name);
      const colEntries = Object.entries((cfg as any).columns || {}) as [string, any][];
      const cols = new Set<string>();
      for (const [key, col] of colEntries) {
        cols.add(key);
        if (col?.name) cols.add(col.name);
      }
      drizzleColumns.set(cfg.name, cols);
      drizzleColumns.set(k, cols);
    } catch {
      // skip non-tables
    }
  }

  drizzleTables.add("jobHold");

  const lines: string[] = [
    "# Query Integrity Report",
    "",
    `Generated: ${new Date().toISOString()}`,
    "",
    "## Scanned Files",
    "",
    ...repoFiles.map((f) => `- \`${f}\``),
    "",
    "## Schema Reference (Drizzle)",
    "",
    `Tables: ${Array.from(drizzleTables).sort().join(", ")}`,
    "",
    "## Findings",
    "",
  ];

  const apiDir = path.join(__dirname, "..");
  let queryIssues = 0;

  for (const relPath of repoFiles) {
    const fullPath = path.join(apiDir, relPath);
    if (!fs.existsSync(fullPath)) {
      lines.push(`- \`${relPath}\`: file not found`);
      continue;
    }
    const content = fs.readFileSync(fullPath, "utf-8");

    const tableRefs =
      content.match(
        /\b(jobs|jobPhotos|users|routers|contractors|jobAssignments|auditLogs|jobPayments|jobPosters|routerProfiles|contractorAccounts|supportTickets|conversations|messages|ledgerEntries|escrows|payouts|payoutMethods|payoutRequests|adminUsers|adminSessions|sessions|stripeWebhookEvents|clerkWebhookEvents|transferRecords|disputeCases|disputeAlerts|disputeEvidence|disputeVotes|disputeEnforcementActions|internalAccountFlags|jobHold|jobHolds|jobFlags|jobDispatches|notificationDeliveries|monitoringEvents|sendQueue|sendCounters|routingHubs|adminRouterContexts|partsMaterialRequests|materialsRequests|materialsPayments|materialsEscrows|materialsItems|materialsReceiptFiles|materialsReceiptSubmissions|materialsEscrowLedgerEntries|contractorLedgerEntries|contractorPayouts|jobPosterCredits|repeatContractorRequests|routerRewards|directories|countryContext|regionalContext|submissions|backlinks)\b/g
      ) || [];
    const colRefs = content.match(/\b([a-zA-Z][a-zA-Z0-9]*\.\w+)\b/g) || [];
    const jsMethods = new Set(["map", "filter", "reduce", "find", "forEach", "length", "then", "catch", "finally"]);
    const colRefsFiltered = colRefs.filter((r) => {
      const col = r.split(".")[1];
      return col && !jsMethods.has(col);
    });

    const uniqueTables = [...new Set(tableRefs)];
    const missingTables = uniqueTables.filter((t) => !drizzleTables.has(t));
    const colMismatches: string[] = [];
    for (const ref of colRefsFiltered) {
      const [table, col] = ref.split(".");
      if (!drizzleTables.has(table)) continue;
      const cols = drizzleColumns.get(table);
      if (cols && col && !cols.has(col)) {
        colMismatches.push(ref);
      }
    }

    if (missingTables.length > 0 || colMismatches.length > 0) {
      lines.push(`### ${relPath}`);
      if (missingTables.length > 0) {
        lines.push(`- Tables not in Drizzle: ${missingTables.join(", ")}`);
        queryIssues++;
      }
      if (colMismatches.length > 0) {
        lines.push(`- Column refs possibly invalid: ${[...new Set(colMismatches)].slice(0, 10).join(", ")}${colMismatches.length > 10 ? "..." : ""}`);
        queryIssues++;
      }
      lines.push("");
    }
  }

  if (queryIssues === 0) {
    lines.push("No obvious query integrity issues detected (best-effort static scan).");
  }

  const outPath = path.join(REPORTS_DIR, "query_integrity_report.md");
  fs.writeFileSync(outPath, lines.join("\n"));
  return outPath;
}

// --- Phase 6: Hygiene Summary Dashboard ---
function phase6HygieneDashboard(issues: DriftIssue[]): number {
  const critical = issues.filter((i) => i.severity === "CRITICAL").length;
  const high = issues.filter((i) => i.severity === "HIGH").length;
  const medium = issues.filter((i) => i.severity === "MEDIUM").length;
  const low = issues.filter((i) => i.severity === "LOW").length;

  const penalty = critical * 25 + high * 10 + medium * 3 + low * 1;
  const score = Math.max(0, Math.min(100, 100 - penalty));

  const lines = [
    "",
    "═══════════════════════════════════════════════════════════════",
    "  SCHEMA HYGIENE DIAGNOSTIC — SUMMARY DASHBOARD",
    "═══════════════════════════════════════════════════════════════",
    "",
    `  OVERALL SCHEMA HEALTH: ${score} / 100`,
    "",
    `  Issues: ${issues.length} total`,
    `    CRITICAL: ${critical} (-25 each)`,
    `    HIGH:     ${high} (-10 each)`,
    `    MEDIUM:   ${medium} (-3 each)`,
    `    LOW:      ${low} (-1 each)`,
    "",
    `  Penalty: ${penalty} points`,
    "",
    "  Reports:",
    "    reports/db_structure_snapshot.json",
    "    reports/drizzle_schema_snapshot.json",
    "    reports/schema_drift_report.json",
    "    reports/schema_drift_ranked.md",
    "    reports/query_integrity_report.md",
    "",
    "═══════════════════════════════════════════════════════════════",
    "",
  ];

  console.log(lines.join("\n"));
  return score;
}

// --- Main ---
async function main(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL required (apps/api/.env.local)");
    process.exit(1);
  }

  const client = new Client({ connectionString: url });
  await client.connect();

  try {
    const dbSnapshot = await phase1DbStructure(client);
    await client.end();

    const drizzleSnapshot = phase2DrizzleSchema();
    const issues = phase3DriftDetection(dbSnapshot, drizzleSnapshot);
    phase4SeverityRanking(issues);
    phase5QueryIntegrity();
    phase6HygieneDashboard(issues);
  } finally {
    try {
      await client.end();
    } catch {}
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
