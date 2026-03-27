import { beforeEach, describe, expect, it, vi } from "vitest";

describe("post-job payment intent stripe mode behavior", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
  });

  it("returns STRIPE_MODE_MISMATCH when stripe config is invalid", async () => {
    vi.doMock("@/src/auth/rbac", () => ({
      requireJobPoster: vi.fn(async () => ({ userId: "user_1", role: "JOB_POSTER" })),
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

    const { POST } = await import("@/app/api/job-draft/payment-intent/route");
    const req = new Request("http://localhost/api/job-draft/payment-intent", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ selectedPrice: 10000, isRegional: false }),
    });

    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(409);
    expect(body?.error?.code).toBe("STRIPE_MODE_MISMATCH");
  });

  it("returns stripeMode on successful payment intent preparation", async () => {
    const appendLedgerEntry = vi.fn(async () => undefined);

    vi.doMock("@/src/auth/rbac", () => ({
      requireJobPoster: vi.fn(async () => ({ userId: "user_1", role: "JOB_POSTER" })),
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
    vi.doMock("@/src/services/v4/paymentFeeConfigService", () => ({
      getFeeConfig: vi.fn(async () => ({ percentBps: 293, fixedCents: 30 })),
    }));
    vi.doMock("@/src/services/v4/modelAPricingService", () => ({
      computeModelAPricing: vi.fn(async () => ({
        baseSplitCents: 10000,
        contractorPayoutCents: 7500,
        routerFeeCents: 1500,
        platformFeeCents: 1000,
        taxCents: 500,
        estimatedProcessingFeeCents: 200,
        totalChargeCents: 10700,
        paymentCurrency: "cad",
        regionalFeeCents: 0,
        taxRateBps: 500,
        country: "CA",
        province: "BC",
        currency: "CAD",
      })),
    }));
    vi.doMock("@/src/payments/stripe", () => ({
      createPaymentIntent: vi.fn(async () => ({
        clientSecret: "pi_client_secret",
        paymentIntentId: "pi_123",
        status: "succeeded",
        currency: "cad",
        amountCents: 10700,
      })),
      cancelPaymentIntent: vi.fn(async () => undefined),
    }));
    vi.doMock("@/src/services/v4/financialLedgerService", () => ({
      appendLedgerEntry,
    }));

    const { POST } = await import("@/app/api/job-draft/payment-intent/route");
    const req = new Request("http://localhost/api/job-draft/payment-intent", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        selectedPrice: 10000,
        isRegional: false,
        details: {
          tradeCategory: "HANDYMAN",
          title: "Fix sink",
          description: "Leaking sink repair",
          address: "123 Main St",
          stateCode: "BC",
          countryCode: "CA",
          lat: 49.2,
          lon: -123.1,
        },
        availability: {
          monday: { morning: true, afternoon: false, evening: false },
        },
      }),
    });

    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.stripeMode).toBe("test");
    expect(body.paymentIntentId).toBe("pi_123");
    expect(appendLedgerEntry).toHaveBeenCalled();
  });
});
