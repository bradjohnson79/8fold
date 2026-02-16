/* eslint-disable no-console */
/**
 * Financial Lifecycle Gatekeeper (LOCALHOST)
 *
 * Contract:
 * - Dedicated harness (do not mix with general lifecycle)
 * - Fail fast, no retries
 * - Structured exit codes
 * - API calls only (no direct DB writes/reads)
 */

import crypto from "node:crypto";
import Stripe from "stripe";

const BASE_URL = process.env.BASE_URL ?? "http://localhost:3000";

enum ExitCode {
  OK = 0,
  FINANCIAL_CONTRACT_VIOLATION = 60,
  UNEXPECTED_PAYOUT_STATE = 70,
  HOLD_LOGIC_BROKEN = 80,
}

type HttpMethod = "GET" | "POST";

function isLocalhost(url: string): boolean {
  try {
    const u = new URL(url);
    return u.hostname === "localhost" || u.hostname === "127.0.0.1" || u.hostname === "::1";
  } catch {
    return false;
  }
}

function truncateBody(body: string, max = 400): string {
  const t = String(body ?? "").replace(/\s+/g, " ").trim();
  return t.length <= max ? t : `${t.slice(0, max)}…`;
}

function fail(code: ExitCode, reason: string, extra?: Record<string, any>): never {
  const payload = { status: "failed", code, reason, ...(extra ?? {}) };
  console.error(JSON.stringify(payload, null, 2));
  process.exit(code);
}

function assert(cond: any, code: ExitCode, reason: string, extra?: Record<string, any>): asserts cond {
  if (cond) return;
  fail(code, reason, extra);
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
  const url = `${BASE_URL.replace(/\/+$/, "")}${pathOnly}`;
  const headers: Record<string, string> = { ...(opts?.headers ?? {}) };
  const cookie = jar.header();
  if (cookie) headers.cookie = cookie;
  if (opts?.json !== undefined) headers["content-type"] = "application/json";

  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), 12_000);

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
    fail(ExitCode.FINANCIAL_CONTRACT_VIOLATION, "SERVER_UNREACHABLE", {
      endpoint: pathOnly,
      error: e instanceof Error ? e.message : String(e),
    });
  } finally {
    clearTimeout(t);
  }

  jar.setFromSetCookie(resp.headers.get("set-cookie"));

  const text = await resp.text().catch(() => "");
  const json = (() => {
    try {
      return JSON.parse(text);
    } catch {
      return null;
    }
  })();

  if (json === null) {
    fail(ExitCode.FINANCIAL_CONTRACT_VIOLATION, "NON_JSON_RESPONSE", {
      endpoint: pathOnly,
      http_status: resp.status,
      body: truncateBody(text),
    });
  }

  if (resp.status >= 500) {
    fail(ExitCode.FINANCIAL_CONTRACT_VIOLATION, "SERVER_ERROR", {
      endpoint: pathOnly,
      http_status: resp.status,
      body: truncateBody(text),
    });
  }

  return { status: resp.status, json, text };
}

function bearer(sessionToken: string): Record<string, string> {
  return { Authorization: `Bearer ${sessionToken}` };
}

function internalAdminHeaders(): Record<string, string> {
  const secret = String(process.env.INTERNAL_SECRET ?? "").trim();
  const adminId = String(process.env.FIN_ADMIN_ID ?? "").trim();
  assert(secret, ExitCode.FINANCIAL_CONTRACT_VIOLATION, "INTERNAL_SECRET_MISSING");
  assert(adminId, ExitCode.FINANCIAL_CONTRACT_VIOLATION, "FIN_ADMIN_ID_MISSING");
  return { "x-internal-secret": secret, "x-admin-id": adminId };
}

function nonNegativeInt(v: unknown, code: ExitCode, reason: string): number {
  const n = Number(v ?? 0);
  assert(Number.isFinite(n) && Number.isInteger(n) && n >= 0, code, reason, { value: v });
  return n;
}

