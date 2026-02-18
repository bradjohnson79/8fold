import { describe, expect, test, vi, beforeEach } from "vitest";

process.env.DATABASE_URL ||= "postgres://localhost:5432/8fold_test?schema=8fold_test";

type Op = { kind: "insert"; table: unknown; values: unknown } | { kind: "update"; table: unknown } | { kind: "select" };

function makeDbMock(opts: { listRows?: any[] } = {}) {
  const ops: Op[] = [];
  const now = new Date("2026-02-17T00:00:00.000Z");

  const tx: any = {
    insert: (table: unknown) => ({
      values: (values: unknown) => ({
        returning: async (_sel: unknown) => {
          ops.push({ kind: "insert", table, values });
          // First returning() is supportTickets insert.
          return [
            {
              id: "ticket_1",
              createdAt: now,
              updatedAt: now,
              type: "HELP",
              status: "OPEN",
              category: "OTHER",
              priority: "NORMAL",
              roleContext: "ROUTER",
              subject: "Subject",
            },
          ];
        },
        // Allow `await tx.insert(...).values(...)` without `.returning()`.
        then: async (resolve: (v: unknown) => unknown) => {
          ops.push({ kind: "insert", table, values });
          return resolve([]);
        },
      }),
    }),
    select: vi.fn(() => ({
      from: (_table: unknown) => ({
        leftJoin: () => ({
          where: () => ({
            orderBy: () => ({
              limit: async (_n: number) => opts.listRows ?? [],
            }),
          }),
        }),
      }),
    })),
    update: (_table: unknown) => ({
      set: (_set: unknown) => ({
        where: async (_where: unknown) => {
          ops.push({ kind: "update", table: _table });
          return [];
        },
      }),
    }),
  };

  const db = {
    transaction: vi.fn(async (fn: (tx: any) => Promise<unknown>) => await fn(tx)),
    select: vi.fn(() => ({
      from: (_table: unknown) => ({
        leftJoin: () => ({
          where: () => ({
            orderBy: () => ({
              limit: async (_n: number) => opts.listRows ?? [],
            }),
          }),
        }),
      }),
    })),
  };

  return { db, ops };
}

beforeEach(() => {
  vi.resetModules();
  vi.restoreAllMocks();
});

describe("support tickets canonical contract", () => {
  test("POST /api/web/support/tickets creates HELP ticket + initial message", async () => {
    const { db, ops } = makeDbMock();

    // Mock module ids used by the route file (alias-based).
    vi.doMock("@/db/drizzle", () => ({ db }));
    vi.doMock("@/src/auth/rbac", () => ({
      requireUser: vi.fn(async () => ({ userId: "u1", role: "ROUTER" })),
    }));

    const mod = await import("../../app/api/web/support/tickets/route");
    const req = new Request("http://localhost/api/web/support/tickets", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ category: "OTHER", subject: "Subject", message: "Hello support" }),
    });

    const resp: Response = await mod.POST(req);
    expect(resp.status).toBe(201);
    const json = (await resp.json()) as any;
    expect(json.ok).toBe(true);
    expect(json.data?.ticket?.id).toBe("ticket_1");

    // Evidence: at least one insert (ticket) + at least one insert (message) happened.
    const insertCount = ops.filter((o) => o.kind === "insert").length;
    expect(insertCount).toBeGreaterThanOrEqual(2);
  });

  test("GET /api/web/support/tickets returns ok:true,data:{tickets}", async () => {
    const listRows = [
      {
        id: "ticket_1",
        createdAt: new Date("2026-02-01T00:00:00.000Z"),
        updatedAt: new Date("2026-02-02T00:00:00.000Z"),
        type: "HELP",
        status: "OPEN",
        category: "OTHER",
        priority: "NORMAL",
        roleContext: "ROUTER",
        subject: "Subject",
        assignedToId: null,
        createdById: "u1",
        disputeCaseId: null,
        disputeStatus: null,
        disputeDecision: null,
        disputeDecisionSummary: null,
        disputeDecisionAt: null,
      },
    ];

    const { db } = makeDbMock({ listRows });
    vi.doMock("@/db/drizzle", () => ({ db }));
    vi.doMock("@/src/auth/rbac", () => ({
      requireUser: vi.fn(async () => ({ userId: "u1", role: "ROUTER" })),
    }));

    const mod = await import("../../app/api/web/support/tickets/route");
    const resp: Response = await mod.GET(new Request("http://localhost/api/web/support/tickets?take=1"));
    expect(resp.status).toBe(200);
    const json = (await resp.json()) as any;
    expect(json.ok).toBe(true);
    expect(Array.isArray(json.data?.tickets)).toBe(true);
    expect(json.data.tickets[0]?.id).toBe("ticket_1");
  });
});

