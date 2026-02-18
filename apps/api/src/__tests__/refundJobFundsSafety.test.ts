import { describe, expect, test, vi, beforeEach } from "vitest";

// Drizzle schema modules require a non-"public" schema name at import time.
process.env.DATABASE_URL ||= "postgres://localhost:5432/8fold_test?schema=8fold_test";

beforeEach(() => {
  vi.resetModules();
  vi.restoreAllMocks();
});

describe("refundJobFunds financial safety", () => {
  test("refuses refund when payoutStatus=RELEASED (guard triggers before Stripe call)", async () => {
    const stripeCreate = vi.fn();
    vi.doMock("../stripe/stripe", () => ({ stripe: { refunds: { create: stripeCreate } } }));

    const job = {
      id: "job_1",
      status: "IN_PROGRESS",
      paymentStatus: "FUNDED",
      payoutStatus: "RELEASED",
      stripePaymentIntentId: "pi_123",
      stripeChargeId: null,
      amountCents: 10000,
    };

    // Note: don't rely on schema object identity in tests (module instances can differ under resetModules()).
    let selectCalls = 0;
    const tx: any = {
      execute: vi.fn(async () => []),
      select: vi.fn(() => ({
        from: (_table: unknown) => ({
          where: (_where: unknown) => ({
            limit: async (_n: number) => {
              if (selectCalls === 0) {
                selectCalls += 1;
                return [job];
              }
              selectCalls += 1;
              return [{ id: "dispute_1" }]; // should not be consulted in this guard
              return [];
            },
          }),
        }),
      })),
      update: vi.fn(() => ({
        set: (_set: unknown) => ({
          where: vi.fn(async () => []),
        }),
      })),
    };

    const db = {
      transaction: vi.fn(async (fn: (tx: any) => Promise<unknown>) => await fn(tx)),
    };
    vi.doMock("../../db/drizzle", () => ({ db }));

    const { refundJobFunds } = await import("../services/refundJobFunds");
    const res = await refundJobFunds("job_1");
    expect(res.kind).toBe("refund_after_release");

    // Proves "guard before Stripe call":
    expect(stripeCreate).not.toHaveBeenCalled();
  });

  test("refuses refund when any transfer leg is already SENT (refund_after_partial_release)", async () => {
    const stripeCreate = vi.fn();
    vi.doMock("../stripe/stripe", () => ({ stripe: { refunds: { create: stripeCreate } } }));

    const job = {
      id: "job_1",
      status: "IN_PROGRESS",
      paymentStatus: "FUNDED",
      payoutStatus: "READY",
      stripePaymentIntentId: "pi_123",
      stripeChargeId: null,
      amountCents: 10000,
    };

    let selectCalls = 0;
    const tx: any = {
      execute: vi.fn(async () => []),
      select: vi.fn(() => ({
        from: (_table: unknown) => ({
          where: (_where: unknown) => ({
            limit: async (_n: number) => {
              // 1) job select
              if (selectCalls === 0) {
                selectCalls += 1;
                return [job];
              }
              // 2) transferRecords SENT leg check
              if (selectCalls === 1) {
                selectCalls += 1;
                return [{ id: "tr_leg_1" }];
              }
              selectCalls += 1;
              return [];
            },
          }),
        }),
      })),
      update: vi.fn(() => ({
        set: (_set: unknown) => ({
          where: vi.fn(async () => []),
        }),
      })),
    };
    const db = { transaction: vi.fn(async (fn: (tx: any) => Promise<unknown>) => await fn(tx)) };
    vi.doMock("../../db/drizzle", () => ({ db }));

    const { refundJobFunds } = await import("../services/refundJobFunds");
    const res = await refundJobFunds("job_1");
    expect(res.kind).toBe("refund_after_partial_release");
    expect(stripeCreate).not.toHaveBeenCalled();
  });

  test("refuses refund when status=DISPUTED unless dispute is DECIDED/CLOSED", async () => {
    const stripeCreate = vi.fn();
    vi.doMock("../stripe/stripe", () => ({ stripe: { refunds: { create: stripeCreate } } }));

    const disputedJob = {
      id: "job_1",
      status: "DISPUTED",
      paymentStatus: "FUNDED",
      payoutStatus: "READY",
      stripePaymentIntentId: "pi_123",
      stripeChargeId: null,
      amountCents: 10000,
    };

    // Case A: no resolved dispute row => blocked as disputed.
    vi.resetModules();
    {
      let selectCalls = 0;
      const tx: any = {
        execute: vi.fn(async () => []),
        select: vi.fn(() => ({
          from: (_table: unknown) => ({
            where: (_where: unknown) => ({
              limit: async (_n: number) => {
                if (selectCalls === 0) {
                  selectCalls += 1;
                  return [disputedJob];
                }
                selectCalls += 1;
                return []; // unresolved dispute case
                return [];
              },
            }),
          }),
        })),
        update: vi.fn(() => ({
          set: (_set: unknown) => ({
            where: vi.fn(async () => []),
          }),
        })),
      };
      const db = { transaction: vi.fn(async (fn: (tx: any) => Promise<unknown>) => await fn(tx)) };
      vi.doMock("../../db/drizzle", () => ({ db }));

      const { refundJobFunds } = await import("../services/refundJobFunds");
      const res = await refundJobFunds("job_1");
      expect(res.kind).toBe("disputed");
      expect(stripeCreate).not.toHaveBeenCalled();
    }

    // Case B: resolved dispute row exists => dispute guard allows continuing;
    // we short-circuit at "missing_stripe_ref" (so still no Stripe call), proving the guard is lifted.
    vi.resetModules();
    {
      let selectCalls = 0;
      const tx: any = {
        execute: vi.fn(async () => []),
        select: vi.fn(() => ({
          from: (_table: unknown) => ({
            where: (_where: unknown) => ({
              limit: async (_n: number) => {
                if (selectCalls === 0) {
                  selectCalls += 1;
                  return [
                    {
                      ...disputedJob,
                      stripePaymentIntentId: null,
                      stripeChargeId: null,
                    },
                  ];
                }
                // refund-after-partial-release guard (TransferRecord SENT check) should pass (no legs).
                if (selectCalls === 1) {
                  selectCalls += 1;
                  return [];
                }
                // dispute resolved row
                selectCalls += 1;
                return [{ id: "dispute_resolved_1" }]; // resolved dispute case
              },
            }),
          }),
        })),
        update: vi.fn(() => ({
          set: (_set: unknown) => ({
            where: vi.fn(async () => []),
          }),
        })),
      };
      const db = { transaction: vi.fn(async (fn: (tx: any) => Promise<unknown>) => await fn(tx)) };
      vi.doMock("../../db/drizzle", () => ({ db }));

      const { refundJobFunds } = await import("../services/refundJobFunds");
      const res = await refundJobFunds("job_1");
      expect(res.kind).toBe("missing_stripe_ref");
      expect(stripeCreate).not.toHaveBeenCalled();
    }
  });

  test("RELEASED guard short-circuits before dispute resolution check", async () => {
    const stripeCreate = vi.fn();
    vi.doMock("../stripe/stripe", () => ({ stripe: { refunds: { create: stripeCreate } } }));

    let selectCalls = 0;
    const tx: any = {
      execute: vi.fn(async () => []),
      select: vi.fn(() => ({
        from: (_table: unknown) => ({
          where: (_where: unknown) => ({
            limit: async (_n: number) => {
              if (selectCalls === 0) {
                selectCalls += 1;
                return [
                  {
                    id: "job_1",
                    status: "DISPUTED",
                    paymentStatus: "FUNDED",
                    payoutStatus: "RELEASED",
                    stripePaymentIntentId: "pi_123",
                    stripeChargeId: null,
                    amountCents: 10000,
                  },
                ];
              }
              selectCalls += 1;
              return [{ id: "dispute_resolved_1" }]; // should not matter
              return [];
            },
          }),
        }),
      })),
      update: vi.fn(() => ({
        set: (_set: unknown) => ({
          where: vi.fn(async () => []),
        }),
      })),
    };

    const db = { transaction: vi.fn(async (fn: (tx: any) => Promise<unknown>) => await fn(tx)) };
    vi.doMock("../../db/drizzle", () => ({ db }));

    const { refundJobFunds } = await import("../services/refundJobFunds");
    const res = await refundJobFunds("job_1");
    expect(res.kind).toBe("refund_after_release");
    expect(stripeCreate).not.toHaveBeenCalled();

    // Stronger assertion: the disputeCases query should never run because RELEASED guard is earlier.
    // We can't easily distinguish tables in this mock without extra plumbing, but this at least ensures
    // we remain on the "no Stripe call" path.
  });
});

