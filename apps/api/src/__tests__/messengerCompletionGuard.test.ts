import { describe, expect, test, vi, beforeEach } from "vitest";

beforeEach(() => {
  vi.resetModules();
  vi.restoreAllMocks();
});

describe("messenger completion guard", () => {
  test("requires appointment start time to be reached", async () => {
    process.env.DATABASE_URL ||= "postgres://localhost:5432/8fold_test?schema=8fold_test";
    let selectCall = 0;

    const chainFactory = () => {
      const chain: any = {};
      chain.from = () => chain;
      chain.innerJoin = () => chain;
      chain.leftJoin = () => chain;
      chain.where = () => chain;
      chain.orderBy = () => chain;
      chain.limit = async () => {
        selectCall += 1;
        if (selectCall === 1) {
          return [
            {
              id: "thread_1",
              jobId: "job_1",
              status: "ACTIVE",
              endedAt: null,
              jobPosterUserId: "poster_1",
              contractorUserId: "contractor_1",
              appointmentAt: null,
            },
          ];
        }
        if (selectCall === 2) {
          return [
            {
              id: "appt_1",
              threadId: "thread_1",
              status: "SCHEDULED",
              scheduledAtUTC: new Date(Date.now() + 60 * 60 * 1000),
            },
          ];
        }
        return [];
      };
      return chain;
    };

    vi.doMock("../../db/drizzle", () => ({
      db: {
        select: vi.fn(() => chainFactory()),
        insert: vi.fn(() => ({ values: vi.fn(async () => []) })),
        update: vi.fn(() => ({ set: () => ({ where: vi.fn(async () => []) }) })),
        transaction: vi.fn(async (fn: (tx: any) => Promise<unknown>) => await fn({})),
      },
    }));

    const { submitThreadCompletionReport } = await import("../services/v4/messengerService");

    await expect(
      submitThreadCompletionReport({
        threadId: "thread_1",
        userId: "contractor_1",
        role: "CONTRACTOR",
        completedOn: "2026-03-02",
        completedTime: "10:00",
        summaryText: "done",
        cooperation: 8,
        communication: 8,
      }),
    ).rejects.toMatchObject({
      code: "V4_APPOINTMENT_NOT_REACHED",
    });
  });
});
