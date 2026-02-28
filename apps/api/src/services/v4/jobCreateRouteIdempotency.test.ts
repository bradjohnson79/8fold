import { beforeEach, describe, expect, test, vi } from "vitest";

describe("V4 job create route idempotency header", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
  });

  test("missing idempotency header returns 400", async () => {
    vi.doMock("@/src/auth/requireAuth", () => ({
      requireAuth: vi.fn(async () => ({
        requestId: "req-1",
        internalUser: { id: "user_1", role: "JOB_POSTER", email: "a@b.com", phone: null, status: "ACTIVE" },
      })),
    }));
    vi.doMock("@/src/auth/requireRole", () => ({
      requireRole: vi.fn(async () => ({
        requestId: "req-1",
        internalUser: { id: "user_1", role: "JOB_POSTER", email: "a@b.com", phone: null, status: "ACTIVE" },
      })),
    }));
    vi.doMock("@/src/services/v4/rateLimitService", () => ({
      rateLimitOrThrow: vi.fn(async () => undefined),
    }));
    vi.doMock("@/src/services/v4/readinessService", () => ({
      getV4Readiness: vi.fn(async () => ({ jobPosterReady: true })),
    }));
    vi.doMock("@/src/services/v4/jobPosterPaymentService", () => ({
      getJobPosterPaymentStatus: vi.fn(async () => ({ connected: true })),
    }));
    const createMock = vi.fn(async () => ({ ok: true, jobId: "job_1" }));
    vi.doMock("@/src/services/v4/jobCreateService", () => ({
      createV4Job: createMock,
      V4JobCreateBodySchema: {
        safeParse: vi.fn((_raw: unknown) => ({ success: true, data: {} })),
      },
    }));

    const mod = await import("../../../app/api/web/v4/job/create/route");
    const req = new Request("http://localhost/api/web/v4/job/create", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });
    const resp: Response = await mod.POST(req);
    const body = (await resp.json()) as any;

    expect(resp.status).toBe(400);
    expect(body?.error?.code).toBe("V4_IDEMPOTENCY_KEY_REQUIRED");
    expect(createMock).not.toHaveBeenCalled();
  });
});
