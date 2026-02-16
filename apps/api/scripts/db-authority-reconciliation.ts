/* eslint-disable no-console */
/**
 * DB Authority Reconciliation Audit
 *
 * - Treats Postgres as the single source of truth
 * - Introspects table structures + enums from Postgres
 * - Introspects Drizzle schema objects from apps/api/db/schema/*
 * - Outputs a structured mismatch report
 *
 * Run:
 *   DOTENV_CONFIG_PATH=.env.local pnpm -C apps/api tsx scripts/db-authority-reconciliation.ts
 */
import "dotenv/config";
import { Client } from "pg";
import { getTableConfig } from "drizzle-orm/pg-core";
import { adminUsers } from "../db/schema/adminUser";
import { auditLogs } from "../db/schema/auditLog";
import { contractors } from "../db/schema/contractor";
import * as enums from "../db/schema/enums";
import { jobs } from "../db/schema/job";
import { routers } from "../db/schema/router";
import { users } from "../db/schema/user";
import { DB_SCHEMA } from "../db/schema/_dbSchema";

type DbColumn = {
  schema: string;
  table: string;
  column: string;
  dataType: string; // information_schema.data_type
  udtName: string; // information_schema.udt_name (enum name if USER-DEFINED)
  isNullable: boolean;
  default: string | null;
  isEnum: boolean;
  enumLabels?: string[];
};

type DbTable = {
  schema: string;
  name: string;
  columns: DbColumn[];
  primaryKey: string[];
};

type DrizzleColumn = {
  column: string;
  notNull: boolean;
  hasDefault: boolean;
  sqlType: string;
};

type DrizzleTable = {
  name: string;
  schema: string | undefined;
  columns: DrizzleColumn[];
  primaryKey: string[];
};

function normalizeSqlType(t: string): string {
  return t
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/character varying/g, "varchar")
    .replace(/timestamp without time zone/g, "timestamp")
    .replace(/timestamp with time zone/g, "timestamptz");
}

function guessIsEnum(dataType: string, udtName: string): boolean {
  return dataType === "USER-DEFINED" && !!udtName && udtName !== "json" && udtName !== "jsonb";
}

async function loadDbTable(client: Client, schema: string, table: string): Promise<DbTable> {
  const colRes = await client.query<{
    table_schema: string;
    table_name: string;
    column_name: string;
    data_type: string;
    udt_name: string;
    is_nullable: "YES" | "NO";
    column_default: string | null;
  }>(
    `
    select table_schema, table_name, column_name, data_type, udt_name, is_nullable, column_default
    from information_schema.columns
    where table_schema = $1 and table_name = $2
    order by ordinal_position asc;
  `,
    [schema, table],
  );

  const columns: DbColumn[] = [];
  for (const r of colRes.rows) {
    const isEnum = guessIsEnum(r.data_type, r.udt_name);
    columns.push({
      schema: r.table_schema,
      table: r.table_name,
      column: r.column_name,
      dataType: r.data_type,
      udtName: r.udt_name,
      isNullable: r.is_nullable === "YES",
      default: r.column_default,
      isEnum,
    });
  }

  // primary key columns
  const pkRes = await client.query<{ cols: string[] }>(
    `
    select array_agg(a.attname order by x.ord) as cols
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    join lateral unnest(c.conkey) with ordinality as x(attnum, ord) on true
    join pg_attribute a on a.attrelid = t.oid and a.attnum = x.attnum
    where c.contype = 'p' and n.nspname = $1 and t.relname = $2
    group by c.oid;
  `,
    [schema, table],
  );
  const primaryKey = pkRes.rows[0]?.cols ?? [];

  // enum labels per enum column
  for (const c of columns) {
    if (!c.isEnum) continue;
    const enumRes = await client.query<{ label: string }>(
      `
      select e.enumlabel as label
      from pg_type t
      join pg_namespace n on n.oid = t.typnamespace
      join pg_enum e on e.enumtypid = t.oid
      where n.nspname = $1 and t.typname = $2
      order by e.enumsortorder asc;
    `,
      [schema, c.udtName],
    );
    c.enumLabels = enumRes.rows.map((x) => x.label);
  }

  return { schema, name: table, columns, primaryKey };
}

