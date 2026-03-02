import { describe, expect, test } from "vitest";

describe("messenger time remaining", () => {
  test("computes hours/minutes and late-action threshold", async () => {
    process.env.DATABASE_URL ||= "postgres://localhost:5432/8fold_test?schema=8fold_test";
    const { computeTimeRemaining } = await import("../services/v4/messengerService");
    const now = new Date("2026-03-02T10:00:00.000Z");
    const early = new Date("2026-03-02T20:30:00.000Z");
    const late = new Date("2026-03-02T16:30:00.000Z");

    const earlyRemaining = computeTimeRemaining(early, now);
    expect(earlyRemaining.hours).toBe(10);
    expect(earlyRemaining.minutes).toBe(30);
    expect(earlyRemaining.lateAction).toBe(false);

    const lateRemaining = computeTimeRemaining(late, now);
    expect(lateRemaining.hours).toBe(6);
    expect(lateRemaining.minutes).toBe(30);
    expect(lateRemaining.lateAction).toBe(true);
  });
});
