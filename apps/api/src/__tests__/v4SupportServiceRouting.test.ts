import { describe, expect, test, vi, beforeEach } from "vitest";

beforeEach(() => {
  vi.resetModules();
  vi.restoreAllMocks();
});

describe("v4 support routing", () => {
  test("routes DISPUTE to disputes table", async () => {
    process.env.DATABASE_URL ||= "postgres://localhost:5432/8fold_test?schema=8fold_test";
    const inserts: Array<{ table: unknown; values: unknown }> = [];

    vi.doMock("../../db/drizzle", () => ({
      db: {
        insert: (table: unknown) => ({
          values: async (values: unknown) => {
            inserts.push({ table, values });
            return [];
          },
        }),
      },
    }));

    const { createSupportTicket } = await import("../services/v4/v4SupportService");
    const { disputes } = await import("../../db/schema/dispute");

    const result = await createSupportTicket("user_1", "JOB_POSTER", "Need review", "DISPUTE", "message", {
      jobId: "job_1",
      conversationId: "thread_1",
    });

    expect(result.routedTo).toBe("DISPUTE");
    expect(inserts).toHaveLength(1);
    expect(inserts[0].table).toBe(disputes);
  });

  test("routes non-dispute categories to support tickets", async () => {
    process.env.DATABASE_URL ||= "postgres://localhost:5432/8fold_test?schema=8fold_test";
    const inserts: Array<{ table: unknown; values: unknown }> = [];

    vi.doMock("../../db/drizzle", () => ({
      db: {
        insert: (table: unknown) => ({
          values: async (values: unknown) => {
            inserts.push({ table, values });
            return [];
          },
        }),
      },
    }));

    const { createSupportTicket } = await import("../services/v4/v4SupportService");
    const { v4SupportTickets } = await import("../../db/schema/v4SupportTicket");

    const result = await createSupportTicket(
      "user_1",
      "CONTRACTOR",
      "App issue",
      "REPORT A BUG",
      "details",
    );

    expect(result.routedTo).toBe("SUPPORT_TICKET");
    expect(inserts).toHaveLength(1);
    expect(inserts[0].table).toBe(v4SupportTickets);
  });
});