function loadDrizzleTable(t: any): DrizzleTable {
  const cfg = getTableConfig(t);
  const cols: DrizzleColumn[] = Object.entries(cfg.columns).map(([key, col]: any) => {
    const name = col?.name ?? key;
    const notNull = Boolean(col?.notNull);
    const hasDefault = Boolean(col?.hasDefault);
    const sqlType = typeof col?.getSQLType === "function" ? String(col.getSQLType()) : String(col?.dataType ?? "");
    return { column: name, notNull, hasDefault, sqlType: normalizeSqlType(sqlType) };
  });

  const pk = (cfg.primaryKeys?.[0]?.columns ?? []).map((c: any) => String(c?.name ?? ""));
  return {
    name: cfg.name,
    schema: (cfg as any).schema,
    columns: cols.sort((a, b) => a.column.localeCompare(b.column)),
    primaryKey: pk,
  };
}

function drizzleEnumsSummary(): Array<{ name: string; values: string[] }> {
  const out: Array<{ name: string; values: string[] }> = [];
  for (const [k, v] of Object.entries(enums)) {
    // pgEnum returns a function with metadata properties
    const anyV: any = v as any;
    if (!anyV) continue;
    const enumName = anyV.enumName ?? anyV?.[Symbol.for("drizzle:PgEnum")]?.enumName;
    const enumValues = anyV.enumValues ?? anyV?.[Symbol.for("drizzle:PgEnum")]?.enumValues;
    if (typeof enumName === "string" && Array.isArray(enumValues)) {
      out.push({ name: enumName, values: enumValues.map(String) });
    } else if (k.endsWith("Enum") && typeof anyV === "function") {
      // best-effort fallback
      if (typeof anyV.enumName === "string" && Array.isArray(anyV.enumValues)) {
        out.push({ name: anyV.enumName, values: anyV.enumValues.map(String) });
      }
    }
  }
  // stable
  out.sort((a, b) => a.name.localeCompare(b.name));
  // de-dupe by name (keep first)
  const seen = new Set<string>();
  return out.filter((e) => (seen.has(e.name) ? false : (seen.add(e.name), true)));
}

