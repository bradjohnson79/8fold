/**
 * Admin auth + status override smoke test.
 *
 * Verifies:
 * 1) Login returns admin_session cookie
 * 2) /api/admin/v4/auth/me succeeds with that cookie
 * 3) Status override endpoint writes canonical status for a test job
 * 4) Job detail re-read matches requested canonical status
 *
 * Required env:
 * - ADMIN_EMAIL
 * - ADMIN_PASSWORD
 * - ADMIN_STATUS_TEST_JOB_ID
 *
 * Optional env:
 * - ADMIN_ORIGIN (default: https://admin.8fold.app)
 * - ADMIN_STATUS_TARGET (default: OPEN_FOR_ROUTING)
 */

type ApiOk<T> = { ok: true; data: T };
type ApiErr = { ok: false; error?: { code?: string; message?: string } | string; message?: string };
type ApiResult<T> = ApiOk<T> | ApiErr;

function reqEnv(name: string): string {
  const value = String(process.env[name] ?? "").trim();
  if (!value) throw new Error(`Missing required env: ${name}`);
  return value;
}

function getCookieValue(setCookieHeader: string | null, name: string): string {
  const header = String(setCookieHeader ?? "");
  if (!header) return "";
  const parts = header.split(/,\s*(?=[^;]+=)/g);
  for (const part of parts) {
    const first = part.split(";")[0]?.trim() ?? "";
    const idx = first.indexOf("=");
    if (idx <= 0) continue;
    const key = first.slice(0, idx).trim();
    if (key !== name) continue;
    return first.slice(idx + 1).trim();
  }
  return "";
}

async function readJson<T>(resp: Response): Promise<ApiResult<T> | null> {
  return (await resp.json().catch(() => null)) as any;
}

function normalizeStatus(input: string): string {
  const upper = String(input ?? "").trim().toUpperCase();
  if (upper === "CUSTOMER_APPROVED_AWAITING_ROUTER") return "OPEN_FOR_ROUTING";
  return upper;
}

async function main() {
  const adminOrigin = String(process.env.ADMIN_ORIGIN ?? "https://admin.8fold.app").trim().replace(/\/+$/, "");
  const email = reqEnv("ADMIN_EMAIL");
  const password = reqEnv("ADMIN_PASSWORD");
  const jobId = reqEnv("ADMIN_STATUS_TEST_JOB_ID");
  const targetStatus = normalizeStatus(String(process.env.ADMIN_STATUS_TARGET ?? "OPEN_FOR_ROUTING"));

  console.log(`Admin origin: ${adminOrigin}`);
  console.log(`Test job id: ${jobId}`);
  console.log(`Target status: ${targetStatus}`);

  const loginResp = await fetch(`${adminOrigin}/api/admin/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password }),
    cache: "no-store",
  });
  const loginJson = await readJson<{ authenticated: boolean }>(loginResp);
  if (!loginResp.ok || !loginJson || loginJson.ok !== true) {
    throw new Error(`Login failed (${loginResp.status})`);
  }
  const session = getCookieValue(loginResp.headers.get("set-cookie"), "admin_session");
  if (!session) throw new Error("Login succeeded but admin_session cookie missing");
  console.log("[PASS] login + session cookie");

  const meResp = await fetch(`${adminOrigin}/api/admin/v4/auth/me`, {
    method: "GET",
    headers: { cookie: `admin_session=${session}` },
    cache: "no-store",
  });
  const meJson = await readJson<{ admin: { id: string; email: string; role: string } }>(meResp);
  if (!meResp.ok || !meJson || meJson.ok !== true || !meJson.data?.admin?.email) {
    throw new Error(`/auth/me failed (${meResp.status})`);
  }
  console.log(`[PASS] auth/me as ${meJson.data.admin.email} (${meJson.data.admin.role})`);

  const writeResp = await fetch(`${adminOrigin}/api/admin/v4/jobs/${encodeURIComponent(jobId)}/status`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      cookie: `admin_session=${session}`,
    },
    body: JSON.stringify({ status: targetStatus, note: "auth smoke test" }),
    cache: "no-store",
  });
  const writeJson = await readJson<any>(writeResp);
  if (!writeResp.ok || !writeJson || writeJson.ok !== true) {
    const errCode = (writeJson as any)?.error?.code ?? "UNKNOWN";
    const errMsg = (writeJson as any)?.error?.message ?? "Request failed";
    throw new Error(`Status write failed (${writeResp.status}) ${errCode}: ${errMsg}`);
  }
  const actualFromMutation = String(writeJson.data?.mutation?.actualStatus ?? "").trim().toUpperCase();
  if (actualFromMutation !== targetStatus) {
    throw new Error(`Status write mismatch: expected=${targetStatus} actual=${actualFromMutation || "(empty)"}`);
  }
  console.log(`[PASS] status write mutation.actualStatus=${actualFromMutation}`);

  const readResp = await fetch(`${adminOrigin}/api/admin/v4/jobs/${encodeURIComponent(jobId)}`, {
    method: "GET",
    headers: { cookie: `admin_session=${session}` },
    cache: "no-store",
  });
  const readJsonBody = await readJson<any>(readResp);
  if (!readResp.ok || !readJsonBody || readJsonBody.ok !== true) {
    throw new Error(`Job detail read failed (${readResp.status})`);
  }
  const rawStatus = String(readJsonBody.data?.job?.statusRaw ?? "").trim().toUpperCase();
  if (rawStatus !== targetStatus) {
    throw new Error(`Round-trip read mismatch: expected=${targetStatus} actual=${rawStatus || "(empty)"}`);
  }
  console.log(`[PASS] round-trip statusRaw=${rawStatus}`);
  console.log("Admin auth + status smoke passed.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