type MoneyInvariant = {
  amountCents: number;
  paymentCurrency: string;
  laborTotalCents: number;
  materialsTotalCents: number;
  transactionFeeCents: number;
  contractorPayoutCents: number;
  routerEarningsCents: number;
  brokerFeeCents: number;
};

function snapshotMoney(job: any): MoneyInvariant {
  return {
    amountCents: nonNegativeInt(job?.amountCents, ExitCode.UNEXPECTED_PAYOUT_STATE, "INVALID_AMOUNT_CENTS"),
    paymentCurrency: String(job?.paymentCurrency ?? "").trim().toLowerCase(),
    laborTotalCents: nonNegativeInt(job?.laborTotalCents, ExitCode.UNEXPECTED_PAYOUT_STATE, "INVALID_LABOR_CENTS"),
    materialsTotalCents: nonNegativeInt(job?.materialsTotalCents, ExitCode.UNEXPECTED_PAYOUT_STATE, "INVALID_MATERIALS_CENTS"),
    transactionFeeCents: nonNegativeInt(job?.transactionFeeCents, ExitCode.UNEXPECTED_PAYOUT_STATE, "INVALID_TXFEE_CENTS"),
    contractorPayoutCents: nonNegativeInt(job?.contractorPayoutCents, ExitCode.UNEXPECTED_PAYOUT_STATE, "INVALID_CONTRACTOR_PAYOUT_CENTS"),
    routerEarningsCents: nonNegativeInt(job?.routerEarningsCents, ExitCode.UNEXPECTED_PAYOUT_STATE, "INVALID_ROUTER_EARNINGS_CENTS"),
    brokerFeeCents: nonNegativeInt(job?.brokerFeeCents, ExitCode.UNEXPECTED_PAYOUT_STATE, "INVALID_BROKER_FEE_CENTS"),
  };
}

function assertMoneyInvariantUnchanged(before: MoneyInvariant, after: MoneyInvariant, stage: string) {
  const keys: Array<keyof MoneyInvariant> = [
    "amountCents",
    "paymentCurrency",
    "laborTotalCents",
    "materialsTotalCents",
    "transactionFeeCents",
    "contractorPayoutCents",
    "routerEarningsCents",
    "brokerFeeCents",
  ];
  for (const k of keys) {
    if ((before as any)[k] !== (after as any)[k]) {
      fail(ExitCode.UNEXPECTED_PAYOUT_STATE, "CENTS_TOTALS_CHANGED", {
        stage,
        key: k,
        before: (before as any)[k],
        after: (after as any)[k],
      });
    }
  }
}

async function login(jar: CookieJar, email: string) {
  const reqRes = await fetchJson(jar, "POST", "/api/auth/request", { json: { email } });
  assert(reqRes.status === 200, ExitCode.FINANCIAL_CONTRACT_VIOLATION, "AUTH_REQUEST_FAILED", {
    http_status: reqRes.status,
    body: truncateBody(reqRes.text),
  });
  const verRes = await fetchJson(jar, "POST", "/api/auth/verify", { json: { code: "123456" } });
  assert(verRes.status === 200, ExitCode.FINANCIAL_CONTRACT_VIOLATION, "AUTH_VERIFY_FAILED", {
    http_status: verRes.status,
    body: truncateBody(verRes.text),
  });
  const sessionToken = String((verRes.json as any)?.sessionToken ?? "");
  const userId = String((verRes.json as any)?.user?.id ?? "");
  const role = String((verRes.json as any)?.user?.role ?? "");
  assert(sessionToken && userId, ExitCode.FINANCIAL_CONTRACT_VIOLATION, "AUTH_VERIFY_MISSING_SESSION", {
    email,
    json: verRes.json,
  });
  return { sessionToken, userId, role };
}

