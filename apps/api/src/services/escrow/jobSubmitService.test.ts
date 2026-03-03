import { beforeEach, describe, expect, test, vi } from "vitest";

process.env.DATABASE_URL ??= "postgres://user:pass@localhost:5432/postgres?schema=app";

function installQueuedSelect(queue: unknown[]) {
  let idx = 0;
  return vi.fn(() => ({
    from: () => ({
      where: () => ({
        limit: async () => (queue[idx++] ?? []),
      }),
    }),
  }));
}

describe("submitJobFromPayload", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
  });

  test("inserts only minimal canonical job columns and writes ledger after transaction", async () => {
    const timeline: string[] = [];
    const insertedValues: any[] = [];

    const dbSelect = installQueuedSelect([[]]);
    const txSelect = installQueuedSelect([[]]);
    const txInsert = vi.fn(() => ({
      values: vi.fn(async (values: unknown) => {
        insertedValues.push(values);
      }),
    }));
    const txUpdate = vi.fn(() => ({
      set: vi.fn(() => ({
        where: vi.fn(async () => undefined),
      })),
    }));

    vi.doMock("@/db/drizzle", () => ({
      db: {
        select: dbSelect,
        transaction: vi.fn(async (cb: (tx: any) => Promise<void>) => {
          await cb({
            insert: txInsert,
            select: txSelect,
            update: txUpdate,
          });
          timeline.push("transaction_done");
        }),
      },
    }));

    const retrieve = vi.fn(async () => ({
      status: "succeeded",
      amount_received: 12345,
      amount: 12345,
      currency: "usd",
      latest_charge: "ch_123",
      metadata: { some: "value" },
    }));
    const update = vi.fn(async () => ({}));
    vi.doMock("@/src/payments/stripe", () => ({
      stripe: {
        paymentIntents: {
          retrieve,
          update,
        },
      },
    }));

    const writeChargeLedger = vi.fn(async () => {
      timeline.push("ledger_written");
    });
    const writeAuthHoldLedger = vi.fn();
    vi.doMock("@/src/services/escrow/ledger", () => ({
      writeChargeLedger,
      writeAuthHoldLedger,
    }));

    const { submitJobFromPayload } = await import("@/src/services/escrow/jobSubmitService");
    const result = await submitJobFromPayload("user_123", {
      details: {
        title: "Fix sink",
        description: "Kitchen sink leak",
        tradeCategory: "HANDYMAN",
        city: "San Diego",
        postalCode: "92101",
        lat: 32.7157,
        lon: -117.1611,
      },
      availability: {
        monday: {
          morning: true,
        },
      },
      payment: {
        paymentIntentId: "pi_123",
      },
      images: [],
    });

    expect(result.created).toBe(true);
    expect(result.jobId).toBeTypeOf("string");

    const jobInsert = insertedValues[0];
    expect(jobInsert).toBeTruthy();
    expect(Object.keys(jobInsert).sort()).toEqual(
      [
        "id",
        "title",
        "scope",
        "region",
        "trade_category",
        "job_poster_user_id",
        "status",
        "routing_status",
        "currency",
        "amount_cents",
        "total_amount_cents",
        "stripe_payment_intent_id",
        "stripe_payment_intent_status",
        "created_at",
        "updated_at",
        "city",
        "postal_code",
        "lat",
        "lng",
        "availability",
      ].sort(),
    );
    expect(jobInsert.amount_cents).toBe(12345);
    expect(jobInsert.total_amount_cents).toBe(12345);
    expect(jobInsert.currency).toBe("USD");
    expect(jobInsert.status).toBe("OPEN_FOR_ROUTING");
    expect(jobInsert.routing_status).toBe("UNROUTED");
    expect(jobInsert).not.toHaveProperty("contractor_payout_cents");
    expect(jobInsert).not.toHaveProperty("router_earnings_cents");
    expect(jobInsert).not.toHaveProperty("tax_amount_cents");
    expect(jobInsert).not.toHaveProperty("transaction_fee_cents");
    expect(jobInsert).not.toHaveProperty("escrow_locked_at");
    expect(jobInsert).not.toHaveProperty("funds_secured_at");
    expect(jobInsert).not.toHaveProperty("job_type");

    expect(timeline).toEqual(["transaction_done", "ledger_written"]);
    expect(writeChargeLedger).toHaveBeenCalledTimes(1);
    expect(writeAuthHoldLedger).not.toHaveBeenCalled();
    expect(update).toHaveBeenCalledTimes(1);
  });

  test("logs structured insert diagnostics and rethrows insert failure", async () => {
    const dbSelect = installQueuedSelect([[]]);
    const txSelect = installQueuedSelect([[]]);
    const insertError = Object.assign(new Error("violates check"), {
      code: "23514",
      constraint: "jobs_status_check",
      column: "status",
      detail: "failing row contains ...",
    });
    let insertAttempt = 0;

    vi.doMock("@/db/drizzle", () => ({
      db: {
        select: dbSelect,
        transaction: vi.fn(async (cb: (tx: any) => Promise<void>) => {
          await cb({
            insert: vi.fn(() => ({
              values: vi.fn(async () => {
                if (insertAttempt === 0) {
                  insertAttempt += 1;
                  throw insertError;
                }
              }),
            })),
            select: txSelect,
            update: vi.fn(() => ({
              set: vi.fn(() => ({
                where: vi.fn(async () => undefined),
              })),
            })),
          });
        }),
      },
    }));

    vi.doMock("@/src/payments/stripe", () => ({
      stripe: {
        paymentIntents: {
          retrieve: vi.fn(async () => ({
            status: "succeeded",
            amount_received: 5000,
            amount: 5000,
            currency: "usd",
            latest_charge: "ch_123",
            metadata: {},
          })),
          update: vi.fn(async () => ({})),
        },
      },
    }));

    vi.doMock("@/src/services/escrow/ledger", () => ({
      writeChargeLedger: vi.fn(),
      writeAuthHoldLedger: vi.fn(),
    }));

    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const { submitJobFromPayload } = await import("@/src/services/escrow/jobSubmitService");
    await expect(
      submitJobFromPayload("user_123", {
        details: {
          title: "Fix sink",
          description: "Kitchen sink leak",
          tradeCategory: "HANDYMAN",
        },
        payment: { paymentIntentId: "pi_123" },
      }),
    ).rejects.toThrow("violates check");

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      "[JOB_SUBMIT_INSERT_FAILED]",
      expect.objectContaining({
        code: "23514",
        constraint: "jobs_status_check",
        column: "status",
        status: "OPEN_FOR_ROUTING",
      }),
    );
  });

  test("does not fail job creation when post-insert ledger write fails", async () => {
    const dbSelect = installQueuedSelect([[]]);
    const txSelect = installQueuedSelect([[]]);
    const txInsert = vi.fn(() => ({
      values: vi.fn(async () => undefined),
    }));

    vi.doMock("@/db/drizzle", () => ({
      db: {
        select: dbSelect,
        transaction: vi.fn(async (cb: (tx: any) => Promise<void>) => {
          await cb({
            insert: txInsert,
            select: txSelect,
            update: vi.fn(() => ({
              set: vi.fn(() => ({
                where: vi.fn(async () => undefined),
              })),
            })),
          });
        }),
      },
    }));

    vi.doMock("@/src/payments/stripe", () => ({
      stripe: {
        paymentIntents: {
          retrieve: vi.fn(async () => ({
            status: "succeeded",
            amount_received: 5000,
            amount: 5000,
            currency: "usd",
            latest_charge: "ch_123",
            metadata: {},
          })),
          update: vi.fn(async () => ({})),
        },
      },
    }));

    vi.doMock("@/src/services/escrow/ledger", () => ({
      writeChargeLedger: vi.fn(async () => {
        throw Object.assign(new Error("ledger unavailable"), {
          code: "LEDGER_DOWN",
          constraint: null,
          column: null,
        });
      }),
      writeAuthHoldLedger: vi.fn(),
    }));

    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const { submitJobFromPayload } = await import("@/src/services/escrow/jobSubmitService");
    await expect(
      submitJobFromPayload("user_123", {
        details: {
          title: "Fix sink",
          description: "Kitchen sink leak",
          tradeCategory: "HANDYMAN",
        },
        payment: { paymentIntentId: "pi_123" },
      }),
    ).resolves.toMatchObject({ created: true });

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      "[JOB_SUBMIT_LEDGER_POST_INSERT_FAILED]",
      expect.objectContaining({
        code: "LEDGER_DOWN",
        status: "CAPTURED",
      }),
    );
  });
});
