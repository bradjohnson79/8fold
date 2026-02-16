import path from "node:path";
import fs from "node:fs";
import crypto from "node:crypto";

type Step = {
  name: string;
  method: string;
  url: string;
  status: number;
  ok: boolean;
  note?: string;
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

function snippet(s: string, max = 1400) {
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

  const posterToken = await createSessionToken(await getUserIdByEmail("poster.audit@8fold.local"));
  const routerToken = await createSessionToken(await getUserIdByEmail("router.audit@8fold.local"));
  const contractorToken = await createSessionToken(await getUserIdByEmail("contractor.audit@8fold.local"));
  await client.end();

  const steps: Step[] = [];

  async function api(
    name: string,
    method: "GET" | "POST",
    url: string,
    opts?: { token?: string; jsonBody?: any },
  ): Promise<{ resp: Response; json: any | null; text: string }> {
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
      steps.push({ name, method, url, status: 0, ok: false, note: `FETCH_FAILED: ${String(e?.message ?? e)}` });
      throw e;
    }

    const text = await readTextSafe(resp);
    let json: any | null = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = null;
    }

    const ok = resp.status >= 200 && resp.status < 300;
    steps.push({
      name,
      method,
      url,
      status: resp.status,
      ok,
      ...(ok ? {} : { bodySnippet: snippet(text) }),
    });
    return { resp, json, text };
  }

  // Flow A — Job Poster publish + appears publicly
  const draftSavePayload = {
    jobTitle: "E2E (BC) Furniture assembly — Langley",
    scope: "Assemble one IKEA cabinet and mount to wall. Bring basic tools. Verify wall studs and level alignment.",
    tradeCategory: "FURNITURE_ASSEMBLY",
    jobType: "urban",
    timeWindow: "",
    address: { street: "20000 64 Ave", city: "Langley", provinceOrState: "BC", country: "CA", postalCode: "V2Y 1N7" },
    geo: { lat: 49.1044, lng: -122.8011 },
    items: [{ category: "Assembly", description: "IKEA cabinet assembly", quantity: 1 }],
    photoUrls: [],
  };
  const saved = await api("A1 drafts/save", "POST", `${base}/api/web/job-poster/drafts/save`, {
    token: posterToken,
    jsonBody: draftSavePayload,
  });
  const jobId = String(saved.json?.job?.id ?? "").trim();
  if (!jobId) throw new Error("Flow A failed: missing jobId from drafts/save response");

  await api("A2 start-appraisal", "POST", `${base}/api/web/job-poster/drafts/${encodeURIComponent(jobId)}/start-appraisal`, {
    token: posterToken,
    jsonBody: {},
  });

  const paymentIntent = await api("A3 create-payment-intent", "POST", `${base}/api/web/job-poster/jobs/${encodeURIComponent(jobId)}/create-payment-intent`, {
    token: posterToken,
    jsonBody: { selectedPriceCents: 25000, availability: { monday: { morning: true } } },
  });
  const paymentIntentId = String(paymentIntent.json?.paymentIntentId ?? "").trim();
  if (!paymentIntentId) throw new Error("Flow A failed: missing paymentIntentId from create-payment-intent response");

  await api("A4 confirm-payment", "POST", `${base}/api/web/job-poster/jobs/${encodeURIComponent(jobId)}/confirm-payment`, {
    token: posterToken,
    jsonBody: { paymentIntentId },
  });

  const publicList = await api(
    "A5 public-by-location",
    "GET",
    `${base}/api/public/jobs/by-location?country=CA&regionCode=BC&city=Langley`,
  );
  const publicJobs = Array.isArray(publicList.json?.jobs) ? publicList.json.jobs : [];
  const appearsPublicly = publicJobs.some((j: any) => String(j?.id) === jobId);
  if (!appearsPublicly) {
    steps.push({
      name: "A5 verify job appears publicly",
      method: "GET",
      url: `${base}/api/public/jobs/by-location?country=CA&regionCode=BC&city=Langley`,
      status: 200,
      ok: false,
      note: "Job not found in public listing payload",
      bodySnippet: snippet(JSON.stringify(publicList.json, null, 2)),
    });
  }

  const myJobs = await api("A6 my-jobs", "GET", `${base}/api/web/job-poster/jobs`, { token: posterToken });
  const myJobsRows = Array.isArray(myJobs.json?.jobs) ? myJobs.json.jobs : [];
  const appearsInMyJobs = myJobsRows.some((j: any) => String(j?.id) === jobId);
  if (!appearsInMyJobs) {
    steps.push({
      name: "A6 verify job appears in My Jobs",
      method: "GET",
      url: `${base}/api/web/job-poster/jobs`,
      status: 200,
      ok: false,
      note: "Job not found in job-poster jobs payload",
      bodySnippet: snippet(JSON.stringify(myJobs.json, null, 2)),
    });
  }

  // Flow B — Router routes job to contractor
  const routable = await api("B1 routable-jobs", "GET", `${base}/api/web/router/routable-jobs`, { token: routerToken });
  const routableRows = Array.isArray(routable.json?.jobs) ? routable.json.jobs : [];
  const routableHasJob = routableRows.some((j: any) => String(j?.id) === jobId);
  if (!routableHasJob) {
    steps.push({
      name: "B1 verify job routable",
      method: "GET",
      url: `${base}/api/web/router/routable-jobs`,
      status: 200,
      ok: false,
      note: "Job not found in routable jobs payload",
      bodySnippet: snippet(JSON.stringify(routable.json, null, 2)),
    });
  }

  const eligible = await api("B2 eligible-contractors", "GET", `${base}/api/jobs/${encodeURIComponent(jobId)}/contractors/eligible`, {
    token: routerToken,
  });
  const contractors = Array.isArray(eligible.json?.contractors) ? eligible.json.contractors : [];
  const contractorId = String(contractors[0]?.id ?? "").trim();
  if (!contractorId) throw new Error("Flow B failed: no eligible contractor id returned");

  await api("B3 apply-routing", "POST", `${base}/api/web/router/apply-routing`, {
    token: routerToken,
    jsonBody: { jobId, contractorIds: [contractorId] },
  });

  const queue = await api("B4 routed-jobs", "GET", `${base}/api/web/router/routed-jobs`, { token: routerToken });
  const queueRows = Array.isArray(queue.json?.jobs) ? queue.json.jobs : [];
  const queued = queueRows.some((j: any) => String(j?.id) === jobId);
  if (!queued) {
    steps.push({
      name: "B4 verify job in routing queue",
      method: "GET",
      url: `${base}/api/web/router/routed-jobs`,
      status: 200,
      ok: false,
      note: "Job not found in routing queue payload",
      bodySnippet: snippet(JSON.stringify(queue.json, null, 2)),
    });
  }

  // Flow C — Contractor accepts + appointment proposal + messaging unlock
  const offers = await api("C1 contractor offers", "GET", `${base}/api/web/contractor/offers`, { token: contractorToken });
  const offerRows = Array.isArray(offers.json?.offers) ? offers.json.offers : [];
  const offerForJob = offerRows.find((o: any) => String(o?.job?.id) === jobId) ?? null;
  if (!offerForJob) {
    steps.push({
      name: "C1 verify offer exists",
      method: "GET",
      url: `${base}/api/web/contractor/offers`,
      status: 200,
      ok: false,
      note: "Offer not found for job",
      bodySnippet: snippet(JSON.stringify(offers.json, null, 2)),
    });
  }

  await api("C2 accept dispatch", "POST", `${base}/api/web/contractor/dispatches/${encodeURIComponent(jobId)}/respond`, {
    token: contractorToken,
    jsonBody: { decision: "accept", estimatedCompletionDate: "2026-02-15" },
  });

  const appt = await api("C3 appointment GET", "GET", `${base}/api/web/contractor/appointment`, { token: contractorToken });
  const allowedDays: string[] = (appt.json?.active?.allowedDays ?? []) as any;
  const day = allowedDays[0] ?? null;
  if (day) {
    await api("C4 appointment POST", "POST", `${base}/api/web/contractor/appointment`, {
      token: contractorToken,
      jsonBody: { jobId, day, timeOfDay: "Morning" },
    });
  } else {
    steps.push({
      name: "C3 verify allowedDays present",
      method: "GET",
      url: `${base}/api/web/contractor/appointment`,
      status: 200,
      ok: false,
      note: "No allowedDays returned; cannot post appointment proposal",
      bodySnippet: snippet(JSON.stringify(appt.json, null, 2)),
    });
  }

  const convs = await api("C5 contractor conversations", "GET", `${base}/api/web/contractor/conversations`, { token: contractorToken });
  const convRows = Array.isArray(convs.json?.conversations) ? convs.json.conversations : [];
  const conv = convRows.find((c: any) => String(c?.jobId) === jobId) ?? null;
  if (!conv) {
    steps.push({
      name: "C5 verify conversation exists",
      method: "GET",
      url: `${base}/api/web/contractor/conversations`,
      status: 200,
      ok: false,
      note: "Conversation not found for job",
      bodySnippet: snippet(JSON.stringify(convs.json, null, 2)),
    });
  }

  const ok = steps.every((s) => s.ok);
  const repoRoot = path.resolve(process.cwd(), "..", "..");
  const reportPath = path.join(repoRoot, "E2E_FINAL_REPORT.md");

  const lines: string[] = [];
  lines.push("## Final E2E Proof (3 flows)");
  lines.push("");
  lines.push(`- Base: \`${base}\``);
  lines.push(`- Generated: \`${new Date().toISOString()}\``);
  lines.push(`- Result: **${ok ? "PASS" : "FAIL"}**`);
  lines.push(`- JobId: \`${jobId}\``);
  lines.push("");
  lines.push("### Steps");
  lines.push("");
  for (const s of steps) {
    lines.push(`- **${s.name}**: \`${s.method} ${s.url}\` → **${s.status}** ${s.ok ? "PASS" : "FAIL"}${s.note ? ` (${s.note})` : ""}`);
    if (!s.ok && s.bodySnippet) {
      lines.push("");
      lines.push("```");
      lines.push(s.bodySnippet);
      lines.push("```");
      lines.push("");
    }
  }
  lines.push("");
  lines.push("### Tables written (expected)");
  lines.push("");
  lines.push("- **Flow A**: `Job`, `JobPayment`, `AuditLog`, `JobPhoto` (optional)");
  lines.push("- **Flow B**: `JobDispatch`, `Job`, `AuditLog`");
  lines.push("- **Flow C**: `JobDispatch`, `JobAssignment`, `Job`, `conversations`, `messages` (via appointment), `AuditLog`");
  fs.writeFileSync(reportPath, lines.join("\n"));

  // eslint-disable-next-line no-console
  console.log(JSON.stringify({ ok, reportPath }, null, 2));
}

main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error(e);
  process.exit(1);
});

