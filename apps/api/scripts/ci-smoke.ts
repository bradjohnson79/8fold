/**
 * CI smoke test (no DB mutation).
 *
 * Verifies that:
 * - apps/api is reachable and healthy
 * - apps/web proxy to system health is reachable
 *
 * Usage:
 *   API_ORIGIN=http://localhost:3003 WEB_ORIGIN=http://localhost:3006 pnpm -C apps/api run ci:smoke
 */
function mustEnv(name: string): string {
  const v = String(process.env[name] ?? "").trim().replace(/\/+$/, "");
  if (!v) throw new Error(`${name} is not set`);
  return v;
}

async function httpJson(url: string, init?: RequestInit): Promise<{ status: number; json: any; text: string }> {
  const resp = await fetch(url, { ...init, cache: "no-store" });
  const text = await resp.text().catch(() => "");
  let json: any = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  return { status: resp.status, json, text };
}

function assertOk(name: string, r: { status: number; json: any; text: string }) {
  const ok = r.status >= 200 && r.status < 300 && r.json && typeof r.json === "object" && r.json.ok === true;
  if (!ok) {
    const body = r.json && typeof r.json === "object" ? JSON.stringify(r.json).slice(0, 800) : r.text.slice(0, 800);
    throw new Error(`${name} failed: status=${r.status} body=${body}`);
  }
}

async function main() {
  const API_ORIGIN = mustEnv("API_ORIGIN");
  const WEB_ORIGIN = mustEnv("WEB_ORIGIN");

  const apiSystem = await httpJson(`${API_ORIGIN}/api/system/health`);
  assertOk("api.system.health", apiSystem);

  const apiHealth = await httpJson(`${API_ORIGIN}/api/health`);
  // legacy health endpoint also expected to be ok:true
  if (!(apiHealth.status >= 200 && apiHealth.status < 300)) {
    throw new Error(`api.health failed: status=${apiHealth.status} body=${apiHealth.text.slice(0, 800)}`);
  }

  const webSystem = await httpJson(`${WEB_ORIGIN}/api/app/system/health`);
  assertOk("web.api.app.system.health", webSystem);

  const webHealth = await httpJson(`${WEB_ORIGIN}/api/health`);
  if (!(webHealth.status >= 200 && webHealth.status < 300)) {
    throw new Error(`web.health failed: status=${webHealth.status} body=${webHealth.text.slice(0, 800)}`);
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        api: { systemHealth: apiSystem.json, health: apiHealth.json ?? null },
        web: { systemHealth: webSystem.json, health: webHealth.json ?? null },
        ts: new Date().toISOString(),
      },
      null,
      2,
    ),
  );
}

main().catch((err) => {
  console.error(String((err as any)?.message ?? err));
  process.exit(1);
});

