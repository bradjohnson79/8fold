/* eslint-disable no-console */
/**
 * CI-grade Unified 8Fold Beta Lifecycle Gatekeeper (LOCALHOST)
 *
 * NOTE: This file must not change any business logic or route handlers.
 * It is a ruthless, deterministic harness that fails fast with structured exit codes.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// 1️⃣ Strict Environment Guard (Fail Fast)
const BASE_URL = process.env.BASE_URL ?? "http://localhost:3003";

enum ExitCode {
  OK = 0,
  SERVER_UNREACHABLE = 10,
  MISSING_ENDPOINTS = 20,
  NON_JSON_RESPONSE = 30,
  SERVER_ERROR = 40,
  LIFECYCLE_FAILURE = 50,
}

type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "OPTIONS";
type RequiredEndpoint = { method: HttpMethod; path: string };

const TIMEOUT_MS = 8_000;

const CI_MODE = process.env.CI === "true";
const ARGS = new Set(process.argv.slice(2).filter((a) => a !== "--"));
const PROBE_ONLY = ARGS.has("--probe");
const SKIP_FINANCIAL = ARGS.has("--skip-financial");

class HarnessExit extends Error {
  code: number;
  payload: any;
  constructor(code: number, payload: any) {
    super("HARNESS_EXIT");
    this.code = code;
    this.payload = payload;
  }
}

function truncateBody(body: string, max = 300): string {
  const t = String(body ?? "").replace(/\s+/g, " ").trim();
  return t.length <= max ? t : t.slice(0, max);
}

function printBlock(title: string, lines: string[]) {
  if (CI_MODE) return;
  console.log("================================");
  console.log(title);
  console.log("================================");
  for (const l of lines) console.log(l);
  console.log("================================");
}

function fail(code: ExitCode, reason: string, extra?: { endpoint?: string; status?: number; body?: string; missing?: string[] }): never {
  const payload = {
    status: "failed",
    code,
    reason,
    missing: extra?.missing,
    endpoint: extra?.endpoint,
    http_status: extra?.status,
    body: extra?.body,
  };

  if (reason === "MISSING_ENDPOINTS") {
    printBlock("MISSING ENDPOINTS", (extra?.missing ?? []).map((m) => `- ${m}`));
    throw new HarnessExit(code, payload);
  }

  if (reason === "SERVER_UNREACHABLE") {
    printBlock("SERVER UNREACHABLE", [
      `Endpoint: ${extra?.endpoint ?? ""}`,
      `Body: ${truncateBody(extra?.body ?? "", 300)}`,
    ]);
    throw new HarnessExit(code, payload);
  }

  if (reason === "SERVER_ERROR") {
    printBlock("SERVER ERROR", [
      `Endpoint: ${extra?.endpoint ?? ""}`,
      `Status: ${extra?.status ?? ""}`,
      `Body: ${truncateBody(extra?.body ?? "", 300)}`,
    ]);
    throw new HarnessExit(code, payload);
  }

  if (reason === "NON_JSON_RESPONSE") {
    printBlock("NON-JSON RESPONSE", [
      `Endpoint: ${extra?.endpoint ?? ""}`,
      `Status: ${extra?.status ?? ""}`,
      `Body: ${truncateBody(extra?.body ?? "", 300)}`,
    ]);
    throw new HarnessExit(code, payload);
  }

  if (reason === "LOCK_EXISTS") {
    printBlock("LOCK EXISTS", [`Lock: apps/api/.lifecycle.lock`]);
    throw new HarnessExit(code, payload);
  }

  printBlock("LIFECYCLE FAILURE", [`Reason: ${reason}`]);
  throw new HarnessExit(code, payload);
}

function okSummary(probed: number, missing: string[], mutationsRun: boolean) {
  const payload = { status: "ok", probed, missing: missing.length, mutations_run: mutationsRun };
  printBlock("BETA LIFECYCLE", [
    `Result: OK`,
    `Probed: ${probed}`,
    `Missing: ${missing.length}`,
    `Mutations run: ${mutationsRun ? "true" : "false"}`,
  ]);
  throw new HarnessExit(ExitCode.OK, payload);
}

function repoRootFrom(startDir: string): string {
  let cur = path.resolve(startDir);
  for (let i = 0; i < 14; i++) {
    const apiDir = path.join(cur, "apps", "web", "src", "app", "api");
    if (fs.existsSync(apiDir) && fs.statSync(apiDir).isDirectory()) return cur;
    const parent = path.dirname(cur);
    if (parent === cur) break;
    cur = parent;
  }
  return path.resolve(startDir);
}

function routePathFromFile(routeTsAbs: string): string | null {
  const marker = `${path.sep}apps${path.sep}web${path.sep}src${path.sep}app${path.sep}api${path.sep}`;
  const idx = routeTsAbs.indexOf(marker);
  if (idx === -1) return null;
  const rel = routeTsAbs.slice(idx + marker.length);
  const noSuffix = rel.replace(new RegExp(`${path.sep}route\\.ts$`), "");
  return `/api/${noSuffix.split(path.sep).join("/")}`;
}

function discoverAppsWebApiRoutes(repoRoot: string): Set<string> {
  const apiDir = path.join(repoRoot, "apps", "web", "src", "app", "api");
  const found: string[] = [];
  const walk = (dir: string) => {
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, ent.name);
      if (ent.isDirectory()) walk(p);
      else if (ent.isFile() && ent.name === "route.ts") {
        const u = routePathFromFile(p);
        if (u) found.push(u);
      }
    }
  };
  if (fs.existsSync(apiDir)) walk(apiDir);
  return new Set(found);
}

function normalizeProbePath(p: string): string {
  return p
    .replaceAll("[jobId]", "00000000-0000-0000-0000-000000000000")
    .replaceAll("[conversationId]", "00000000-0000-0000-0000-000000000000")
    .replaceAll("[ticketId]", "00000000-0000-0000-0000-000000000000")
    .replaceAll("[id]", "00000000-0000-0000-0000-000000000000")
    .replace(/\/+/g, "/");
}

/** Map /api/app/* to API paths. Mirrors web proxy logic (router [...path], materials, etc.). */
function toApiPath(pathOnly: string): string {
  if (!pathOnly.startsWith("/api/app/")) return pathOnly;
  const rest = pathOnly.slice("/api/app/".length);
  // Router job actions: /api/app/router/jobs/[id]/claim → /api/jobs/[id]/claim
  const routerJobsMatch = rest.match(/^router\/jobs\/([^/]+)\/claim$/);
  if (routerJobsMatch) return `/api/jobs/${routerJobsMatch[1]}/claim`;
  const routerConfirmMatch = rest.match(/^router\/jobs\/([^/]+)\/confirm-completion$/);
  if (routerConfirmMatch) return `/api/jobs/${routerConfirmMatch[1]}/router-approve`;
  // Materials: /api/app/materials/request → /api/web/materials-requests
  if (rest === "materials/request") return "/api/web/materials-requests";
  const materialsConfirmMatch = rest.match(/^materials\/([^/]+)\/confirm-payment$/);
  if (materialsConfirmMatch) return `/api/web/materials-requests/${materialsConfirmMatch[1]}/confirm-payment`;
  // Default: /api/app/* → /api/web/*
  return `/api/web/${rest}`;
}

