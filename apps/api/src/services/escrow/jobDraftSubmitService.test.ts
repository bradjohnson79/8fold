import { beforeEach, describe, expect, test, vi } from "vitest";

process.env.DATABASE_URL ??= "postgres://user:pass@localhost:5432/postgres?schema=app";

function installDbSelectQueue(queue: unknown[]) {
  let idx = 0;
  const select = vi.fn(() => ({
    from: () => ({
      where: () => ({
        limit: async () => (queue[idx++] ?? []),
      }),
    }),
  }));

  vi.doMock("@/db/drizzle", () => ({
    db: {
      select,
      transaction: vi.fn(async () => {
        throw new Error("transaction should not run in this test");
      }),
    },
  }));

  return { select };
}

function installPricingMock() {
  vi.doMock("@/src/services/v4/modelAPricingService", () => ({
    computeModelAPricing: vi.fn(),
  }));
  vi.doMock("@/src/services/v4/paymentFeeConfigService", () => ({
    getFeeConfig: vi.fn(),
  }));
  vi.doMock("@/src/services/escrow/ledger", () => ({
    writeChargeLedger: vi.fn(),
  }));
}

describe("submitJobFromActiveDraft", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
  });

  test("rejects submit when payment intent is not succeeded", async () => {
    installPricingMock();
    installDbSelectQueue([
      [
        {
          id: "draft_1",
          userId: "user_1",
          data: {
            payment: { paymentIntentId: "pi_1" },
          },
        },
      ],
      [],
    ]);

    const retrieve = vi.fn(async () => ({ status: "processing" }));
    vi.doMock("@/src/payments/stripe", () => ({
      stripe: {
        paymentIntents: {
          retrieve,
        },
      },
    }));

    const { submitJobFromActiveDraft } = await import("@/src/services/escrow/jobDraftSubmitService");
    await expect(submitJobFromActiveDraft("user_1")).rejects.toMatchObject({
      status: 409,
      message: "Payment not completed. Complete Stripe confirmation first.",
    });
    expect(retrieve).toHaveBeenCalledWith("pi_1");
  });

  test("returns existing job idempotently when payment intent already mapped", async () => {
    installPricingMock();
    const { select } = installDbSelectQueue([
      [
        {
          id: "draft_1",
          userId: "user_1",
          data: {
            payment: { paymentIntentId: "pi_1" },
          },
        },
      ],
      [
        {
          id: "job_123",
          jobPosterUserId: "user_1",
        },
      ],
    ]);

    const retrieve = vi.fn();
    vi.doMock("@/src/payments/stripe", () => ({
      stripe: {
        paymentIntents: {
          retrieve,
        },
      },
    }));

    const { submitJobFromActiveDraft } = await import("@/src/services/escrow/jobDraftSubmitService");
    await expect(submitJobFromActiveDraft("user_1")).resolves.toEqual({
      jobId: "job_123",
      created: false,
    });
    expect(select).toHaveBeenCalled();
    expect(retrieve).not.toHaveBeenCalled();
  });
});
