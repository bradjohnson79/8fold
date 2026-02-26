/**
 * Admin tier lockdown smoke test.
 *
 * Verifies that:
 * - ADMIN_VIEWER cannot call ADMIN_SUPER routes (expects 403)
 * - ADMIN_OPERATOR cannot call ADMIN_SUPER routes (expects 403)
 * - ADMIN_SUPER can pass guard checks (expects configured status per route)
 *
 * Required env:
 * - API_ORIGIN (default: http://localhost:3003)
 * - ADMIN_VIEWER_SESSION_TOKEN
 * - ADMIN_OPERATOR_SESSION_TOKEN
 * - ADMIN_SUPER_SESSION_TOKEN
 *
 * Route id env (set to real values for strict mode):
 * - LOCKDOWN_TEST_JOB_ID
 * - LOCKDOWN_TEST_PAYOUT_REQUEST_ID
 * - LOCKDOWN_TEST_TRANSFER_ID
 * - LOCKDOWN_TEST_DISPUTE_ID
 * - LOCKDOWN_TEST_CONTRACTOR_ID
 * - LOCKDOWN_TEST_ROUTER_USER_ID
 *
 * Optional:
 * - LOCKDOWN_STRICT_SUPER_200=1  // require ADMIN_SUPER status to be exactly expectedStatus
 */
export {};

type Role = "VIEWER" | "OPERATOR" | "SUPER";

type RouteCase = {
  name: string;
  method: "POST";
  path: string;
  body?: Record<string, unknown>;
  expectedSuperStatus?: number;
};

type ResultRow = {
  role: Role;
  name: string;
  status: number;
  ok: boolean;
  detail: string;
};

function reqEnv(name: string): string {
  const v = String(process.env[name] ?? "").trim();
  if (!v) throw new Error(`Missing required env: ${name}`);
  return v;
}

function maybeId(name: string): string | null {
  const v = String(process.env[name] ?? "").trim();
  return v || null;
}

async function callRoute(base: string, token: string, route: RouteCase): Promise<Response> {
  return fetch(`${base}${route.path}`, {
    method: route.method,
    headers: {
      "content-type": "application/json",
      cookie: `admin_session=${token}`,
    },
    body: route.body ? JSON.stringify(route.body) : "{}",
    cache: "no-store" as any,
  });
}

async function main() {
  const base = String(process.env.API_ORIGIN ?? "http://localhost:3003").trim().replace(/\/+$/, "");
  const strictSuper200 = String(process.env.LOCKDOWN_STRICT_SUPER_200 ?? "").trim() === "1";

  const viewerToken = reqEnv("ADMIN_VIEWER_SESSION_TOKEN");
  const operatorToken = reqEnv("ADMIN_OPERATOR_SESSION_TOKEN");
  const superToken = reqEnv("ADMIN_SUPER_SESSION_TOKEN");

  const jobId = maybeId("LOCKDOWN_TEST_JOB_ID");
  const payoutRequestId = maybeId("LOCKDOWN_TEST_PAYOUT_REQUEST_ID");
  const transferId = maybeId("LOCKDOWN_TEST_TRANSFER_ID");
  const disputeId = maybeId("LOCKDOWN_TEST_DISPUTE_ID");
  const contractorId = maybeId("LOCKDOWN_TEST_CONTRACTOR_ID");
  const routerUserId = maybeId("LOCKDOWN_TEST_ROUTER_USER_ID");

  const routeCases: RouteCase[] = [
    ...(jobId
      ? [
          { name: "jobs.release-funds", method: "POST" as const, path: `/api/admin/jobs/${encodeURIComponent(jobId)}/release-funds`, expectedSuperStatus: 200 },
        ]
      : []),
    {
      name: "finance.adjustments",
      method: "POST",
      path: "/api/admin/finance/adjustments",
      expectedSuperStatus: 200,
      body: {
        userId: "smoke:test:user",
        direction: "CREDIT",
        bucket: "AVAILABLE",
        amountCents: 1,
        memo: "admin lockdown smoke test",
        requestId: `smoke-${Date.now()}`,
      },
    },
    ...(payoutRequestId
      ? [
          {
            name: "payout-requests.mark-paid",
            method: "POST" as const,
            path: `/api/admin/payout-requests/${encodeURIComponent(payoutRequestId)}/mark-paid`,
            expectedSuperStatus: 200,
            body: {},
          },
        ]
      : []),
    ...(transferId
      ? [
          {
            name: "finance.transfers.reconcile",
            method: "POST" as const,
            path: `/api/admin/finance/transfers/${encodeURIComponent(transferId)}/reconcile`,
            expectedSuperStatus: 200,
          },
        ]
      : []),
    ...(disputeId
      ? [
          {
            name: "support.disputes.decision",
            method: "POST" as const,
            path: `/api/admin/support/disputes/${encodeURIComponent(disputeId)}/decision`,
            expectedSuperStatus: 200,
            body: {
              ops: {
                decision: "CLOSE_NO_ACTION",
                decisionSummary: "Smoke test verification for admin lockdown boundaries.",
              },
            },
          },
          {
            name: "support.disputes.enforcement.execute",
            method: "POST" as const,
            path: `/api/admin/support/disputes/${encodeURIComponent(disputeId)}/enforcement/execute`,
            expectedSuperStatus: 200,
            body: {},
          },
        ]
      : []),
    ...(contractorId
      ? [
          {
            name: "contractors.stripe.onboard",
            method: "POST" as const,
            path: `/api/admin/contractors/${encodeURIComponent(contractorId)}/stripe/onboard`,
            expectedSuperStatus: 200,
          },
        ]
      : []),
    ...(routerUserId
      ? [
          {
            name: "routers.stripe.onboard",
            method: "POST" as const,
            path: `/api/admin/routers/${encodeURIComponent(routerUserId)}/stripe/onboard`,
            expectedSuperStatus: 200,
          },
        ]
      : []),
  ];

  if (routeCases.length === 0) {
    console.log("No route cases configured; set LOCKDOWN_TEST_* ids.");
    process.exit(0);
  }

  const roles: Array<{ role: Role; token: string }> = [
    { role: "VIEWER", token: viewerToken },
    { role: "OPERATOR", token: operatorToken },
    { role: "SUPER", token: superToken },
  ];

  const results: ResultRow[] = [];

  for (const role of roles) {
    for (const route of routeCases) {
      const resp = await callRoute(base, role.token, route);
      const status = resp.status;
      let ok = false;
      let detail = "";

      if (role.role === "SUPER") {
        if (strictSuper200) {
          const expected = route.expectedSuperStatus ?? 200;
          ok = status === expected;
          detail = `expected=${expected}`;
        } else {
          ok = status !== 401 && status !== 403;
          detail = "expected non-auth failure";
        }
      } else {
        ok = status === 403;
        detail = "expected=403";
      }

      results.push({ role: role.role, name: route.name, status, ok, detail });
    }
  }

  const failed = results.filter((r) => !r.ok);
  for (const row of results) {
    console.log(`${row.ok ? "PASS" : "FAIL"} role=${row.role} route=${row.name} status=${row.status} ${row.detail}`);
  }

  if (failed.length > 0) {
    console.error(`Tier lockdown smoke failed: ${failed.length} checks failed.`);
    process.exit(1);
  }

  console.log("Tier lockdown smoke passed.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