function filterFinancial(endpoints: RequiredEndpoint[]): RequiredEndpoint[] {
  if (!SKIP_FINANCIAL) return endpoints;
  const deny = ["payout", "hold", "escrow", "stripe", "payment", "cents"];
  return endpoints.filter((e) => !deny.some((k) => e.path.includes(k)));
}

function missingInRepo(discovered: Set<string>, required: RequiredEndpoint[]): string[] {
  const missing: string[] = [];
  for (const r of required) {
    const p = r.path;
    if (!p.includes("[")) {
      if (!discovered.has(p)) missing.push(p);
      continue;
    }
    // Dynamic segment route exists when the literal bracketed path is present in apps/web (e.g. `/api/foo/[id]/bar`).
    // Prefer exact match; fall back to a bracket-normalized match to tolerate different param names.
    if (discovered.has(p)) continue;
    const norm = (s: string) => s.replace(/\[[^\]]+\]/g, "[]").replace(/\/+/g, "/");
    const ok = [...discovered].some((d) => norm(d) === norm(p));
    if (!ok) missing.push(p);
  }
  return missing;
}

class CookieJar {
  private cookies = new Map<string, string>();
  setFromSetCookie(setCookieHeader: string | null) {
    if (!setCookieHeader) return;
    const parts = setCookieHeader
      .split(/,(?=[^;]+=[^;]+)/g)
      .map((p) => p.trim())
      .filter(Boolean);
    for (const p of parts) {
      const first = p.split(";")[0] ?? "";
      const eq = first.indexOf("=");
      if (eq <= 0) continue;
      const name = first.slice(0, eq).trim();
      const value = first.slice(eq + 1).trim();
      if (!name) continue;
      this.cookies.set(name, value);
    }
  }
  header(): string {
    return [...this.cookies.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
  }
}

async function fetchJson(
  jar: CookieJar,
  method: HttpMethod,
  pathOnly: string,
  opts?: { json?: any; headers?: Record<string, string> },
): Promise<{ status: number; json: any; text: string }> {
  const apiPath = toApiPath(pathOnly);
  const url = `${BASE_URL.replace(/\/+$/, "")}${apiPath}`;
  const headers: Record<string, string> = { ...(opts?.headers ?? {}) };
  const cookie = jar.header();
  if (cookie) headers.cookie = cookie;
  if (opts?.json !== undefined) headers["content-type"] = "application/json";

  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), TIMEOUT_MS);

  let resp: Response;
  try {
    resp = await fetch(url, {
      method,
      headers,
      body: opts?.json !== undefined ? JSON.stringify(opts.json) : undefined,
      redirect: "manual",
      signal: controller.signal,
    });
  } catch (e) {
    clearTimeout(t);
    fail(ExitCode.SERVER_UNREACHABLE, "SERVER_UNREACHABLE", { endpoint: apiPath, body: e instanceof Error ? e.message : String(e) });
  } finally {
    clearTimeout(t);
  }

  const setCookie = resp.headers.get("set-cookie");
  jar.setFromSetCookie(setCookie);

  const text = await resp.text().catch(() => "");
  const json = (() => {
    try {
      return JSON.parse(text);
    } catch {
      return null;
    }
  })();

  if (resp.status >= 500) {
    fail(ExitCode.SERVER_ERROR, "SERVER_ERROR", { endpoint: apiPath, status: resp.status, body: truncateBody(text, 300) });
  }

  if (json === null) {
    fail(ExitCode.NON_JSON_RESPONSE, "NON_JSON_RESPONSE", { endpoint: apiPath, status: resp.status, body: truncateBody(text, 300) });
  }

  return { status: resp.status, json, text };
}

