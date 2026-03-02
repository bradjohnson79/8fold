import { beforeEach, describe, expect, it, vi } from "vitest";

describe("GET /api/web/v4/stripe/config", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
  });

  it("returns stripe mode payload on success", async () => {
    vi.doMock("@/src/auth/rbac", () => ({
      requireJobPoster: vi.fn(async () => ({ userId: "u1", role: "JOB_POSTER" })),
    }));
    vi.doMock("@/src/stripe/runtimeConfig", () => ({
      getStripeRuntimeConfig: vi.fn(() => ({
        ok: true,
        stripeMode: "test",
        pkMode: "test",
        skMode: "test",
        publishableKeyPresent: true,
        secretKeyPresent: true,
      })),
    }));

    const { GET } = await import("@/app/api/web/v4/stripe/config/route");
    const res = await GET(new Request("http://localhost/api/web/v4/stripe/config"));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toMatchObject({
      ok: true,
      stripeMode: "test",
      pkMode: "test",
      skMode: "test",
    });
  });

  it("returns STRIPE_MODE_MISMATCH with 409", async () => {
    vi.doMock("@/src/auth/rbac", () => ({
      requireJobPoster: vi.fn(async () => ({ userId: "u1", role: "JOB_POSTER" })),
    }));
    vi.doMock("@/src/stripe/runtimeConfig", () => ({
      getStripeRuntimeConfig: vi.fn(() => ({
        ok: false,
        stripeMode: "test",
        pkMode: "live",
        skMode: "test",
        publishableKeyPresent: true,
        secretKeyPresent: true,
        errorCode: "STRIPE_MODE_MISMATCH",
        errorMessage: "Publishable and secret Stripe keys are configured for different modes.",
      })),
    }));

    const { GET } = await import("@/app/api/web/v4/stripe/config/route");
    const res = await GET(new Request("http://localhost/api/web/v4/stripe/config"));
    const body = await res.json();

    expect(res.status).toBe(409);
    expect(body?.error?.code).toBe("STRIPE_MODE_MISMATCH");
  });
});
