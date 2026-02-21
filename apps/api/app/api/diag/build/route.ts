import { NextResponse } from "next/server";
import { DB_SCHEMA } from "@/db/schema/_dbSchema";

function parseSchemaFromDatabaseUrl(databaseUrl: string | undefined): string | null {
  const raw = String(databaseUrl ?? "").trim();
  if (!raw) return null;
  try {
    const u = new URL(raw);
    return u.searchParams.get("schema");
  } catch {
    return null;
  }
}

export async function GET() {
  const schemaParam = parseSchemaFromDatabaseUrl(process.env.DATABASE_URL);
  return NextResponse.json({
    commitSha: process.env.VERCEL_GIT_COMMIT_SHA ?? null,
    vercelEnv: process.env.VERCEL_ENV ?? null,
    runtimeSchema: DB_SCHEMA,
    dbUrlHasSchemaParam: schemaParam !== null,
    dbSchemaParamValue: schemaParam,
  });
}