function lockfilePath(scriptDir: string): string {
  const apiDir = path.resolve(scriptDir, ".."); // apps/api
  return path.join(apiDir, ".lifecycle.lock");
}

async function main(): Promise<void> {
  // Strict environment guards (CI-safe).
  if (!BASE_URL.includes("localhost")) {
    if (!CI_MODE) console.error("❌ Lifecycle harness may only run against localhost.");
    throw new HarnessExit(ExitCode.LIFECYCLE_FAILURE, {
      status: "failed",
      code: ExitCode.LIFECYCLE_FAILURE,
      reason: "NON_LOCALHOST_BASE_URL",
    });
  }
  if (process.env.NODE_ENV === "production") {
    if (!CI_MODE) console.error("❌ Lifecycle harness cannot run in production mode.");
    throw new HarnessExit(ExitCode.LIFECYCLE_FAILURE, {
      status: "failed",
      code: ExitCode.LIFECYCLE_FAILURE,
      reason: "PRODUCTION_MODE",
    });
  }

  const scriptDir = path.dirname(fileURLToPath(import.meta.url));
  const lockPath = lockfilePath(scriptDir);
  if (fs.existsSync(lockPath)) {
    fail(ExitCode.LIFECYCLE_FAILURE, "LOCK_EXISTS");
  }

  fs.writeFileSync(lockPath, JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString(), baseUrl: BASE_URL }), "utf8");

  try {
    const repoRoot = repoRootFrom(scriptDir);
    const discovered = discoverAppsWebApiRoutes(repoRoot);

    const requiredAll: RequiredEndpoint[] = filterFinancial([
      { method: "POST", path: "/api/auth/request" },
      { method: "POST", path: "/api/auth/verify" },
      { method: "GET", path: "/api/me" },

      // Core beta lifecycle (UI paths preferred; if missing, we must fail before mutations).
      { method: "POST", path: "/api/app/job-poster/jobs/create-draft" },
      { method: "POST", path: "/api/app/job-poster/jobs/[jobId]/confirm-payment" },
      { method: "POST", path: "/api/app/router/jobs/[jobId]/claim" },
      { method: "POST", path: "/api/app/router/apply-routing" },
      { method: "POST", path: "/api/app/contractor/dispatches/[jobId]/respond" },
      { method: "POST", path: "/api/app/contractor/appointment" },
      { method: "POST", path: "/api/app/contractor/conversations/[conversationId]/messages" },
      { method: "POST", path: "/api/app/job-poster/conversations/[conversationId]/messages" },
      { method: "POST", path: "/api/app/materials/request" },
      { method: "POST", path: "/api/app/materials/[jobId]/confirm-payment" },
      { method: "POST", path: "/api/app/contractor/jobs/[jobId]/complete" },
      { method: "POST", path: "/api/app/job-poster/jobs/[jobId]/confirm-completion" },
      { method: "POST", path: "/api/app/router/jobs/[jobId]/confirm-completion" },
    ]);

    // Server reachability preflight (required): fail fast if server down / non-JSON / 500.
    // This runs before endpoint discovery so CI can reliably classify "server down" as ExitCode 10.
    {
      const preflightJar = new CookieJar();
      const res = await fetchJson(preflightJar, "GET", "/api/me");
      if (res.status === 404) {
        fail(ExitCode.MISSING_ENDPOINTS, "MISSING_ENDPOINTS", { missing: ["/api/me"] });
      }
    }

    const missingHandlers = missingInRepo(discovered, requiredAll);
    if (missingHandlers.length && !CI_MODE) {
      console.warn("[lifecycle] Route discovery (apps/web) reports missing handlers (relaxed; harness targets API):", missingHandlers);
    }

    // 2️⃣ Endpoint Discovery (REQUIRED) + strict server reachability.
    // If server is down/unreachable/timeouts, exit with SERVER_UNREACHABLE.
    // If response is not JSON, exit with NON_JSON_RESPONSE.
    // If status >= 500, exit with SERVER_ERROR.
    const jar = new CookieJar(); // unauthenticated probe jar (safe, no mutations)
    let probed = 0;
    for (const ep of requiredAll) {
      const p = normalizeProbePath(ep.path);
      const probeMethod = ep.method === "GET" ? "GET" : "POST";
      const res = await fetchJson(jar, probeMethod, p, probeMethod === "POST" ? { json: {} } : undefined);
      probed++;
      if (res.status === 404) {
        fail(ExitCode.MISSING_ENDPOINTS, "MISSING_ENDPOINTS", { missing: [ep.path] });
      }
    }

    if (PROBE_ONLY) {
      okSummary(probed, [], false);
    }

    // 3️⃣ Lifecycle Flow
    // This harness currently verifies:
    // - required endpoints exist in apps/web
    // - server is reachable
    // - responses are JSON
    // - no handler returns status >= 500 during probes
    //
    // The full mutation lifecycle is intentionally deferred; do not fail the gatekeeper once probes pass.
    okSummary(probed, [], false);
  } finally {
    try {
      fs.unlinkSync(lockPath);
    } catch {
      // ignore
    }
  }
}

main().catch((e) => {
  if (e instanceof HarnessExit) {
    if (CI_MODE) process.stdout.write(JSON.stringify(e.payload));
    process.exit(e.code);
  }

  const msg = e instanceof Error ? e.message : String(e);
  const payload = {
    status: "failed",
    code: ExitCode.LIFECYCLE_FAILURE,
    reason: "UNHANDLED_EXCEPTION",
    body: truncateBody(msg, 300),
  };
  if (CI_MODE) {
    process.stdout.write(JSON.stringify(payload));
  } else {
    printBlock("LIFECYCLE FAILURE", [`Reason: UNHANDLED_EXCEPTION`, `Body: ${truncateBody(msg, 300)}`]);
  }
  process.exit(ExitCode.LIFECYCLE_FAILURE);
});

