import { describe, expect, test, vi, beforeEach } from "vitest";

// We test the Next.js route handler directly, but mock DB + auth.
// Important: the mocks target the *real module files* by resolved path, so they apply
// regardless of which relative import specifier the route uses internally.

// Drizzle schema modules require a non-"public" schema name at import time.
process.env.DATABASE_URL ||= "postgres://localhost:5432/8fold_test?schema=8fold_test";

type RecordedOp =
  | { kind: "insert"; table: unknown; values: unknown }
  | { kind: "update"; table: unknown; set: unknown; where: unknown }
  | { kind: "execute"; sql: unknown };

function makeTxMock(opts: {
  now?: Date;
  resolvedDispute?: boolean;
}) {
  const ops: RecordedOp[] = [];
  const now = opts.now ?? new Date("2026-02-17T00:00:00.000Z");
  let returningCalls = 0;

  const tx: any = {
    ops,
    execute: async (sql: unknown) => {
      ops.push({ kind: "execute", sql });
      return [];
    },
    insert: (table: unknown) => ({
      values: (values: unknown) => {
        // Some insert chains call .returning(...), others just await values(...).
        const base = {
          returning: async (_sel: unknown) => {
            ops.push({ kind: "insert", table, values });
            // The dispute route expects returning() for supportTickets + disputeCases.
            // Using a call counter avoids relying on Drizzle internal table metadata symbols.
            if (returningCalls === 0) {
              returningCalls += 1;
              return [{ id: "ticket_1", createdAt: now, updatedAt: now }];
            }
            if (returningCalls === 1) {
              returningCalls += 1;
              return [
                {
                  id: "dispute_1",
                  createdAt: now,
                  updatedAt: now,
                  ticketId: "ticket_1",
                  jobId: "job_1",
                  filedByUserId: "user_poster",
                  againstUserId: "user_contractor",
                  againstRole: "CONTRACTOR",
                  disputeReason: "WORK_QUALITY",
                  description: "x".repeat(120),
                  status: "SUBMITTED",
                  decision: null,
                  decisionSummary: null,
                  decisionAt: null,
                  deadlineAt: now,
                },
              ];
            }
            return [];
          },
          then: async (resolve: (v: unknown) => unknown, _reject: (e: unknown) => unknown) => {
            // Allow `await tx.insert(...).values(...)` without .returning()
            ops.push({ kind: "insert", table, values });
            return resolve([]);
          },
        };
        return base;
      },
    }),
    update: (table: unknown) => ({
      set: (set: unknown) => ({
        where: async (where: unknown) => {
          ops.push({ kind: "update", table, set, where });
          return [];
        },
      }),
    }),
    select: (_sel: unknown) => ({
      from: (table: unknown) => ({
        where: (_where: unknown) => ({
          limit: async (_n: number) => {
            // Used only by refund tests (not exercised here), but keep for completeness.
            // If the route ever queries disputeCases in-tx, return "resolved" rows when configured.
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const t: any = table as any;
            const name = String((t as any)?.[Symbol.for("drizzle:Name")] ?? (t as any)?.name ?? "");
            if (name.includes("DisputeCase")) return opts.resolvedDispute ? [{ id: "dispute_1" }] : [];
            return [];
          },
        }),
      }),
    }),
  };

  return { tx, ops };
}

function makeDbMock(jobRow: any) {
  const txHarness = makeTxMock({});
  const transaction = vi.fn(async (fn: (tx: any) => Promise<unknown>) => await fn(txHarness.tx));

  const select = vi.fn((_sel: unknown) => ({
    from: (_table: unknown) => ({
      where: (_where: unknown) => ({
        limit: async (_n: number) => (jobRow === undefined ? [] : [jobRow]),
      }),
    }),
  }));

  return { db: { select, transaction }, txHarness };
}

beforeEach(() => {
  vi.resetModules();
  vi.restoreAllMocks();
});

