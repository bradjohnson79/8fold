import { NextResponse } from "next/server";
import { DB_SCHEMA } from "@/db/schema/_dbSchema";

const DIAG_BUILD_MODULE_LOADED_AT = Date.now();
// eslint-disable-next-line no-console
console.info("[DIAG_BUILD_MODULE_LOAD]", { loadedAtIso: new Date(DIAG_BUILD_MODULE_LOADED_AT).toISOString() });

export const dynamic = "force-dynamic";

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
  const startedAt = Date.now();
  // eslint-disable-next-line no-console
  console.info("[DIAG_BUILD] start", {
    startedAtIso: new Date(startedAt).toISOString(),
    moduleLoadedAtIso: new Date(DIAG_BUILD_MODULE_LOADED_AT).toISOString(),
  });

  const schemaParam = parseSchemaFromDatabaseUrl(process.env.DATABASE_URL);
  const response = {
    commitSha: process.env.VERCEL_GIT_COMMIT_SHA ?? null,
    vercelEnv: process.env.VERCEL_ENV ?? null,
    runtimeSchema: DB_SCHEMA,
    dbUrlHasSchemaParam: schemaParam !== null,
    dbSchemaParamValue: schemaParam,
    elapsedMs: Date.now() - startedAt,
  };

  // eslint-disable-next-line no-console
  console.info("[DIAG_BUILD] end", { elapsedMs: response.elapsedMs });

  return NextResponse.json(response, { headers: { "cache-control": "no-store" } });
}