function diffTables(db: DbTable, dz: DrizzleTable) {
  const mismatches: any[] = [];

  const dbCols = new Map(db.columns.map((c) => [c.column, c]));
  const dzCols = new Map(dz.columns.map((c) => [c.column, c]));

  for (const [name, c] of dbCols) {
    if (!dzCols.has(name)) {
      mismatches.push({ type: "MISSING_IN_DRIZZLE", column: name, db: c });
    }
  }
  for (const [name, c] of dzCols) {
    if (!dbCols.has(name)) {
      mismatches.push({ type: "MISSING_IN_DB", column: name, drizzle: c });
    }
  }

  for (const [name, dbc] of dbCols) {
    const dzc = dzCols.get(name);
    if (!dzc) continue;

    const dbNotNull = !dbc.isNullable;
    if (dbNotNull !== dzc.notNull) {
      mismatches.push({ type: "NULLABILITY_MISMATCH", column: name, dbNotNull, drizzleNotNull: dzc.notNull });
    }

    // defaults: treat any DB default as “has default”
    const dbHasDefault = Boolean(dbc.default);
    if (dbHasDefault !== dzc.hasDefault) {
      mismatches.push({ type: "DEFAULT_PRESENCE_MISMATCH", column: name, dbDefault: dbc.default, drizzleHasDefault: dzc.hasDefault });
    }

    // type check:
    // - For enums, Drizzle reports SQL type as the enum type name (often lowercased).
    // - Treat enum name casing differences as equivalent.
    const dzTypeNorm = normalizeSqlType(dzc.sqlType);
    if (dbc.dataType === "ARRAY") {
      // information_schema uses data_type=ARRAY and udt_name like "_text" or "_TradeCategory"
      const dbElem = String(dbc.udtName ?? "").startsWith("_") ? String(dbc.udtName).slice(1) : String(dbc.udtName ?? "");
      const dz = dzTypeNorm;
      if (!dz.endsWith("[]")) {
        mismatches.push({
          type: "TYPE_MISMATCH",
          column: name,
          dbType: { dataType: dbc.dataType, udtName: dbc.udtName },
          drizzleSqlType: dzc.sqlType,
        });
      } else {
        const dzElem = dz.slice(0, -2);
        if (normalizeSqlType(dbElem) !== normalizeSqlType(dzElem)) {
          mismatches.push({
            type: "TYPE_MISMATCH",
            column: name,
            dbType: { dataType: dbc.dataType, udtName: dbc.udtName },
            drizzleSqlType: dzc.sqlType,
          });
        }
      }
    } else if (dbc.dataType === "USER-DEFINED") {
      const dbEnum = String(dbc.udtName ?? "").trim();
      if (dbEnum && dzTypeNorm && dzTypeNorm !== normalizeSqlType(dbEnum)) {
        mismatches.push({
          type: "TYPE_MISMATCH",
          column: name,
          dbType: { dataType: dbc.dataType, udtName: dbc.udtName },
          drizzleSqlType: dzc.sqlType,
        });
      }
    } else {
      const dbTypeNorm = normalizeSqlType(dbc.dataType);
      if (dbTypeNorm && dzTypeNorm && dbTypeNorm !== dzTypeNorm) {
        mismatches.push({
          type: "TYPE_MISMATCH",
          column: name,
          dbType: { dataType: dbc.dataType, udtName: dbc.udtName },
          drizzleSqlType: dzc.sqlType,
        });
      }
    }
  }

  const dbPk = Array.isArray(db.primaryKey) ? db.primaryKey.slice().sort() : [];
  const dzPk = Array.isArray(dz.primaryKey) ? dz.primaryKey.slice().sort() : [];
  if (JSON.stringify(dbPk) !== JSON.stringify(dzPk)) {
    mismatches.push({ type: "PRIMARY_KEY_MISMATCH", dbPk, drizzlePk: dzPk });
  }

  return mismatches;
}

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL missing");

  const client = new Client({ connectionString: databaseUrl });
  await client.connect();

  const targetSchema = DB_SCHEMA;
  const targets = [
    { label: "User", dbName: "User", drizzle: users },
    { label: "AdminUser", dbName: "AdminUser", drizzle: adminUsers },
    { label: "Job", dbName: "Job", drizzle: jobs },
    { label: "AuditLog", dbName: "AuditLog", drizzle: auditLogs },
    // DB table name is pluralized/lowercase.
    { label: "Router", dbName: "routers", drizzle: routers },
    { label: "Contractor", dbName: "Contractor", drizzle: contractors },
  ] as const;

  const dbTables: Record<string, DbTable> = {};
  for (const t of targets) {
    dbTables[t.label] = await loadDbTable(client, targetSchema, t.dbName);
  }

  // all enums in DB schema
  const dbEnumsRes = await client.query<{ enum_name: string; label: string; sort: number }>(
    `
    select t.typname as enum_name, e.enumlabel as label, e.enumsortorder as sort
    from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    join pg_enum e on e.enumtypid = t.oid
    where n.nspname = $1
    order by enum_name asc, sort asc;
  `,
    [targetSchema],
  );
  const dbEnumsMap = new Map<string, string[]>();
  for (const r of dbEnumsRes.rows) {
    if (!dbEnumsMap.has(r.enum_name)) dbEnumsMap.set(r.enum_name, []);
    dbEnumsMap.get(r.enum_name)!.push(r.label);
  }
  const dbEnums = [...dbEnumsMap.entries()].map(([name, values]) => ({ name, values }));

  // drizzle structures
  const drizzleTables: Record<string, DrizzleTable> = {};
  for (const t of targets) drizzleTables[t.label] = loadDrizzleTable(t.drizzle);

  const drizzleEnums = drizzleEnumsSummary();

  const mismatches: Record<string, any[]> = {};
  for (const t of targets) mismatches[t.label] = diffTables(dbTables[t.label], drizzleTables[t.label]);

  // enum mismatches (values only; casing matters)
  const enumMismatches: any[] = [];
  const drizzleEnumMap = new Map(drizzleEnums.map((e) => [e.name, e.values]));
  for (const { name, values } of dbEnums) {
    const dzVals = drizzleEnumMap.get(name);
    if (!dzVals) {
      enumMismatches.push({ type: "ENUM_MISSING_IN_DRIZZLE", enum: name, dbValues: values });
      continue;
    }
    if (JSON.stringify(values) !== JSON.stringify(dzVals)) {
      enumMismatches.push({ type: "ENUM_VALUES_MISMATCH", enum: name, dbValues: values, drizzleValues: dzVals });
    }
  }
  for (const { name, values } of drizzleEnums) {
    const dbVals = dbEnumsMap.get(name);
    if (!dbVals) enumMismatches.push({ type: "ENUM_MISSING_IN_DB", enum: name, drizzleValues: values });
  }

  console.log(
    JSON.stringify(
      {
        meta: {
          dbSchema: targetSchema,
          databaseUrlHasSchemaParam: new URL(databaseUrl).searchParams.get("schema") ?? null,
        },
        db: {
          tables: dbTables,
          enums: dbEnums,
        },
        drizzle: {
          tables: drizzleTables,
          enums: drizzleEnums,
        },
        diff: {
          tables: mismatches,
          enums: enumMismatches,
        },
      },
      null,
      2,
    ),
  );

  await client.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

