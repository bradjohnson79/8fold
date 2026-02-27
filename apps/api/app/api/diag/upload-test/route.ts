import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/db/drizzle";

export const runtime = "nodejs";

function isVercelRuntime(): boolean {
  return String(process.env.VERCEL ?? "").trim() === "1";
}

export async function GET() {
  const blobTokenPresent = Boolean(String(process.env.BLOB_READ_WRITE_TOKEN ?? "").trim());
  const vercelRuntime = isVercelRuntime();
  const nodeEnv = String(process.env.NODE_ENV ?? "").trim().toLowerCase();
  const shouldUseBlob = blobTokenPresent || vercelRuntime || nodeEnv === "production";

  let dbOk = false;
  let dbError: string | null = null;
  try {
    await db.execute(sql`select 1 as ok`);
    dbOk = true;
  } catch (err) {
    dbOk = false;
    dbError = err instanceof Error ? err.message : String(err);
  }

  const configError = shouldUseBlob && !blobTokenPresent
    ? "BLOB_READ_WRITE_TOKEN missing while upload path expects blob storage"
    : null;

  const ok = dbOk && !configError;

  return NextResponse.json(
    {
      ok,
      runtime: "nodejs",
      vercelRuntime,
      nodeEnv,
      blobTokenPresent,
      shouldUseBlob,
      dbOk,
      dbError,
      configError,
    },
    { status: ok ? 200 : 500 },
  );
}