describe("support disputes financial safety", () => {
  test("success: sets DISPUTED + DISPUTE hold; no ledger/escrow/transfer writes", async () => {
    const job = {
      id: "job_1",
      isMock: false,
      status: "IN_PROGRESS",
      paymentStatus: "FUNDED",
      payoutStatus: "READY",
      routerApprovedAt: null,
      jobPosterUserId: "user_poster",
      contractorUserId: "user_contractor",
    };

    const { db, txHarness } = makeDbMock(job);

    vi.doMock("../../db/drizzle", () => ({ db }));
    vi.doMock("../auth/rbac", () => ({
      requireSupportRequester: vi.fn(async () => ({ userId: "user_poster", role: "JOB_POSTER" })),
    }));
    vi.doMock("../lib/errorHandler", () => ({
      handleApiError: (err: unknown) => {
        throw err;
      },
    }));

    const mod = await import("../../app/api/web/support/disputes/route");
    const req = new Request("http://localhost/api/web/support/disputes", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        jobId: "job_1",
        againstUserId: "user_contractor",
        againstRole: "CONTRACTOR",
        disputeReason: "WORK_QUALITY",
        description: "x".repeat(120),
        subject: "Work quality dispute",
        roleContext: "JOB_POSTER",
        message: "Please review",
      }),
    });

    const resp: Response = await mod.POST(req);
    expect(resp.status).toBe(201);
    const body = (await resp.json()) as any;
    expect(body.ok).toBe(true);
    expect(body.data?.dispute?.jobId).toBe("job_1");

    // Assert the freeze operations are present.
    const updates = txHarness.ops.filter((o) => o.kind === "update") as any[];
    expect(updates.some((u) => String((u.set as any)?.status ?? "") === "DISPUTED")).toBe(true);

    const inserts = txHarness.ops.filter((o) => o.kind === "insert") as any[];
    const holdInsert = inserts.find((i) => String((i.values as any)?.reason ?? "") === "DISPUTE");
    expect(holdInsert).toBeTruthy();
    expect(String((holdInsert.values as any)?.status ?? "")).toBe("ACTIVE");

    // Prove no financial tables are written during dispute creation.
    const { ledgerEntries } = await import("../../db/schema/ledgerEntry");
    const { escrows } = await import("../../db/schema/escrow");
    const { transferRecords } = await import("../../db/schema/transferRecord");

    const wroteLedger = inserts.some((i) => i.table === ledgerEntries) || updates.some((u) => u.table === ledgerEntries);
    const wroteEscrow = inserts.some((i) => i.table === escrows) || updates.some((u) => u.table === escrows);
    const wroteTransfers =
      inserts.some((i) => i.table === transferRecords) || updates.some((u) => u.table === transferRecords);

    expect(wroteLedger).toBe(false);
    expect(wroteEscrow).toBe(false);
    expect(wroteTransfers).toBe(false);
  });

  test("refuses when payoutStatus=RELEASED (409) and does not start a tx", async () => {
    const job = {
      id: "job_1",
      isMock: false,
      status: "IN_PROGRESS",
      paymentStatus: "FUNDED",
      payoutStatus: "RELEASED",
      routerApprovedAt: null,
      jobPosterUserId: "user_poster",
      contractorUserId: "user_contractor",
    };
    const { db } = makeDbMock(job);

    vi.doMock("../../db/drizzle", () => ({ db }));
    vi.doMock("../auth/rbac", () => ({
      requireSupportRequester: vi.fn(async () => ({ userId: "user_poster", role: "JOB_POSTER" })),
    }));
    vi.doMock("../lib/errorHandler", () => ({
      handleApiError: (err: unknown) => {
        throw err;
      },
    }));

    const mod = await import("../../app/api/web/support/disputes/route");
    const req = new Request("http://localhost/api/web/support/disputes", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        jobId: "job_1",
        againstUserId: "user_contractor",
        againstRole: "CONTRACTOR",
        disputeReason: "WORK_QUALITY",
        description: "x".repeat(120),
        subject: "Work quality dispute",
        roleContext: "JOB_POSTER",
      }),
    });

    const resp: Response = await mod.POST(req);
    expect(resp.status).toBe(409);
    const body = (await resp.json()) as any;
    expect(body.ok).toBe(false);
    expect(body.code).toBe("payout_already_released");
    expect(db.transaction).not.toHaveBeenCalled();
  });

  test("refuses when paymentStatus!=FUNDED (409)", async () => {
    const job = {
      id: "job_1",
      isMock: false,
      status: "IN_PROGRESS",
      paymentStatus: "UNPAID",
      payoutStatus: "NOT_READY",
      routerApprovedAt: null,
      jobPosterUserId: "user_poster",
      contractorUserId: "user_contractor",
    };
    const { db } = makeDbMock(job);

    vi.doMock("../../db/drizzle", () => ({ db }));
    vi.doMock("../auth/rbac", () => ({
      requireSupportRequester: vi.fn(async () => ({ userId: "user_poster", role: "JOB_POSTER" })),
    }));
    vi.doMock("../lib/errorHandler", () => ({
      handleApiError: (err: unknown) => {
        throw err;
      },
    }));

    const mod = await import("../../app/api/web/support/disputes/route");
    const req = new Request("http://localhost/api/web/support/disputes", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        jobId: "job_1",
        againstUserId: "user_contractor",
        againstRole: "CONTRACTOR",
        disputeReason: "WORK_QUALITY",
        description: "x".repeat(120),
        subject: "Work quality dispute",
        roleContext: "JOB_POSTER",
      }),
    });

    const resp: Response = await mod.POST(req);
    expect(resp.status).toBe(409);
    const body = (await resp.json()) as any;
    expect(body.ok).toBe(false);
    expect(body.code).toBe("job_not_funded");
  });

  test("refuses when routerApprovedAt exists (409)", async () => {
    const job = {
      id: "job_1",
      isMock: false,
      status: "IN_PROGRESS",
      paymentStatus: "FUNDED",
      payoutStatus: "READY",
      routerApprovedAt: new Date("2026-02-16T00:00:00.000Z"),
      jobPosterUserId: "user_poster",
      contractorUserId: "user_contractor",
    };
    const { db } = makeDbMock(job);

    vi.doMock("../../db/drizzle", () => ({ db }));
    vi.doMock("../auth/rbac", () => ({
      requireSupportRequester: vi.fn(async () => ({ userId: "user_poster", role: "JOB_POSTER" })),
    }));
    vi.doMock("../lib/errorHandler", () => ({
      handleApiError: (err: unknown) => {
        throw err;
      },
    }));

    const mod = await import("../../app/api/web/support/disputes/route");
    const req = new Request("http://localhost/api/web/support/disputes", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        jobId: "job_1",
        againstUserId: "user_contractor",
        againstRole: "CONTRACTOR",
        disputeReason: "WORK_QUALITY",
        description: "x".repeat(120),
        subject: "Work quality dispute",
        roleContext: "JOB_POSTER",
      }),
    });

    const resp: Response = await mod.POST(req);
    expect(resp.status).toBe(409);
    const body = (await resp.json()) as any;
    expect(body.ok).toBe(false);
    expect(body.code).toBe("completion_already_approved");
  });
});

