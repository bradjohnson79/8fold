/**
 * Admin Audit Smoke Runner (no UI).
 *
 * - Discovers an admin identity from DB (AdminUser table), ensures an internal actor User exists,
 *   mints a Session token (same mechanics as RBAC), then hits admin endpoints.
 * - Captures status + response snippet (2k) + elapsed ms for each call.
 * - Writes:
 *   - ADMIN_AUDIT_RUN_RESULTS.json
 *   - ADMIN_AUDIT_RUN_RESULTS.md
 *
 * Run:
 *   ADMIN_AUDIT_LOG=1 pnpm exec tsx apps/api/scripts/smoke-admin-audit.ts
 *
 * Notes:
 * - By default, this runner calls **GET endpoints only** to avoid unintended state changes.
 * - To include POST/PATCH endpoints (mutating), set: ADMIN_AUDIT_RUN_MUTATIONS=1
 */
import path from "node:path";
import fs from "node:fs";
import crypto from "node:crypto";
import { Client } from "pg";

type RunRow = {
  name: string;
  method: string;
  url: string;
  traceId: string;
  status: number;
  ok: boolean;
  elapsedMs: number;
  bodySnippet?: string;
  skipped?: boolean;
  skipReason?: string;
};

function truncate(s: string, max = 2000) {
  const t = String(s ?? "");
  return t.length <= max ? t : t.slice(0, max) + `… [truncated ${t.length - max} chars]`;
}

function sha256(s: string): string {
  return crypto.createHash("sha256").update(s).digest("hex");
}

function getAuthSchemaFromDbUrl(dbUrl: string): string {
  try {
    const u = new URL(dbUrl);
    const schema = (u.searchParams.get("schema") ?? "").trim();
    if (schema && /^[a-zA-Z0-9_]+$/.test(schema)) return schema;
  } catch {
    // ignore
  }
  return "public";
}

