import { NextResponse } from "next/server";

const NOOP_MODULE_LOADED_AT = Date.now();
// eslint-disable-next-line no-console
console.info("[NOOP_MODULE_LOAD]", { loadedAtIso: new Date(NOOP_MODULE_LOADED_AT).toISOString() });

export const dynamic = "force-dynamic";

export async function GET() {
  const startedAt = Date.now();
  // eslint-disable-next-line no-console
  console.info("[NOOP] start", {
    startedAtIso: new Date(startedAt).toISOString(),
    moduleLoadedAtIso: new Date(NOOP_MODULE_LOADED_AT).toISOString(),
  });

  const response = {
    ok: true,
    service: "api",
    endpoint: "noop",
    elapsedMs: Date.now() - startedAt,
    time: new Date().toISOString(),
  };

  // eslint-disable-next-line no-console
  console.info("[NOOP] end", { elapsedMs: response.elapsedMs });

  return NextResponse.json(response, { headers: { "cache-control": "no-store" } });
}
