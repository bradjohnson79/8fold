import { getSchemaColumnSpec, schemaContract, schemaTables, type SchemaTableName } from "@/src/schema/schemaContract";

type QueryResultRow = {
  column_name: string;
  data_type?: string;
  is_nullable?: string;
};

type ColumnTypeMismatch = {
  column: string;
  expected: string;
  actual: string;
};

type ColumnNullabilityMismatch = {
  column: string;
  expected: "YES" | "NO";
  actual: "YES" | "NO";
};

export type Queryable = {
  query: (text: string, values?: unknown[]) => Promise<{ rows: QueryResultRow[] }>;
};

export type TableSchemaStatus = {
  table: SchemaTableName;
  requiredColumns: string[];
  existingColumns: string[];
  missingColumns: string[];
  typeMismatches: ColumnTypeMismatch[];
  nullabilityMismatches: ColumnNullabilityMismatch[];
};

export type SchemaGuardReport = {
  status: "ok" | "error";
  schema: string;
  tables: TableSchemaStatus[];
  missingColumns: string[];
  mismatchedColumns: string[];
};

type ValidateSchemaOptions = {
  schema?: string;
  failOnMismatch?: boolean;
  autoApplyPatch?: boolean;
  logger?: Pick<Console, "log" | "warn" | "error">;
};

function getFailOnMismatch(): boolean {
  return process.env.NODE_ENV === "production" || process.env.CI === "true";
}

function getAutoApplyPatch(): boolean {
  return process.env.AUTO_APPLY_SCHEMA_PATCH === "true" && process.env.NODE_ENV !== "production";
}

type TableColumnShape = {
  dataType: string;
  isNullable: "YES" | "NO";
};

function normalizeDataType(type: string | undefined): string {
  switch ((type ?? "").toLowerCase()) {
    case "timestamp with time zone":
      return "timestamptz";
    default:
      return (type ?? "").toLowerCase();
  }
}

export async function getTableColumns(
  queryable: Queryable,
  table: SchemaTableName,
  schema = "directory_engine"
): Promise<Record<string, TableColumnShape>> {
  const result = await queryable.query(
    `SELECT column_name, data_type, is_nullable
     FROM information_schema.columns
     WHERE table_schema = $1 AND table_name = $2
     ORDER BY ordinal_position`,
    [schema, table]
  );
  return Object.fromEntries(
    (result.rows ?? []).map((row) => [
      row.column_name,
      {
        dataType: normalizeDataType(row.data_type),
        isNullable: row.is_nullable === "NO" ? "NO" : "YES",
      },
    ])
  );
}

export async function inspectSchema(
  queryable: Queryable,
  schema = "directory_engine"
): Promise<SchemaGuardReport> {
  const tables: TableSchemaStatus[] = [];

  for (const table of schemaTables) {
    const tableColumns = await getTableColumns(queryable, table, schema);
    const existingColumns = Object.keys(tableColumns);
    const requiredColumns = schemaContract[table];
    const existingSet = new Set(existingColumns);
    const missingColumns = requiredColumns.filter((column) => !existingSet.has(column));
    const typeMismatches = requiredColumns.flatMap((column) => {
      const actual = tableColumns[column];
      if (!actual) return [];
      const expected = normalizeDataType(getSchemaColumnSpec(table, column).type);
      return actual.dataType === expected
        ? []
        : [{ column, expected, actual: actual.dataType }];
    });
    const nullabilityMismatches = requiredColumns.flatMap((column) => {
      const actual = tableColumns[column];
      if (!actual) return [];
      const expected: "YES" | "NO" = getSchemaColumnSpec(table, column).nullable === false ? "NO" : "YES";
      return actual.isNullable === expected
        ? []
        : [{ column, expected, actual: actual.isNullable }];
    });

    tables.push({
      table,
      requiredColumns,
      existingColumns,
      missingColumns,
      typeMismatches,
      nullabilityMismatches,
    });
  }

  const missingColumns = tables.flatMap((table) =>
    table.missingColumns.map((column) => `${table.table}.${column}`)
  );
  const mismatchedColumns = tables.flatMap((table) => [
    ...table.typeMismatches.map((column) => `${table.table}.${column.column}`),
    ...table.nullabilityMismatches.map((column) => `${table.table}.${column.column}`),
  ]);

  return {
    status: missingColumns.length === 0 && mismatchedColumns.length === 0 ? "ok" : "error",
    schema,
    tables,
    missingColumns,
    mismatchedColumns,
  };
}

function buildAddColumnSql(table: SchemaTableName, column: string): string {
  const spec = getSchemaColumnSpec(table, column);
  const parts = [
    `ADD COLUMN IF NOT EXISTS ${column} ${spec.type}`,
  ];

  if (spec.defaultSql !== undefined) {
    parts.push(`DEFAULT ${spec.defaultSql}`);
  }
  if (spec.nullable === false) {
    parts.push("NOT NULL");
  }

  return parts.join(" ");
}

export function generateMigrationPatch(report: SchemaGuardReport): string {
  const statements = report.tables
    .filter((table) => table.missingColumns.length > 0)
    .map((table) => {
      const addColumns = table.missingColumns
        .map((column) => `  ${buildAddColumnSql(table.table, column)}`)
        .join(",\n");
      return `ALTER TABLE IF EXISTS directory_engine.${table.table}\n${addColumns};`;
    });

  return statements.join("\n\n");
}

export function formatSchemaMismatch(report: SchemaGuardReport): string {
  const lines = ["Schema mismatch detected:"];
  for (const table of report.tables) {
    if (
      table.missingColumns.length === 0 &&
      table.typeMismatches.length === 0 &&
      table.nullabilityMismatches.length === 0
    ) {
      continue;
    }
    lines.push(`- ${table.table}`);
    for (const column of table.missingColumns) {
      lines.push(`  - ${column}`);
    }
    for (const mismatch of table.typeMismatches) {
      lines.push(`  - ${mismatch.column} (type: expected ${mismatch.expected}, got ${mismatch.actual})`);
    }
    for (const mismatch of table.nullabilityMismatches) {
      lines.push(`  - ${mismatch.column} (nullability: expected ${mismatch.expected}, got ${mismatch.actual})`);
    }
  }
  return lines.join("\n");
}

async function applySchemaPatch(queryable: Queryable, report: SchemaGuardReport): Promise<void> {
  const patch = generateMigrationPatch(report);
  if (!patch.trim()) return;
  await queryable.query(patch);
}

export async function validateSchema(
  queryable: Queryable,
  options: ValidateSchemaOptions = {}
): Promise<SchemaGuardReport> {
  const schema = options.schema ?? "directory_engine";
  const failOnMismatch = options.failOnMismatch ?? getFailOnMismatch();
  const autoApplyPatch = options.autoApplyPatch ?? getAutoApplyPatch();
  const logger = options.logger ?? console;

  logger.log("[SchemaGuard] Checking schema");
  let report = await inspectSchema(queryable, schema);

  if (report.status === "error" && autoApplyPatch) {
    logger.warn("[SchemaGuard] Schema drift detected, auto-applying patch for missing columns");
    await applySchemaPatch(queryable, report);
    report = await inspectSchema(queryable, schema);
  }

  if (report.status === "error") {
    const message = `${formatSchemaMismatch(report)}\n\nGenerated patch:\n${generateMigrationPatch(report)}`;
    logger.error("[SchemaGuard] Schema drift detected");
    if (failOnMismatch) {
      throw new Error(message);
    }
    logger.warn(message);
    return report;
  }

  logger.log("[SchemaGuard] Schema valid");
  return report;
}