async function getAdminJob(jar: CookieJar, jobId: string) {
  const res = await fetchJson(jar, "GET", `/api/admin/jobs/${encodeURIComponent(jobId)}`, {
    headers: internalAdminHeaders(),
  });
  assert(res.status === 200, ExitCode.FINANCIAL_CONTRACT_VIOLATION, "ADMIN_JOB_GET_FAILED", {
    http_status: res.status,
    body: truncateBody(res.text),
  });
  const job = (res.json as any)?.data ?? null;
  assert(job && String(job.id ?? "") === jobId, ExitCode.FINANCIAL_CONTRACT_VIOLATION, "ADMIN_JOB_GET_BAD_SHAPE", { json: res.json });
  return job;
}

async function getApprovedContractorByEmail(jar: CookieJar, email: string) {
  const q = encodeURIComponent(email);
  const res = await fetchJson(jar, "GET", `/api/admin/contractors?status=APPROVED&q=${q}`, {
    headers: internalAdminHeaders(),
  });
  assert(res.status === 200, ExitCode.FINANCIAL_CONTRACT_VIOLATION, "ADMIN_CONTRACTORS_GET_FAILED", {
    http_status: res.status,
    body: truncateBody(res.text),
  });
  const list = (res.json as any)?.data?.contractors ?? [];
  assert(Array.isArray(list), ExitCode.FINANCIAL_CONTRACT_VIOLATION, "ADMIN_CONTRACTORS_BAD_SHAPE", { json: res.json });
  const c = list.find((x: any) => String(x?.email ?? "").trim().toLowerCase() === email.trim().toLowerCase()) ?? null;
  assert(c, ExitCode.FINANCIAL_CONTRACT_VIOLATION, "CONTRACTOR_NOT_FOUND_BY_EMAIL", { email });
  return c as any;
}

async function postSignedStripeWebhook(payload: string, secret: string) {
  const sig = Stripe.webhooks.generateTestHeaderString({ payload, secret });
  const url = `${BASE_URL.replace(/\/+$/, "")}/api/webhooks/stripe`;
  const resp = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", "stripe-signature": sig },
    body: payload,
  });
  const text = await resp.text().catch(() => "");
  const json = (() => {
    try {
      return JSON.parse(text);
    } catch {
      return null;
    }
  })();
  assert(json !== null, ExitCode.FINANCIAL_CONTRACT_VIOLATION, "WEBHOOK_NON_JSON", {
    http_status: resp.status,
    body: truncateBody(text),
  });
  assert(resp.status === 200, ExitCode.FINANCIAL_CONTRACT_VIOLATION, "WEBHOOK_FAILED", {
    http_status: resp.status,
    body: truncateBody(text),
  });
}

