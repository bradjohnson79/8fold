import { describe, expect, test, vi, beforeEach } from "vitest";

process.env.DATABASE_URL ||= "postgres://localhost:5432/8fold_test?schema=8fold_test";

type RecordedOp =
  | { kind: "insert"; table: unknown; values: unknown }
  | { kind: "update"; table: unknown; set: unknown; where: unknown }
  | { kind: "select"; table: unknown };

function makeTxHarness() {
  const ops: RecordedOp[] = [];
  const now = new Date("2026-02-17T00:00:00.000Z");

  // Minimal tx mock for the decision route.
  const tx: any = {
    ops,
    select: vi.fn((_sel: unknown) => ({
      from: (table: unknown) => ({
        where: (_where: unknown) => ({
          limit: async (_n: number) => {
            ops.push({ kind: "select", table });
            // First select is "existing dispute"
            return [{ id: "dispute_1", status: "SUBMITTED", ticketId: "ticket_1", jobId: "job_1" }];
          },
        }),
      }),
    })),
    update: (table: unknown) => ({
      set: (set: unknown) => ({
        where: (_where: unknown) => ({
          returning: async (_sel: unknown) => {
            ops.push({ kind: "update", table, set, where: _where });
            return [
              {
                id: "dispute_1",
                status: (set as any)?.status ?? "DECIDED",
                decision: (set as any)?.decision ?? "NO_ACTION",
                decisionSummary: (set as any)?.decisionSummary ?? "summary",
                decisionAt: now,
                updatedAt: now,
                ticketId: "ticket_1",
                filedByUserId: "user_poster",
                againstUserId: "user_contractor",
              },
            ];
          },
        }),
      }),
    }),
    insert: (table: unknown) => ({
      values: async (values: unknown) => {
        ops.push({ kind: "insert", table, values });
        return [];
      },
    }),
  };

  return { tx, ops };
}

beforeEach(() => {
  vi.resetModules();
  vi.restoreAllMocks();
});

describe("admin dispute decision financial safety", () => {
  test("ops decision RELEASE_ESCROW_FULL does not touch ledger/escrow/transfers", async () => {
    const { tx, ops } = makeTxHarness();
    const db = { transaction: vi.fn(async (fn: (tx: any) => Promise<unknown>) => await fn(tx)) };

    vi.doMock("@/db/drizzle", () => ({ db }));
    vi.doMock("@/src/lib/auth/requireAdmin", () => ({
      requireAdmin: vi.fn(async () => ({ userId: "admin_1" })),
    }));
    vi.doMock("@/src/lib/api/readJsonBody", () => ({
      readJsonBody: vi.fn(async () => ({ ok: true, json: { ops: { decision: "RELEASE_ESCROW_FULL", decisionSummary: "x".repeat(20) } } })),
    }));

    const mod = await import("../../app/api/admin/support/disputes/[id]/decision/route");
    const req = new Request("http://localhost/api/admin/support/disputes/dispute_1/decision", { method: "POST" });
    const resp: Response = await mod.POST(req);
    expect(resp.status).toBe(200);
    const body = (await resp.json()) as any;
    expect(body.ok).toBe(true);

    const { ledgerEntries } = await import("../../db/schema/ledgerEntry");
    const { escrows } = await import("../../db/schema/escrow");
    const { transferRecords } = await import("../../db/schema/transferRecord");

    const wrote = (t: unknown) =>
      ops.some((o) => (o.kind === "insert" || o.kind === "update") && (o as any).table === t);

    expect(wrote(ledgerEntries)).toBe(false);
    expect(wrote(escrows)).toBe(false);
    expect(wrote(transferRecords)).toBe(false);
  });

  test("ops decision CLOSE_NO_ACTION maps to CLOSED and creates no enforcement actions", async () => {
    const { tx, ops } = makeTxHarness();
    const db = { transaction: vi.fn(async (fn: (tx: any) => Promise<unknown>) => await fn(tx)) };

    vi.doMock("@/db/drizzle", () => ({ db }));
    vi.doMock("@/src/lib/auth/requireAdmin", () => ({
      requireAdmin: vi.fn(async () => ({ userId: "admin_1" })),
    }));
    vi.doMock("@/src/lib/api/readJsonBody", () => ({
      readJsonBody: vi.fn(async () => ({ ok: true, json: { ops: { decision: "CLOSE_NO_ACTION", decisionSummary: "x".repeat(20) } } })),
    }));

    const mod = await import("../../app/api/admin/support/disputes/[id]/decision/route");
    const req = new Request("http://localhost/api/admin/support/disputes/dispute_1/decision", { method: "POST" });
    const resp: Response = await mod.POST(req);
    expect(resp.status).toBe(200);

    const updates = ops.filter((o) => o.kind === "update") as any[];
    expect(updates.some((u) => String(u.set?.status ?? "") === "CLOSED")).toBe(true);

    const { disputeEnforcementActions } = await import("../../db/schema/disputeEnforcementAction");
    const insertedActions = ops.filter((o) => o.kind === "insert" && (o as any).table === disputeEnforcementActions);
    expect(insertedActions.length).toBe(0);
  });
});

