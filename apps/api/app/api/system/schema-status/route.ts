import { NextResponse } from "next/server";
import { pool } from "@/server/db/drizzle";
import { generateMigrationPatch, inspectSchema } from "@/src/services/schema/schemaGuard";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const report = await inspectSchema(pool, "directory_engine");
    return NextResponse.json({
      status: report.status,
      schema: report.schema,
      missing_columns: report.missingColumns,
      tables: report.tables.map((table) => ({
        table: table.table,
        missing_columns: table.missingColumns,
      })),
      migration_patch: generateMigrationPatch(report),
    });
  } catch (err) {
    return NextResponse.json(
      {
        status: "error",
        error: err instanceof Error ? err.message : String(err),
        missing_columns: [],
      },
      { status: 500 }
    );
  }
}
