#!/usr/bin/env tsx
/**
 * Schema audit for canonical normalization pass.
 *
 * - Lists all tables in public schema
 * - Detects case-sensitive duplicates
 * - Detects singular/plural duplicates (e.g. Job vs jobs)
 * - Detects quoted camelCase column names
 *
 * Run: pnpm -C apps/api exec tsx scripts/auditSchema.ts
 * Or:  cd apps/api && pnpm exec tsx scripts/auditSchema.ts
 */

import dotenv from "dotenv";
import { Client } from "pg";
import path from "node:path";

dotenv.config({ path: path.join(process.cwd(), ".env.local") });

const SCHEMA = "public";

function isSnakeCase(s: string): boolean {
  return /^[a-z][a-z0-9_]*$/.test(s);
}

function isPluralSnakeCase(s: string): boolean {
  return isSnakeCase(s) && s.length > 1;
}

function isQuotedCamelCase(s: string): boolean {
  // PostgreSQL folds unquoted identifiers to lowercase.
  // If the stored name has uppercase or mixed case, it was created with quotes.
  return s !== s.toLowerCase() || /[A-Z]/.test(s);
}

function toSnakeCase(s: string): string {
  return s
    .replace(/([A-Z])/g, "_$1")
    .toLowerCase()
    .replace(/^_/, "");
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url?.trim()) {
    throw new Error("DATABASE_URL required (set in apps/api/.env.local)");
  }

  const client = new Client({ connectionString: url });
  await client.connect();

  const report: {
    tables: Array<{ schema: string; name: string; isSingular: boolean; isPascalCase: boolean; isSnakeCase: boolean }>;
    caseSensitiveDuplicates: string[];
    singularPluralDuplicates: Array<{ singular: string; plural: string }>;
    camelCaseColumns: Array<{ table: string; column: string; suggested: string }>;
    summary: Record<string, unknown>;
  } = {
    tables: [],
    caseSensitiveDuplicates: [],
    singularPluralDuplicates: [],
    camelCaseColumns: [],
    summary: {},
  };

  // 1) List all tables in public schema
  const tablesRes = await client.query<{ table_schema: string; table_name: string }>(
    `SELECT table_schema, table_name
     FROM information_schema.tables
     WHERE table_schema = $1
       AND table_type = 'BASE TABLE'
     ORDER BY table_name`,
    [SCHEMA],
  );

  const tableNames = tablesRes.rows.map((r) => r.table_name);
  for (const name of tableNames) {
    const lower = name.toLowerCase();
    const isSnake = isSnakeCase(name);
    const isPascal = /^[A-Z][a-zA-Z0-9]*$/.test(name) && !isSnake;
    const isSingular = isPascal || (isSnake && !name.endsWith("s"));
    report.tables.push({
      schema: SCHEMA,
      name,
      isSingular,
      isPascalCase: isPascal,
      isSnakeCase: isSnake,
    });
  }

  // 2) Case-sensitive duplicates: same name when lowercased
  const byLower = new Map<string, string[]>();
  for (const n of tableNames) {
    const k = n.toLowerCase();
    if (!byLower.has(k)) byLower.set(k, []);
    byLower.get(k)!.push(n);
  }
  for (const [lower, names] of byLower) {
    if (names.length > 1) {
      report.caseSensitiveDuplicates.push(...names);
    }
  }

  // 3) Singular/plural duplicates: e.g. Job vs jobs
  const singularCandidates = tableNames.filter((n) => /^[A-Z]/.test(n) || (isSnakeCase(n) && !n.endsWith("s")));
  const pluralCandidates = tableNames.filter((n) => isSnakeCase(n) && n.endsWith("s"));
  for (const singular of singularCandidates) {
    const pluralForm = singular.endsWith("s") ? singular : `${toSnakeCase(singular)}s`;
    const exact = pluralCandidates.find((p) => p === pluralForm);
    const singularToPlural = toSnakeCase(singular);
    if (exact || pluralCandidates.includes(singularToPlural)) {
      const plural = exact ?? singularToPlural;
      if (singular !== plural) {
        report.singularPluralDuplicates.push({ singular, plural });
      }
    }
  }
  // Also check: "Job" singular, do we have "jobs"?
  for (const t of report.tables) {
    if (t.isPascalCase && t.name !== "Job") continue;
    const targetPlural = toSnakeCase(t.name) + (t.name.endsWith("s") ? "" : "s");
    if (tableNames.includes(targetPlural) && t.name !== targetPlural) {
      const exists = report.singularPluralDuplicates.some(
        (d) => (d.singular === t.name && d.plural === targetPlural) || (d.plural === t.name && d.singular === targetPlural),
      );
      if (!exists) {
        report.singularPluralDuplicates.push({ singular: t.name, plural: targetPlural });
      }
    }
  }
  // Dedupe
  report.singularPluralDuplicates = report.singularPluralDuplicates.filter(
    (d, i, arr) => arr.findIndex((x) => x.singular === d.singular && x.plural === d.plural) === i,
  );

  // 4) Quoted camelCase column names
  const colsRes = await client.query<{ table_name: string; column_name: string }>(
    `SELECT table_name, column_name
     FROM information_schema.columns
     WHERE table_schema = $1
     ORDER BY table_name, ordinal_position`,
    [SCHEMA],
  );

  for (const row of colsRes.rows) {
    if (isQuotedCamelCase(row.column_name)) {
      report.camelCaseColumns.push({
        table: row.table_name,
        column: row.column_name,
        suggested: toSnakeCase(row.column_name),
      });
    }
  }

  // Summary
  report.summary = {
    totalTables: report.tables.length,
    pascalCaseTables: report.tables.filter((t) => t.isPascalCase).length,
    snakeCaseTables: report.tables.filter((t) => t.isSnakeCase).length,
    caseSensitiveDuplicatesCount: report.caseSensitiveDuplicates.length,
    singularPluralDuplicatesCount: report.singularPluralDuplicates.length,
    camelCaseColumnsCount: report.camelCaseColumns.length,
    hasLegacyNaming: report.caseSensitiveDuplicates.length > 0 || report.singularPluralDuplicates.length > 0 || report.camelCaseColumns.length > 0,
  };

  await client.end();

  // Output
  console.log(JSON.stringify(report, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