async function main() {
  const dotenv = await import("dotenv");
  dotenv.config({ path: path.join(process.cwd(), "apps/api/.env.local") });
  dotenv.config({ path: path.join(process.cwd(), ".env") });

  const DATABASE_URL = process.env.DATABASE_URL;
  if (!DATABASE_URL) throw new Error("DATABASE_URL missing");

  const base = String(process.env.API_ORIGIN ?? "").trim().replace(/\/+$/, "");
  if (!base) throw new Error("API_ORIGIN missing (explicit config required)");
  const adminBase = String(process.env.ADMIN_BASE_URL ?? "").trim().replace(/\/+$/, "");
  if (!adminBase) throw new Error("ADMIN_BASE_URL missing (explicit config required)");
  const authSchema = getAuthSchemaFromDbUrl(DATABASE_URL);
  const runMutations = process.env.ADMIN_AUDIT_RUN_MUTATIONS === "1";
  const checkAdminAuth = process.env.ADMIN_AUDIT_CHECK_ADMIN_AUTH === "1";

  const pg = new Client({ connectionString: DATABASE_URL });
  await pg.connect();

  async function resolveAdminUserSchema(): Promise<string> {
    const candidates = [authSchema, "8fold_test", "public"];
    for (const schema of candidates) {
      try {
        const res = await pg.query(
          `select 1 as ok from information_schema.tables where table_schema = $1 and table_name = 'AdminUser' limit 1;`,
          [schema],
        );
        if ((res.rows[0]?.ok ?? null) === 1) return schema;
      } catch {
        // ignore
      }
    }
    return "public";
  }

  function parseCookie(setCookieHeader: string, name: string): string | null {
    const raw = String(setCookieHeader ?? "");
    const parts = raw.split(/,\s*(?=[^;]+=[^;]+)/g); // split combined Set-Cookie
    for (const p of parts) {
      const m = p.match(new RegExp(`(?:^|\\s)${name}=([^;]+)`));
      if (m && m[1]) return m[1];
    }
    return null;
  }

  // Discover an AdminUser (for actor authUserId). We do NOT assume a schema; try common.
  async function selectAdminUser(): Promise<{ email: string }> {
    const candidates = ["8fold_test", "public"];
    for (const schema of candidates) {
      try {
        const res = await pg.query(`select "email" from "${schema}"."AdminUser" order by "email" asc limit 1;`);
        const email = (res.rows[0]?.email ?? null) as string | null;
        if (email) return { email };
      } catch {
        // table might not exist in this schema
      }
    }
    // last resort: unqualified (search_path)
    const res = await pg.query(`select "email" from "AdminUser" order by "email" asc limit 1;`);
    const email = (res.rows[0]?.email ?? null) as string | null;
    if (!email) throw new Error("No AdminUser rows found (cannot authenticate as admin)");
    return { email };
  }

  const admin = await selectAdminUser();
  const authUserId = `admin:${String(admin.email).trim().toLowerCase()}`;

  // Ensure actor User exists (same behavior as apps/admin/src/server/adminSession.ts)
  const actorUpsertId = crypto.randomUUID();
  const actorRes = await pg.query(
    `insert into "8fold_test"."User" ("id","authUserId","role")
     values ($1,$2,$3)
     on conflict ("authUserId") do update set "role" = $3
     returning "id";`,
    [actorUpsertId, authUserId, "ADMIN"],
  );
  const actorUserId = (actorRes.rows[0]?.id ?? null) as string | null;
  if (!actorUserId) throw new Error("Failed to upsert admin actor User");

  // Mint session token in auth schema Session table
  const sessionToken = crypto.randomBytes(32).toString("hex");
  const sessionTokenHash = sha256(sessionToken);
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  await pg.query(
    `insert into "${authSchema}"."Session" ("id","userId","sessionTokenHash","expiresAt")
     values ($1,$2,$3,$4);`,
    [crypto.randomUUID(), actorUserId, sessionTokenHash, expiresAt],
  );

  // Discover IDs for parameterized endpoints.
  const jobsResp = await fetch(`${base}/api/admin/jobs`, {
    method: "GET",
    headers: { authorization: `Bearer ${sessionToken}`, "x-session-token": sessionToken },
    cache: "no-store" as any,
  });
  const jobsJson = (await jobsResp.json().catch(() => ({}))) as any;
  const firstJobId = String(jobsJson?.jobs?.[0]?.id ?? "").trim() || null;

  const contractorsResp = await fetch(`${base}/api/admin/contractors`, {
    method: "GET",
    headers: { authorization: `Bearer ${sessionToken}`, "x-session-token": sessionToken },
    cache: "no-store" as any,
  });
  const contractorsJson = (await contractorsResp.json().catch(() => ({}))) as any;
  const firstContractorId = String(contractorsJson?.contractors?.[0]?.id ?? "").trim() || null;

  const payoutResp = await fetch(`${base}/api/admin/payout-requests?status=REQUESTED`, {
    method: "GET",
    headers: { authorization: `Bearer ${sessionToken}`, "x-session-token": sessionToken },
    cache: "no-store" as any,
  });
  const payoutJson = (await payoutResp.json().catch(() => ({}))) as any;
  const firstPayoutRequestId = String(payoutJson?.payoutRequests?.[0]?.id ?? "").trim() || null;

  const jobDraftsResp = await fetch(`${base}/api/admin/job-drafts`, {
    method: "GET",
    headers: { authorization: `Bearer ${sessionToken}`, "x-session-token": sessionToken },
    cache: "no-store" as any,
  });
  const jobDraftsJson = (await jobDraftsResp.json().catch(() => ({}))) as any;
  const firstJobDraftId = String(jobDraftsJson?.jobDrafts?.[0]?.id ?? "").trim() || null;

  const disputesResp = await fetch(`${base}/api/admin/support/disputes?take=5`, {
    method: "GET",
    headers: { authorization: `Bearer ${sessionToken}`, "x-session-token": sessionToken },
    cache: "no-store" as any,
  });
  const disputesJson = (await disputesResp.json().catch(() => ({}))) as any;
  const firstDisputeId =
    String(disputesJson?.disputes?.[0]?.id ?? "").trim() ||
    String(disputesJson?.cases?.[0]?.id ?? "").trim() ||
    null;

  // NOTE: many other routes need IDs; we only discover the ones in the critical path.

  const endpoints: Array<{
    name: string;
    method: "GET" | "POST" | "PATCH";
    url: string;
    mutating?: boolean;
    body?: any;
    skipIf?: boolean;
    skipReason?: string;
  }> = [
    { name: "jobs.list", method: "GET", url: `${base}/api/admin/jobs` },
    { name: "jobs.list.ASSIGNED", method: "GET", url: `${base}/api/admin/jobs?status=ASSIGNED` },
    { name: "jobs.list.COMPLETED", method: "GET", url: `${base}/api/admin/jobs?status=COMPLETED` },
    { name: "jobs.list.COMPLETED_APPROVED", method: "GET", url: `${base}/api/admin/jobs?status=COMPLETED_APPROVED` },
    { name: "routing-activity", method: "GET", url: `${base}/api/admin/routing-activity` },
    { name: "contractors.list", method: "GET", url: `${base}/api/admin/contractors` },
    { name: "contractors.approved", method: "GET", url: `${base}/api/admin/contractors?status=APPROVED` },
    {
      name: "contractors.detail",
      method: "GET",
      url: `${base}/api/admin/contractors/${firstContractorId ?? ":id"}`,
      skipIf: !firstContractorId,
      skipReason: "No contractor id discovered from /api/admin/contractors.",
    },
    { name: "job-drafts.list", method: "GET", url: `${base}/api/admin/job-drafts` },
    ...(firstJobDraftId ? [{ name: "job-drafts.detail", method: "GET" as const, url: `${base}/api/admin/job-drafts/${firstJobDraftId}` }] : []),
    { name: "payout-requests.list", method: "GET", url: `${base}/api/admin/payout-requests?status=REQUESTED` },
    { name: "payout-requests.paid", method: "GET", url: `${base}/api/admin/payout-requests?status=PAID` },
    // Backend implementation currently lives at /api/admin/support/tickets
    { name: "support.tickets.backend", method: "GET", url: `${base}/api/admin/support/tickets?take=5` },
    { name: "audit-logs", method: "GET", url: `${base}/api/admin/audit-logs?take=5` },
    { name: "stats", method: "GET", url: `${base}/api/admin/stats` },
    // Support disputes (admin UI dispute review page)
    { name: "support.disputes.list", method: "GET", url: `${base}/api/admin/support/disputes?take=5` },
    {
      name: "support.disputes.detail",
      method: "GET",
      url: `${base}/api/admin/support/disputes/${firstDisputeId ?? ":disputeId"}`,
      skipIf: !firstDisputeId,
      skipReason: "No dispute id discovered from /api/admin/support/disputes.",
    },
    { name: "users.all", method: "GET", url: `${base}/api/admin/users` },
    { name: "users.routers", method: "GET", url: `${base}/api/admin/users/routers` },
    { name: "users.contractors", method: "GET", url: `${base}/api/admin/users/contractors` },
    { name: "users.job-posters", method: "GET", url: `${base}/api/admin/users/job-posters` },

    // Mutating endpoints (opt-in)
    ...(runMutations && firstJobId && firstContractorId
      ? [
          {
            name: "jobs.assign",
            method: "POST" as const,
            url: `${base}/api/admin/jobs/${firstJobId}/assign`,
            mutating: true,
            body: { contractorId: firstContractorId },
          },
        ]
      : [
          {
            name: "jobs.assign",
            method: "POST" as const,
            url: `${base}/api/admin/jobs/${firstJobId ?? ":jobId"}/assign`,
            mutating: true,
          },
        ]),
    ...(runMutations && firstPayoutRequestId
      ? [
          {
            name: "payout-requests.mark-paid",
            method: "POST" as const,
            url: `${base}/api/admin/payout-requests/${firstPayoutRequestId}/mark-paid`,
            mutating: true,
            body: {},
          },
        ]
      : [
          {
            name: "payout-requests.mark-paid",
            method: "POST" as const,
            url: `${base}/api/admin/payout-requests/${firstPayoutRequestId ?? ":id"}/mark-paid`,
            mutating: true,
          },
        ]),

    // My roles onboarding (mutating; opt-in)
    {
      name: "my.roles.router.accept-terms",
      method: "POST",
      url: `${base}/api/admin/my/roles/router/accept-terms`,
      mutating: true,
      body: { accepted: true },
    },
    {
      name: "my.roles.router.complete",
      method: "POST",
      url: `${base}/api/admin/my/roles/router/complete`,
      mutating: true,
      body: {},
    },
  ];

  const results: RunRow[] = [];

  // Optional: verify Admin UI auth + cookie + Admin→API bridge by logging into apps/admin and calling /api/admin/stats.
  if (checkAdminAuth) {
    const traceId = crypto.randomUUID();
    const start = Date.now();
    try {
      const email = String(process.env.ADMIN_AUDIT_LOGIN_EMAIL ?? admin.email).trim().toLowerCase();
      const password = String(process.env.ADMIN_AUDIT_LOGIN_PASSWORD ?? "Admin12345!");

      const adminSchema = await resolveAdminUserSchema();
      await pg.query(
        `insert into "${adminSchema}"."AdminUser" ("id", "email", "passwordHash", "role")
         values ($1, $2, public.crypt($3, public.gen_salt('bf', 10)), $4)
         on conflict ("email") do update
           set "role" = excluded."role",
               "passwordHash" = excluded."passwordHash";`,
        [crypto.randomUUID(), email, password, "ADMIN"],
      );

      const loginResp = await fetch(`${adminBase}/api/login`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-admin-trace-id": traceId },
        body: JSON.stringify({ email, password }),
        cache: "no-store" as any,
      });
      const loginText = await loginResp.text().catch(() => "");
      results.push({
        name: "admin-ui.login",
        method: "POST",
        url: `${adminBase}/api/login`,
        traceId,
        status: loginResp.status,
        ok: loginResp.status >= 200 && loginResp.status < 300,
        elapsedMs: Date.now() - start,
        bodySnippet: truncate(loginText, 2000),
      });

      const setCookie = loginResp.headers.get("set-cookie") ?? "";
      const adminSession = parseCookie(setCookie, "admin_session");
      if (!adminSession) {
        results.push({
          name: "admin-ui.cookie.admin_session",
          method: "GET",
          url: `${adminBase}/api/login`,
          traceId,
          status: 0,
          ok: false,
          elapsedMs: Date.now() - start,
          bodySnippet: "Missing admin_session Set-Cookie header",
        });
      } else {
        const statsStart = Date.now();
        const statsResp = await fetch(`${adminBase}/api/admin/stats`, {
          method: "GET",
          headers: { cookie: `admin_session=${adminSession}`, "x-admin-trace-id": traceId },
          cache: "no-store" as any,
        });
        const statsText = await statsResp.text().catch(() => "");
        results.push({
          name: "admin-ui.stats",
          method: "GET",
          url: `${adminBase}/api/admin/stats`,
          traceId,
          status: statsResp.status,
          ok: statsResp.status >= 200 && statsResp.status < 300,
          elapsedMs: Date.now() - statsStart,
          bodySnippet: truncate(statsText, 2000),
        });
      }
    } catch (err: any) {
      results.push({
        name: "admin-ui.auth-check",
        method: "GET",
        url: `${adminBase}/api/admin/stats`,
        traceId,
        status: 0,
        ok: false,
        elapsedMs: Date.now() - start,
        bodySnippet: `AUTH_CHECK_FAILED: ${String(err?.message ?? err)}`,
      });
    }
  }

  async function callOne(e: (typeof endpoints)[number]): Promise<RunRow> {
    const traceId = crypto.randomUUID();

    if (e.skipIf) {
      return {
        name: e.name,
        method: e.method,
        url: e.url,
        traceId,
        status: -1,
        ok: true,
        elapsedMs: 0,
        skipped: true,
        skipReason: e.skipReason ?? "Skipped.",
      };
    }

    if (e.mutating && !runMutations) {
      return {
        name: e.name,
        method: e.method,
        url: e.url,
        traceId,
        status: -1,
        ok: true,
        elapsedMs: 0,
        skipped: true,
        skipReason: "Skipped mutating endpoint (set ADMIN_AUDIT_RUN_MUTATIONS=1 to run).",
      };
    }

    const headers: Record<string, string> = {
      authorization: `Bearer ${sessionToken}`,
      "x-session-token": sessionToken,
      "x-admin-trace-id": traceId,
    };
    if (e.body != null) headers["content-type"] = "application/json";

    const start = Date.now();
    let resp: Response;
    try {
      resp = await fetch(e.url, {
        method: e.method,
        headers,
        body: e.body != null ? JSON.stringify(e.body) : undefined,
        cache: "no-store" as any,
      });
    } catch (err: any) {
      return {
        name: e.name,
        method: e.method,
        url: e.url,
        traceId,
        status: 0,
        ok: false,
        elapsedMs: Date.now() - start,
        bodySnippet: `FETCH_FAILED: ${String(err?.message ?? err)}`,
      };
    }

    const text = await resp.text().catch(() => "");
    return {
      name: e.name,
      method: e.method,
      url: e.url,
      traceId,
      status: resp.status,
      ok: resp.status >= 200 && resp.status < 300,
      elapsedMs: Date.now() - start,
      bodySnippet: text ? truncate(text, 2000) : "",
    };
  }

  for (const e of endpoints) {
    // eslint-disable-next-line no-await-in-loop
    results.push(await callOne(e));
  }

  await pg.end();

  const outJsonPath = path.join(process.cwd(), "ADMIN_AUDIT_RUN_RESULTS.json");
  const outMdPath = path.join(process.cwd(), "ADMIN_AUDIT_RUN_RESULTS.md");

  fs.writeFileSync(
    outJsonPath,
    JSON.stringify(
      {
        base,
        generatedAt: new Date().toISOString(),
        runMutations,
        actor: { adminEmail: admin.email, actorUserId, authSchema },
        discovered: { firstJobId, firstContractorId, firstPayoutRequestId, firstJobDraftId, firstDisputeId },
        results,
      },
      null,
      2,
    ),
  );

  const failures = results.filter((r) => !r.ok && !r.skipped);
  const lines: string[] = [];
  lines.push("## Admin Audit — Smoke Runner Results");
  lines.push("");
  lines.push(`- Base: \`${base}\``);
  lines.push(`- Generated: \`${new Date().toISOString()}\``);
  lines.push(`- Mutations run: **${runMutations ? "YES" : "NO"}**`);
  lines.push(`- Total calls: **${results.length}**`);
  lines.push(`- Failures (non-2xx, excluding skipped): **${failures.length}**`);
  lines.push("");

  for (const r of results) {
    const statusLabel = r.skipped ? "SKIPPED" : String(r.status);
    lines.push(
      `- **${r.name}**: \`${r.method} ${r.url}\` → **${statusLabel}** (${r.elapsedMs}ms) trace=\`${r.traceId}\``,
    );
    if (r.skipped && r.skipReason) {
      lines.push(`  - skipReason: ${r.skipReason}`);
    }
    if (!r.skipped && !r.ok) {
      lines.push("");
      lines.push("```");
      lines.push(r.bodySnippet ?? "");
      lines.push("```");
      lines.push("");
    }
  }

  fs.writeFileSync(outMdPath, lines.join("\n"));

  // eslint-disable-next-line no-console
  console.log(JSON.stringify({ ok: failures.length === 0, failures: failures.length, outJsonPath, outMdPath }, null, 2));
}

main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error(e);
  process.exit(1);
});

