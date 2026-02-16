import path from "node:path";
import fs from "node:fs";
import crypto from "node:crypto";

type CheckResult = {
  role: "job-poster" | "router" | "contractor" | "public";
  name: string;
  method: string;
  url: string;
  status: number;
  ok: boolean;
  error?: string;
  bodySnippet?: string;
};

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

async function readTextSafe(resp: Response): Promise<string> {
  try {
    return await resp.text();
  } catch {
    return "";
  }
}

function snippet(s: string, max = 1200) {
  const t = String(s ?? "");
  return t.length <= max ? t : t.slice(0, max) + "\n…(truncated)…";
}

async function main() {
  const dotenv = await import("dotenv");
  dotenv.config({ path: path.join(process.cwd(), ".env.local") });
  const DATABASE_URL = process.env.DATABASE_URL;
  if (!DATABASE_URL) throw new Error("DATABASE_URL missing (apps/api/.env.local)");

  const base = String(process.env.API_ORIGIN ?? "").trim().replace(/\/+$/, "");
  if (!base) throw new Error("API_ORIGIN missing (explicit config required)");
  const authSchema = getAuthSchemaFromDbUrl(DATABASE_URL);

  const pg = await import("pg");
  const client = new pg.Client({ connectionString: DATABASE_URL });
  await client.connect();

  async function getUserIdByEmail(email: string) {
    const res = await client.query('select "id" from "8fold_test"."User" where "email" = $1 limit 1;', [email]);
    const id = (res.rows[0]?.id ?? null) as string | null;
    if (!id) throw new Error(`Missing user id for ${email} in 8fold_test.User`);
    return id;
  }

  async function createSessionToken(userId: string): Promise<string> {
    const token = crypto.randomBytes(32).toString("hex");
    const tokenHash = sha256(token);
    const now = new Date();
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    await client.query(
      `insert into "${authSchema}"."Session" ("id","createdAt","userId","sessionTokenHash","expiresAt","revokedAt") values ($1,$2,$3,$4,$5,$6);`,
      [crypto.randomUUID(), now, userId, tokenHash, expiresAt, null],
    );
    return token;
  }

  const posterId = await getUserIdByEmail("poster.audit@8fold.local");
  const routerId = await getUserIdByEmail("router.audit@8fold.local");
  const contractorId = await getUserIdByEmail("contractor.audit@8fold.local");

  const posterToken = await createSessionToken(posterId);
  const routerToken = await createSessionToken(routerId);
  const contractorToken = await createSessionToken(contractorId);

  await client.end();

  async function check(
    role: CheckResult["role"],
    name: string,
    method: "GET" | "POST",
    url: string,
    opts?: { token?: string; jsonBody?: any },
  ): Promise<CheckResult> {
    const headers: Record<string, string> = {};
    if (opts?.token) {
      headers.authorization = `Bearer ${opts.token}`;
      headers["x-session-token"] = opts.token;
    }
    if (opts?.jsonBody) headers["content-type"] = "application/json";

    let resp: Response;
    try {
      resp = await fetch(url, {
        method,
        headers,
        body: opts?.jsonBody ? JSON.stringify(opts.jsonBody) : undefined,
        cache: "no-store" as any,
      });
    } catch (e: any) {
      return {
        role,
        name,
        method,
        url,
        status: 0,
        ok: false,
        error: `FETCH_FAILED: ${String(e?.message ?? e)}`,
      };
    }

    const text = await readTextSafe(resp);
    const ok = resp.status >= 200 && resp.status < 300;
    return {
      role,
      name,
      method,
      url,
      status: resp.status,
      ok,
      ...(ok
        ? {}
        : {
            error: `HTTP_${resp.status}`,
            bodySnippet: snippet(text),
          }),
    };
  }

  const results: CheckResult[] = [];

  // Job Poster (auth)
  results.push(await check("job-poster", "profile", "GET", `${base}/api/web/job-poster/profile`, { token: posterToken }));
  results.push(await check("job-poster", "my-jobs", "GET", `${base}/api/web/job-poster/jobs`, { token: posterToken }));
  results.push(
    await check("job-poster", "pending-materials", "GET", `${base}/api/web/job-poster/materials/pending`, { token: posterToken }),
  );
  results.push(await check("job-poster", "conversations", "GET", `${base}/api/web/job-poster/conversations`, { token: posterToken }));
  results.push(await check("job-poster", "support-badge", "GET", `${base}/api/web/support/tickets?take=1`, { token: posterToken }));

  // Router (auth)
  results.push(await check("router", "profile", "GET", `${base}/api/web/router/profile`, { token: routerToken }));
  results.push(await check("router", "routable-jobs", "GET", `${base}/api/web/router/routable-jobs`, { token: routerToken }));
  results.push(await check("router", "routing-queue", "GET", `${base}/api/web/router/routed-jobs`, { token: routerToken }));
  results.push(await check("router", "support-inbox", "GET", `${base}/api/web/router/support/inbox`, { token: routerToken }));

  // Contractor (auth)
  results.push(await check("contractor", "profile", "GET", `${base}/api/web/contractor/profile`, { token: contractorToken }));
  results.push(await check("contractor", "offers", "GET", `${base}/api/web/contractor/offers`, { token: contractorToken }));
  results.push(await check("contractor", "appointment", "GET", `${base}/api/web/contractor/appointment`, { token: contractorToken }));
  results.push(await check("contractor", "conversations", "GET", `${base}/api/web/contractor/conversations`, { token: contractorToken }));

  // Public (no auth)
  results.push(await check("public", "public-recent", "GET", `${base}/api/public/jobs/recent?limit=5`));
  results.push(await check("public", "public-by-location", "GET", `${base}/api/public/jobs/by-location?country=CA&regionCode=BC&city=Langley`));

  const repoRoot = path.resolve(process.cwd(), "..", "..");
  const jsonPath = path.join(repoRoot, "AUDIT_RUN_RESULTS.json");
  const mdPath = path.join(repoRoot, "AUDIT_RUN_RESULTS.md");

  fs.writeFileSync(jsonPath, JSON.stringify({ base, generatedAt: new Date().toISOString(), results }, null, 2));

  const failures = results.filter((r) => !r.ok);
  const lines: string[] = [];
  lines.push("## Dashboard Audit Runner Results");
  lines.push("");
  lines.push(`- Base: \`${base}\``);
  lines.push(`- Generated: \`${new Date().toISOString()}\``);
  lines.push(`- Total checks: **${results.length}**`);
  lines.push(`- Failures: **${failures.length}**`);
  lines.push("");
  for (const r of results) {
    lines.push(`- **[${r.role}] ${r.name}**: \`${r.method} ${r.url}\` → **${r.status}** ${r.ok ? "PASS" : "FAIL"}`);
    if (!r.ok && r.bodySnippet) {
      lines.push("");
      lines.push("```");
      lines.push(r.bodySnippet);
      lines.push("```");
      lines.push("");
    }
  }
  fs.writeFileSync(mdPath, lines.join("\n"));

  // eslint-disable-next-line no-console
  console.log(JSON.stringify({ ok: failures.length === 0, failures: failures.length, jsonPath, mdPath }, null, 2));
}

main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error(e);
  process.exit(1);
});