async function main(): Promise<void> {
  assert(isLocalhost(BASE_URL), ExitCode.FINANCIAL_CONTRACT_VIOLATION, "NON_LOCALHOST_BASE_URL", { baseUrl: BASE_URL });

  const STRIPE_WEBHOOK_SECRET = String(process.env.STRIPE_WEBHOOK_SECRET ?? "").trim();
  assert(STRIPE_WEBHOOK_SECRET, ExitCode.FINANCIAL_CONTRACT_VIOLATION, "STRIPE_WEBHOOK_SECRET_MISSING");

  const posterEmail = String(process.env.FIN_JOB_POSTER_EMAIL ?? "").trim();
  const routerEmail = String(process.env.FIN_ROUTER_EMAIL ?? "").trim();
  const contractorEmail = String(process.env.FIN_CONTRACTOR_EMAIL ?? "").trim();
  assert(posterEmail, ExitCode.FINANCIAL_CONTRACT_VIOLATION, "FIN_JOB_POSTER_EMAIL_MISSING");
  assert(routerEmail, ExitCode.FINANCIAL_CONTRACT_VIOLATION, "FIN_ROUTER_EMAIL_MISSING");
  assert(contractorEmail, ExitCode.FINANCIAL_CONTRACT_VIOLATION, "FIN_CONTRACTOR_EMAIL_MISSING");

  const jar = new CookieJar();

  // Preflight: auth + webhook surface.
  {
    const res = await fetchJson(jar, "POST", "/api/auth/request", { json: { email: "preflight@8fold.local" } });
    assert(res.status === 200, ExitCode.FINANCIAL_CONTRACT_VIOLATION, "AUTH_PREFLIGHT_FAILED");
    const w = await fetchJson(jar, "POST", "/api/webhooks/stripe", { json: {} });
    assert(w.status === 400, ExitCode.FINANCIAL_CONTRACT_VIOLATION, "WEBHOOK_PREFLIGHT_EXPECTED_400", { http_status: w.status });
  }

  // Auth: real users (no role mutation; no bypass).
  const poster = await login(jar, posterEmail);
  const router = await login(jar, routerEmail);
  const contractorUser = await login(jar, contractorEmail);

  // Validate poster + router profiles (role guards enforced by endpoints).
  const posterProfileRes = await fetchJson(jar, "GET", "/api/web/job-poster/profile", { headers: bearer(poster.sessionToken) });
  assert(posterProfileRes.status === 200, ExitCode.FINANCIAL_CONTRACT_VIOLATION, "POSTER_PROFILE_GET_FAILED", {
    http_status: posterProfileRes.status,
    body: truncateBody(posterProfileRes.text),
  });
  const posterProfile = (posterProfileRes.json as any)?.profile ?? null;
  assert(posterProfile, ExitCode.FINANCIAL_CONTRACT_VIOLATION, "POSTER_PROFILE_MISSING_OR_NOT_PROVISIONED");
  const posterCountry = String(posterProfile.country ?? "").trim().toUpperCase();
  const posterState = String(posterProfile.stateProvince ?? "").trim().toUpperCase();
  const posterCity = String(posterProfile.city ?? "").trim();
  assert(posterCountry === "CA" || posterCountry === "US", ExitCode.FINANCIAL_CONTRACT_VIOLATION, "POSTER_PROFILE_BAD_COUNTRY", {
    posterCountry,
  });
  assert(posterState.length >= 2, ExitCode.FINANCIAL_CONTRACT_VIOLATION, "POSTER_PROFILE_BAD_STATE", { posterState });
  assert(posterCity, ExitCode.FINANCIAL_CONTRACT_VIOLATION, "POSTER_PROFILE_BAD_CITY", { posterCity });

  const routerProfileRes = await fetchJson(jar, "GET", "/api/web/router/profile", { headers: bearer(router.sessionToken) });
  assert(routerProfileRes.status === 200, ExitCode.FINANCIAL_CONTRACT_VIOLATION, "ROUTER_PROFILE_GET_FAILED", {
    http_status: routerProfileRes.status,
    body: truncateBody(routerProfileRes.text),
  });
  const routerInfo = (routerProfileRes.json as any)?.router ?? null;
  assert(routerInfo, ExitCode.FINANCIAL_CONTRACT_VIOLATION, "ROUTER_PROFILE_BAD_SHAPE", { json: routerProfileRes.json });
  const homeCountry = String(routerInfo.homeCountry ?? "").trim().toUpperCase();
  const homeRegionCode = String(routerInfo.homeRegionCode ?? "").trim().toUpperCase();
  assert(homeCountry === posterCountry && homeRegionCode === posterState, ExitCode.FINANCIAL_CONTRACT_VIOLATION, "ROUTER_POSTER_REGION_MISMATCH", {
    homeCountry,
    homeRegionCode,
    posterCountry,
    posterState,
  });

  // Resolve Contractor.id via admin endpoint (no DB access).
  const contractor = await getApprovedContractorByEmail(jar, contractorEmail);
  const contractorId = String(contractor.id ?? "").trim();
  assert(contractorId, ExitCode.FINANCIAL_CONTRACT_VIOLATION, "CONTRACTOR_ID_MISSING", { contractor });
  const lat = Number(contractor.lat);
  const lng = Number(contractor.lng);
  assert(Number.isFinite(lat) && Number.isFinite(lng), ExitCode.FINANCIAL_CONTRACT_VIOLATION, "CONTRACTOR_MISSING_COORDS", {
    lat,
    lng,
  });
  const tradeCategories: string[] = Array.isArray(contractor.tradeCategories) ? contractor.tradeCategories : [];
  const tradeCategory = String(tradeCategories[0] ?? "HANDYMAN").toUpperCase();

  // Create job (poster).
  const runId = crypto.randomUUID().slice(0, 8);
  const create = await fetchJson(jar, "POST", "/api/web/job-poster/jobs/create-draft", {
    headers: bearer(poster.sessionToken),
    json: {
      jobTitle: `Financial harness job ${runId}`,
      scope: "Financial lifecycle harness scope (min length). This job is for contract assertions.",
      tradeCategory,
      jobType: "urban",
      timeWindow: "weekday mornings",
      address: {
        street: String(posterProfile.address ?? "123 Test St"),
        city: posterCity,
        provinceOrState: posterState,
        country: posterCountry,
      },
      geo: { lat, lng },
      items: [{ category: "General", description: "Harness item", quantity: 1 }],
      photoUrls: [],
    },
  });
  assert(create.status === 201, ExitCode.FINANCIAL_CONTRACT_VIOLATION, "JOB_CREATE_DRAFT_FAILED", {
    http_status: create.status,
    body: truncateBody(create.text),
  });
  const jobId = String((create.json as any)?.job?.id ?? "");
  assert(jobId, ExitCode.FINANCIAL_CONTRACT_VIOLATION, "JOB_CREATE_DRAFT_MISSING_ID", { json: create.json });

  // Fund job (signed webhook, real endpoint).
  const preFund = await getAdminJob(jar, jobId);
  const amount = nonNegativeInt(preFund.laborTotalCents, ExitCode.UNEXPECTED_PAYOUT_STATE, "INVALID_LABOR_CENTS") +
    nonNegativeInt(preFund.materialsTotalCents, ExitCode.UNEXPECTED_PAYOUT_STATE, "INVALID_MATERIALS_CENTS") +
    nonNegativeInt(preFund.transactionFeeCents, ExitCode.UNEXPECTED_PAYOUT_STATE, "INVALID_TXFEE_CENTS");
  assert(amount > 0, ExitCode.UNEXPECTED_PAYOUT_STATE, "NON_POSITIVE_JOB_TOTAL_FOR_FUNDING", { amount });

  const currency = posterCountry === "CA" ? "cad" : "usd";
  const eventId = `evt_fin_${runId}`;
  const piId = `pi_fin_${runId}`;
  const payload = JSON.stringify({
    id: eventId,
    object: "event",
    api_version: "2023-10-16",
    created: Math.floor(Date.now() / 1000),
    type: "payment_intent.succeeded",
    data: {
      object: {
        id: piId,
        object: "payment_intent",
        amount,
        currency,
        status: "succeeded",
        latest_charge: `ch_fin_${runId}`,
        metadata: {
          type: "job_escrow",
          jobId,
          posterId: poster.userId,
        },
      },
    },
  });
  await postSignedStripeWebhook(payload, STRIPE_WEBHOOK_SECRET);

  const funded = await getAdminJob(jar, jobId);
  assert(String(funded.paymentStatus ?? "").toUpperCase() === "FUNDED", ExitCode.UNEXPECTED_PAYOUT_STATE, "JOB_NOT_FUNDED", {
    paymentStatus: funded.paymentStatus,
  });
  assert(String(funded.status ?? "").toUpperCase() === "OPEN_FOR_ROUTING", ExitCode.UNEXPECTED_PAYOUT_STATE, "JOB_NOT_OPEN_FOR_ROUTING", {
    status: funded.status,
  });
  assert(Number(funded.amountCents ?? 0) === amount, ExitCode.UNEXPECTED_PAYOUT_STATE, "JOB_AMOUNT_CENTS_NOT_SET_FROM_FUNDING", {
    amountCents: funded.amountCents,
    expected: amount,
  });

  const baseline = snapshotMoney(funded);

  // Route job (router).
  const routeRes = await fetchJson(jar, "POST", "/api/web/router/apply-routing", {
    headers: bearer(router.sessionToken),
    json: { jobId, contractorIds: [contractorId] },
  });
  assert(routeRes.status === 200 && (routeRes.json as any)?.ok === true, ExitCode.FINANCIAL_CONTRACT_VIOLATION, "APPLY_ROUTING_FAILED", {
    http_status: routeRes.status,
    body: truncateBody(routeRes.text),
  });
  assertMoneyInvariantUnchanged(baseline, snapshotMoney(await getAdminJob(jar, jobId)), "after_routing");

  // Contractor accepts.
  const acceptRes = await fetchJson(jar, "POST", `/api/web/contractor/dispatches/${encodeURIComponent(jobId)}/respond`, {
    headers: bearer(contractorUser.sessionToken),
    json: { decision: "accept", estimatedCompletionDate: "2026-02-11" },
  });
  assert(acceptRes.status === 200, ExitCode.FINANCIAL_CONTRACT_VIOLATION, "CONTRACTOR_ACCEPT_FAILED", {
    http_status: acceptRes.status,
    body: truncateBody(acceptRes.text),
  });
  assertMoneyInvariantUnchanged(baseline, snapshotMoney(await getAdminJob(jar, jobId)), "after_accept");

  // Contractor completes (twice must fail).
  {
    const r1 = await fetchJson(jar, "POST", `/api/web/contractor/jobs/${encodeURIComponent(jobId)}/complete`, {
      headers: bearer(contractorUser.sessionToken),
      json: { summary: "Contractor completion summary for financial lifecycle harness (first attempt)." },
    });
    assert(r1.status === 200, ExitCode.FINANCIAL_CONTRACT_VIOLATION, "CONTRACTOR_COMPLETE_FAILED", {
      http_status: r1.status,
      body: truncateBody(r1.text),
    });
    assertMoneyInvariantUnchanged(baseline, snapshotMoney(await getAdminJob(jar, jobId)), "after_contractor_complete_1");

    const r2 = await fetchJson(jar, "POST", `/api/web/contractor/jobs/${encodeURIComponent(jobId)}/complete`, {
      headers: bearer(contractorUser.sessionToken),
      json: { summary: "Contractor completion summary (second attempt must fail)." },
    });
    assert(r2.status >= 400 && r2.status < 500, ExitCode.FINANCIAL_CONTRACT_VIOLATION, "CONTRACTOR_COMPLETE_SECOND_SUCCEEDED", {
      http_status: r2.status,
      body: truncateBody(r2.text),
    });
    assertMoneyInvariantUnchanged(baseline, snapshotMoney(await getAdminJob(jar, jobId)), "after_contractor_complete_2");
  }

  // Poster confirms completion (twice must fail).
  {
    const r1 = await fetchJson(jar, "POST", `/api/web/job-poster/jobs/${encodeURIComponent(jobId)}/confirm-completion`, {
      headers: bearer(poster.sessionToken),
      json: { summary: "Poster completion confirmation summary for financial lifecycle harness (first attempt)." },
    });
    assert(r1.status === 200, ExitCode.FINANCIAL_CONTRACT_VIOLATION, "POSTER_CONFIRM_FAILED", {
      http_status: r1.status,
      body: truncateBody(r1.text),
    });
    assertMoneyInvariantUnchanged(baseline, snapshotMoney(await getAdminJob(jar, jobId)), "after_poster_confirm_1");

    const r2 = await fetchJson(jar, "POST", `/api/web/job-poster/jobs/${encodeURIComponent(jobId)}/confirm-completion`, {
      headers: bearer(poster.sessionToken),
      json: { summary: "Poster completion confirmation (second attempt must fail)." },
    });
    assert(r2.status >= 400 && r2.status < 500, ExitCode.FINANCIAL_CONTRACT_VIOLATION, "POSTER_CONFIRM_SECOND_SUCCEEDED", {
      http_status: r2.status,
      body: truncateBody(r2.text),
    });
    assertMoneyInvariantUnchanged(baseline, snapshotMoney(await getAdminJob(jar, jobId)), "after_poster_confirm_2");
  }

  // Trigger hold creation via real dispute flow (creates DISPUTE hold and sets job DISPUTED).
  const partsRes = await fetchJson(jar, "GET", `/api/web/support/jobs/${encodeURIComponent(jobId)}/participants`, {
    headers: bearer(poster.sessionToken),
  });
  assert(partsRes.status === 200, ExitCode.HOLD_LOGIC_BROKEN, "PARTICIPANTS_FETCH_FAILED", {
    http_status: partsRes.status,
    body: truncateBody(partsRes.text),
  });
  const participants = (partsRes.json as any)?.participants ?? null;
  const contractorUserId = String(participants?.contractorUserId ?? "");
  assert(contractorUserId, ExitCode.HOLD_LOGIC_BROKEN, "CONTRACTOR_PARTICIPANT_MISSING", { json: partsRes.json });

  const disputeCreate = await fetchJson(jar, "POST", "/api/web/support/disputes", {
    headers: bearer(poster.sessionToken),
    json: {
      jobId,
      againstUserId: contractorUserId,
      againstRole: "CONTRACTOR",
      disputeReason: "WORK_QUALITY",
      subject: "Financial harness dispute (hold creation)",
      description:
        "Financial harness dispute description: this is intentionally long enough to satisfy the minimum length requirement for dispute filing in the API. It triggers a payout hold for contract validation.",
      roleContext: "JOB_POSTER",
      category: "PAYOUTS",
      priority: "NORMAL",
      message: "Harness dispute created to validate hold + payout gating.",
    },
  });
  assert(disputeCreate.status === 201, ExitCode.HOLD_LOGIC_BROKEN, "DISPUTE_CREATE_FAILED", {
    http_status: disputeCreate.status,
    body: truncateBody(disputeCreate.text),
  });
  const disputeId = String((disputeCreate.json as any)?.dispute?.id ?? "");
  assert(disputeId, ExitCode.HOLD_LOGIC_BROKEN, "DISPUTE_CREATE_MISSING_ID", { json: disputeCreate.json });

  // Duplicate hold protection: second dispute should fail (job already disputed).
  const dispute2 = await fetchJson(jar, "POST", "/api/web/support/disputes", {
    headers: bearer(poster.sessionToken),
    json: {
      jobId,
      againstUserId: contractorUserId,
      againstRole: "CONTRACTOR",
      disputeReason: "WORK_QUALITY",
      subject: "Financial harness dispute (duplicate attempt)",
      description:
        "Duplicate attempt: this description is long enough to satisfy validation, but should be rejected because the job is already disputed.",
      roleContext: "JOB_POSTER",
    },
  });
  assert(dispute2.status >= 400 && dispute2.status < 500, ExitCode.HOLD_LOGIC_BROKEN, "DUPLICATE_DISPUTE_SUCCEEDED", {
    http_status: dispute2.status,
    body: truncateBody(dispute2.text),
  });

  const disputedJob = await getAdminJob(jar, jobId);
  assert(String(disputedJob.status ?? "").toUpperCase() === "DISPUTED", ExitCode.HOLD_LOGIC_BROKEN, "JOB_NOT_DISPUTED_AFTER_DISPUTE_CREATE", {
    status: disputedJob.status,
  });
  assert(String(disputedJob.payoutStatus ?? "").toUpperCase() !== "RELEASED", ExitCode.UNEXPECTED_PAYOUT_STATE, "PAYOUT_RELEASED_WHILE_HELD", {
    payoutStatus: disputedJob.payoutStatus,
  });
  assert(disputedJob.releasedAt == null, ExitCode.UNEXPECTED_PAYOUT_STATE, "RELEASED_AT_SET_WHILE_HELD", { releasedAt: disputedJob.releasedAt });
  assertMoneyInvariantUnchanged(baseline, snapshotMoney(disputedJob), "after_hold_create");

  // Admin vote + resolve (hold cleared + payout released). Second resolve must fail.
  const vote = await fetchJson(jar, "POST", `/api/admin/support/disputes/${encodeURIComponent(disputeId)}/votes`, {
    headers: internalAdminHeaders(),
    json: {
      decision: "FAVOR_CONTRACTOR",
      reasoning: "Financial harness: approving contractor to validate release + double-spend protection.",
    },
  });
  assert(vote.status === 201, ExitCode.FINANCIAL_CONTRACT_VIOLATION, "DISPUTE_VOTE_FAILED", {
    http_status: vote.status,
    body: truncateBody(vote.text),
  });

  const resolve1 = await fetchJson(jar, "POST", `/api/admin/support/disputes/${encodeURIComponent(disputeId)}/resolve`, {
    headers: internalAdminHeaders(),
    json: {
      outcome: "CONTRACTOR_WINS",
      resolutionSummary: "Financial harness: contractor wins; release hold and release funds.",
      adminOverrideTie: false,
    },
  });
  assert(resolve1.status === 200, ExitCode.HOLD_LOGIC_BROKEN, "DISPUTE_RESOLVE_FAILED", {
    http_status: resolve1.status,
    body: truncateBody(resolve1.text),
  });

  const afterResolve = await getAdminJob(jar, jobId);
  assert(String(afterResolve.payoutStatus ?? "").toUpperCase() === "RELEASED", ExitCode.UNEXPECTED_PAYOUT_STATE, "PAYOUT_NOT_RELEASED_AFTER_RESOLVE", {
    payoutStatus: afterResolve.payoutStatus,
  });
  assert(afterResolve.releasedAt != null, ExitCode.UNEXPECTED_PAYOUT_STATE, "RELEASED_AT_MISSING_AFTER_RESOLVE");
  assert(String(afterResolve.contractorTransferId ?? ""), ExitCode.UNEXPECTED_PAYOUT_STATE, "CONTRACTOR_TRANSFER_ID_MISSING");
  assert(String(afterResolve.routerTransferId ?? ""), ExitCode.UNEXPECTED_PAYOUT_STATE, "ROUTER_TRANSFER_ID_MISSING");
  assertMoneyInvariantUnchanged(baseline, snapshotMoney(afterResolve), "after_resolve");

  const resolve2 = await fetchJson(jar, "POST", `/api/admin/support/disputes/${encodeURIComponent(disputeId)}/resolve`, {
    headers: internalAdminHeaders(),
    json: {
      outcome: "CONTRACTOR_WINS",
      resolutionSummary: "Second resolve attempt must fail (double-spend protection).",
      adminOverrideTie: false,
    },
  });
  assert(resolve2.status === 409, ExitCode.HOLD_LOGIC_BROKEN, "DISPUTE_RESOLVE_SECOND_SUCCEEDED", {
    http_status: resolve2.status,
    body: truncateBody(resolve2.text),
  });

  // Trigger payout twice (router completion confirmation should now fail since payout already released).
  const payout2 = await fetchJson(jar, "POST", `/api/web/router/jobs/${encodeURIComponent(jobId)}/confirm-completion`, {
    headers: bearer(router.sessionToken),
  });
  assert(payout2.status >= 400 && payout2.status < 500, ExitCode.UNEXPECTED_PAYOUT_STATE, "PAYOUT_SECOND_ATTEMPT_SUCCEEDED", {
    http_status: payout2.status,
    body: truncateBody(payout2.text),
  });

  console.log(JSON.stringify({ status: "ok", code: ExitCode.OK, jobId }, null, 2));
  process.exit(0);
}

main().catch((e) => {
  fail(ExitCode.FINANCIAL_CONTRACT_VIOLATION, "UNHANDLED_EXCEPTION", {
    error: e instanceof Error ? e.message : String(e),
  });
});

