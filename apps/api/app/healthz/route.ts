import { NextResponse } from "next/server";
import { pool } from "@/src/server/db/drizzle";

const HEALTHZ_MODULE_LOADED_AT = Date.now();
// eslint-disable-next-line no-console
console.info("[HEALTHZ_MODULE_LOAD]", { loadedAtIso: new Date(HEALTHZ_MODULE_LOADED_AT).toISOString() });

function parsePositiveInt(value: string | undefined, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

function getDbRuntimeHint() {
  const raw = String(process.env.DATABASE_URL ?? "").trim();
  if (!raw) {
    return {
      databaseUrlPresent: false,
      hostMasked: null,
      sslMode: null,
      sslEnabled: null,
    };
  }
  try {
    const u = new URL(raw);
    const host = String(u.hostname ?? "").trim();
    const hostMasked = host ? `${host.slice(0, 3)}***${host.slice(-6)}` : null;
    const sslMode = String(u.searchParams.get("sslmode") ?? "").trim() || null;
    return {
      databaseUrlPresent: true,
      hostMasked,
      sslMode,
      sslEnabled: sslMode ? sslMode.toLowerCase() !== "disable" : null,
    };
  } catch {
    return {
      databaseUrlPresent: true,
      hostMasked: "(parse_failed)",
      sslMode: null,
      sslEnabled: null,
    };
  }
}

async function pingDb(timeoutMs: number) {
  const startedAt = Date.now();
  try {
    await new Promise<void>(async (resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`db_ping_timeout_${timeoutMs}ms`)), timeoutMs);
      try {
        await pool.query("select 1 as ok");
        clearTimeout(timer);
        resolve();
      } catch (error) {
        clearTimeout(timer);
        reject(error);
      }
    });
    return {
      ok: true,
      elapsedMs: Date.now() - startedAt,
      timeoutMs,
      error: null as string | null,
    };
  } catch (error) {
    return {
      ok: false,
      elapsedMs: Date.now() - startedAt,
      timeoutMs,
      error: error instanceof Error ? error.message : "db_ping_failed",
    };
  }
}

export const dynamic = "force-dynamic";

export async function GET() {
  const startedAt = Date.now();
  const dbTimeoutMs = parsePositiveInt(process.env.HEALTHZ_DB_TIMEOUT_MS, 2000);
  const dbRuntime = getDbRuntimeHint();

  // eslint-disable-next-line no-console
  console.info("[HEALTHZ] start", {
    startedAtIso: new Date(startedAt).toISOString(),
    moduleLoadedAtIso: new Date(HEALTHZ_MODULE_LOADED_AT).toISOString(),
    dbTimeoutMs,
  });
  // eslint-disable-next-line no-console
  console.info("[HEALTHZ] before_db_ping", {
    databaseUrlPresent: dbRuntime.databaseUrlPresent,
    sslEnabled: dbRuntime.sslEnabled,
  });

  const dbPing = await pingDb(dbTimeoutMs);

  // eslint-disable-next-line no-console
  console.info("[HEALTHZ] after_db_ping", dbPing);

  const body = {
    ok: dbPing.ok,
    service: "api",
    time: new Date().toISOString(),
    elapsedMs: Date.now() - startedAt,
    db: {
      pingOk: dbPing.ok,
      pingElapsedMs: dbPing.elapsedMs,
      pingTimeoutMs: dbPing.timeoutMs,
      error: dbPing.error,
      runtime: dbRuntime,
    },
  };

  // eslint-disable-next-line no-console
  console.info("[HEALTHZ] end", {
    ok: body.ok,
    elapsedMs: body.elapsedMs,
  });

  return NextResponse.json(body, {
    status: body.ok ? 200 : 503,
    headers: { "cache-control": "no-store" },
  });
}
