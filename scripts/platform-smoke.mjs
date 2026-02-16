/**
 * Platform smoke (pre-deploy).
 *
 * Matrix:
 * - health (apps/api + apps/web proxy)
 * - login (request code)
 * - verify (sets sid cookie via apps/api; forwarded by apps/web)
 * - /me (session validation via apps/web → apps/api)
 * - role-gated endpoint (job-poster jobs)
 * - logout (apps/web → apps/api revoke + cookie clear)
 *
 * Usage:
 *   API_ORIGIN=http://localhost:3003 WEB_ORIGIN=http://localhost:3006 node scripts/platform-smoke.mjs
 */

import { readFile } from "node:fs/promises";

async function loadEnvFile(path) {
  try {
    const raw = await readFile(path, "utf8");
    for (const line of raw.split("\n")) {
      const s = line.trim();
      if (!s || s.startsWith("#")) continue;
      const idx = s.indexOf("=");
      if (idx <= 0) continue;
      const key = s.slice(0, idx).trim();
      let val = s.slice(idx + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      if (!(key in process.env)) process.env[key] = val;
    }
  } catch {
    // optional
  }
}

function mustEnv(name) {
  const v = String(process.env[name] ?? "").trim().replace(/\/+$/, "");
  if (!v) throw new Error(`${name} is not set`);
  return v;
}

function nowIso() {
  return new Date().toISOString();
}

function getSetCookies(headers) {
  // Node 20+ (undici) supports headers.getSetCookie(); fall back to single header.
  const h = headers;
  if (h && typeof h.getSetCookie === "function") return h.getSetCookie();
  const sc = h?.get?.("set-cookie");
  return sc ? [sc] : [];
}

function extractCookieValue(setCookie, name) {
  // Very small parser: grabs `${name}=...;`
  const m = String(setCookie ?? "").match(new RegExp(`(?:^|\\s|,)${name}=([^;]+)`));
  return m ? m[1] : null;
}

async function http(url, init) {
  const start = Date.now();
  const resp = await fetch(url, { cache: "no-store", ...(init ?? {}) });
  const text = await resp.text().catch(() => "");
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  return {
    url,
    status: resp.status,
    ok: resp.ok,
    headers: resp.headers,
    setCookies: getSetCookies(resp.headers),
    text,
    json,
    durationMs: Date.now() - start,
  };
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function shortBody(r) {
  if (r.json && typeof r.json === "object") return JSON.stringify(r.json).slice(0, 800);
  return String(r.text ?? "").slice(0, 800);
}

async function main() {
  // Convenience for local runs: pick up checked-in .env.local files if present.
  // CI/deploy should set env explicitly.
  await loadEnvFile("apps/api/.env.local");
  await loadEnvFile("apps/web/.env.local");

  const API_ORIGIN = mustEnv("API_ORIGIN");
  const WEB_ORIGIN = mustEnv("WEB_ORIGIN");

  const email = `smoke+${Date.now()}@example.com`;
  const name = "Smoke Test";
  const address = "123 Main St";
  const city = "Vancouver";
  const stateProvince = "BC";
  const country = "CA";

  console.log(`[platform-smoke] start ${nowIso()}`);
  console.log(`[platform-smoke] API_ORIGIN=${API_ORIGIN}`);
  console.log(`[platform-smoke] WEB_ORIGIN=${WEB_ORIGIN}`);

  // 1) Health (API)
  {
    const r = await http(`${API_ORIGIN}/api/system/health`);
    assert(r.ok && r.json?.ok === true, `api.system.health failed: status=${r.status} body=${shortBody(r)}`);
    assert(r.json?.service === "apps-api", `api.system.health missing service=apps-api: body=${shortBody(r)}`);
    assert(r.json?.db === "connected", `api.system.health db not connected: body=${shortBody(r)}`);
  }

  // 2) Health (Web proxy)
  {
    const r = await http(`${WEB_ORIGIN}/api/app/system/health`);
    assert(r.ok && r.json?.ok === true, `web.api.app.system.health failed: status=${r.status} body=${shortBody(r)}`);
    assert(r.json?.service === "apps-api", `web.api.app.system.health did not reach apps-api: body=${shortBody(r)}`);
  }

  // 3) Login (request code) via apps/api
  let debugCode = null;
  {
    const r = await http(`${API_ORIGIN}/api/auth/request`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email }),
    });
    assert(r.ok && r.json?.ok === true, `api.auth.request failed: status=${r.status} body=${shortBody(r)}`);
    debugCode = String(r.json?.debugCode ?? "");
    assert(debugCode && debugCode.length >= 4, `api.auth.request missing debugCode (dev mode required): body=${shortBody(r)}`);
  }

  // 4) Verify via apps/web proxy (must forward Set-Cookie from apps/api)
  let cookieHeader = "";
  {
    const r = await http(`${WEB_ORIGIN}/api/auth/verify`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token: debugCode, role: "job-poster" }),
    });
    assert(r.ok, `web.auth.verify failed: status=${r.status} body=${shortBody(r)}`);

    const setCookies = r.setCookies;
    const sid = setCookies.map((c) => extractCookieValue(c, "sid")).find(Boolean) ?? null;
    assert(sid, `web.auth.verify did not set sid cookie: set-cookie=${JSON.stringify(setCookies).slice(0, 800)}`);
    cookieHeader = `sid=${sid}`;
  }

  // 5) /me via apps/web (session validation is API-authoritative)
  {
    const r = await http(`${WEB_ORIGIN}/api/app/me`, {
      method: "GET",
      headers: { cookie: cookieHeader },
    });
    assert(r.ok && r.json?.ok === true, `web.api.app.me failed: status=${r.status} body=${shortBody(r)}`);
  }

  // 6) Complete onboarding (TOS + profile) via apps/web proxies
  {
    const tos = await http(`${WEB_ORIGIN}/api/app/job-poster/tos`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: cookieHeader },
      body: JSON.stringify({ accepted: true, version: "1.0" }),
    });
    assert(tos.ok, `job-poster.tos failed: status=${tos.status} body=${shortBody(tos)}`);
  }
  {
    const prof = await http(`${WEB_ORIGIN}/api/app/job-poster/profile`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: cookieHeader },
      body: JSON.stringify({ name, email, address, city, stateProvince, country }),
    });
    assert(prof.ok, `job-poster.profile failed: status=${prof.status} body=${shortBody(prof)}`);
  }

  // 7) Role-gated endpoint (should succeed once onboarded)
  {
    const r = await http(`${WEB_ORIGIN}/api/app/job-poster/jobs`, {
      method: "GET",
      headers: { cookie: cookieHeader },
    });
    assert(r.ok, `job-poster.jobs failed: status=${r.status} body=${shortBody(r)}`);
    assert(Array.isArray(r.json?.jobs), `job-poster.jobs missing jobs[]: body=${shortBody(r)}`);
  }

  // 8) Logout (revoke in DB + clear cookie)
  {
    const r = await http(`${WEB_ORIGIN}/api/auth/logout`, {
      method: "POST",
      headers: { cookie: cookieHeader },
    });
    assert(r.ok, `web.auth.logout failed: status=${r.status} body=${shortBody(r)}`);

    // Update cookie jar if a clearing cookie is returned.
    const setCookies = r.setCookies;
    const sid = setCookies.map((c) => extractCookieValue(c, "sid")).find(Boolean) ?? null;
    if (sid === "" || sid === null) {
      // keep cookieHeader as-is; the DB revocation should still invalidate it
    } else {
      cookieHeader = `sid=${sid}`;
    }
  }

  // 9) /me should now be unauthorized (no ghost sessions)
  {
    const r = await http(`${WEB_ORIGIN}/api/app/me`, {
      method: "GET",
      headers: { cookie: cookieHeader },
    });
    assert(r.status === 401, `web.api.app.me expected 401 after logout: status=${r.status} body=${shortBody(r)}`);
  }

  // 10) Referral capture route (/r?ref=...) — sets router_ref cookie, redirects to /
  {
    const refUuid = "00000000-0000-4000-8000-000000000001";
    const r = await http(`${WEB_ORIGIN}/r?ref=${refUuid}`, { redirect: "manual" });
    assert(r.status === 302 || r.status === 307, `referral route expected redirect: status=${r.status}`);
    const loc = r.headers.get("location") ?? "";
    assert(loc.length > 0, `referral redirect missing location header`);
  }

  // 11) Router rewards endpoint — login as router, hit GET /api/app/router/rewards
  {
    const routerEmail = `smoke+router+${Date.now()}@example.com`;
    const rReq = await http(`${API_ORIGIN}/api/auth/request`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: routerEmail }),
    });
    assert(rReq.ok && rReq.json?.ok === true, `router auth.request failed: status=${rReq.status}`);
    const rCode = String(rReq.json?.debugCode ?? "");
    assert(rCode.length >= 4, `router auth.request missing debugCode`);

    const rVerify = await http(`${WEB_ORIGIN}/api/auth/verify`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token: rCode, role: "router" }),
    });
    assert(rVerify.ok, `router auth.verify failed: status=${rVerify.status}`);
    const rSid = rVerify.setCookies.map((c) => extractCookieValue(c, "sid")).find(Boolean);
    assert(rSid, `router verify did not set sid`);
    const routerCookie = `sid=${rSid}`;

    const rMe = await http(`${WEB_ORIGIN}/api/app/me`, {
      method: "GET",
      headers: { cookie: routerCookie },
    });
    assert(rMe.ok && rMe.json?.ok === true, `router /me failed: status=${rMe.status}`);
    assert(rMe.json?.authenticated === true, `router /me not authenticated`);

    const rRewards = await http(`${WEB_ORIGIN}/api/app/router/rewards`, {
      method: "GET",
      headers: { cookie: routerCookie },
    });
    if (rRewards.status === 200) {
      assert(rRewards.json?.ok !== false, `router.rewards returned error: ${shortBody(rRewards)}`);
      assert(typeof rRewards.json?.totalReferredUsers === "number", `router.rewards missing totalReferredUsers`);
      assert(typeof rRewards.json?.completedReferredJobs === "number", `router.rewards missing completedReferredJobs`);
      assert(typeof rRewards.json?.pendingRewards === "number", `router.rewards missing pendingRewards`);
      assert(typeof rRewards.json?.paidRewards === "number", `router.rewards missing paidRewards`);
    } else if (rRewards.status === 403) {
      // Router not provisioned (no routers/routerProfiles) — endpoint exists, expected in unseeded env
    } else {
      assert(false, `router.rewards unexpected status: ${rRewards.status} body=${shortBody(rRewards)}`);
    }
  }

  console.log(`[platform-smoke] ok ${nowIso()}`);
}

main().catch((err) => {
  console.error(`[platform-smoke] FAIL ${nowIso()}`);
  console.error(String(err?.stack ?? err?.message ?? err));
  process.exit(1);
});

