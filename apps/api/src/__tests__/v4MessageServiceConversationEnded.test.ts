import { describe, expect, test, vi, beforeEach } from "vitest";

beforeEach(() => {
  vi.resetModules();
  vi.restoreAllMocks();
});

describe("v4MessageService sendMessage lock", () => {
  test("rejects message send when conversation is ENDED", async () => {
    process.env.DATABASE_URL ||= "postgres://localhost:5432/8fold_test?schema=8fold_test";
    const select = vi.fn(() => ({
      from: () => ({
        where: () => ({
          limit: async () => [
            {
              id: "thread_1",
              jobId: "job_1",
              status: "ENDED",
              jobPosterUserId: "poster_1",
              contractorUserId: "contractor_1",
            },
          ],
        }),
      }),
    }));

    const insertValues = vi.fn(async () => []);
    const insert = vi.fn(() => ({ values: insertValues }));

    const updateWhere = vi.fn(async () => []);
    const update = vi.fn(() => ({ set: () => ({ where: updateWhere }) }));

    vi.doMock("../../db/drizzle", () => ({
      db: {
        select,
        insert,
        update,
      },
    }));
    vi.doMock("../events/domainEventDispatcher", () => ({ emitDomainEvent: vi.fn(async () => undefined) }));

    const { sendMessage } = await import("../services/v4/v4MessageService");

    await expect(sendMessage("thread_1", "contractor_1", "hello")).rejects.toMatchObject({
      status: 403,
      code: "V4_CONVERSATION_ENDED",
    });

    expect(insert).not.toHaveBeenCalled();
    expect(updateWhere).not.toHaveBeenCalled();
  });
});
