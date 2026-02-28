import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/server/db/drizzle";
import { toHttpError } from "../../../../src/http/errors";
import pkg from "../../../../package.json";

export const dynamic = "force-dynamic";

async function pingDbWithTimeout(timeoutMs: number): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`DB_TIMEOUT_${timeoutMs}MS`)), timeoutMs);
    db.execute(sql`select 1 as ok`)
      .then(() => {
        clearTimeout(timer);
        resolve();
      })
      .catch((error) => {
        clearTimeout(timer);
        reject(error);
      });
  });
}

export async function GET() {
  const startedAt = Date.now();
  try {
    // eslint-disable-next-line no-console
    console.info("[HEALTHZ_DB_START]", { startedAtIso: new Date(startedAt).toISOString() });
    await pingDbWithTimeout(3000);
    // eslint-disable-next-line no-console
    console.info("[HEALTHZ_DB_SUCCESS]", { elapsedMs: Date.now() - startedAt });
    return NextResponse.json({
      ok: true,
      service: "apps-api",
      db: "connected",
      elapsedMs: Date.now() - startedAt,
      uptime: Math.floor(process.uptime()),
      version: (pkg as any)?.version ?? "0.0.0",
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    const elapsedMs = Date.now() - startedAt;
    if (err instanceof Error && err.message === "DB_TIMEOUT_3000MS") {
      // eslint-disable-next-line no-console
      console.error("[HEALTHZ_DB_TIMEOUT]", { elapsedMs });
    }
    const { status, message, code, context } = toHttpError(err);
    return NextResponse.json(
      {
        ok: false,
        service: "apps-api",
        error: message,
        code,
        context,
        db: "error",
        elapsedMs,
        uptime: Math.floor(process.uptime()),
        version: (pkg as any)?.version ?? "0.0.0",
        timestamp: new Date().toISOString(),
      },
      { status: status || 500 },
    );
  }
}
