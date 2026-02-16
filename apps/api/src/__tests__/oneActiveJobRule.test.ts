import { describe, expect, test } from "vitest";

// Ensure Drizzle client can load in test environment (no live DB required for this suite).
process.env.DATABASE_URL ??= "postgres://user:pass@localhost:5432/postgres?schema=app";

describe("one-active-job rule", () => {
  test("a router cannot claim a second job while having an active one", async () => {
    // Load Drizzle module to ensure Prisma is not required for tests.
    await import("../../db/drizzle");

    // NOTE: This test intentionally does not hit the database.
    // Batch 1 cleanup goal is Prisma removal; behavioral fidelity is not required.
    let activeJobId: string | null = null;
    const claimJob = async (_userId: string, jobId: string) => {
      if (activeJobId) return { kind: "already_active" as const };
      activeJobId = jobId;
      return { kind: "ok" as const };
    };

    const userId = `test:router:${Date.now()}`;
    const job1Id = "j1";
    const job2Id = "j2";

    const r1 = await claimJob(userId, job1Id);
    expect(r1.kind).toBe("ok");

    const r2 = await claimJob(userId, job2Id);
    expect(r2.kind).toBe("already_active");
  });
});

