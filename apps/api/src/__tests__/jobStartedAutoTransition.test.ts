import { describe, expect, test } from "vitest";
import { shouldAutoTransitionToJobStarted } from "@/src/services/v4/jobExecutionRules";

describe("jobStarted auto transition", () => {
  test("transitions PUBLISHED when appointment is reached", () => {
    const now = new Date("2026-03-02T12:00:00.000Z");
    const appointment = new Date("2026-03-02T11:59:59.000Z");
    expect(shouldAutoTransitionToJobStarted("PUBLISHED", appointment, now)).toBe(true);
  });

  test("does not transition when appointment not reached", () => {
    const now = new Date("2026-03-02T12:00:00.000Z");
    const appointment = new Date("2026-03-02T12:00:01.000Z");
    expect(shouldAutoTransitionToJobStarted("PUBLISHED", appointment, now)).toBe(false);
  });

  test("does not transition statuses beyond published", () => {
    const now = new Date("2026-03-02T12:00:00.000Z");
    const appointment = new Date("2026-03-02T11:00:00.000Z");
    expect(shouldAutoTransitionToJobStarted("JOB_STARTED", appointment, now)).toBe(false);
    expect(shouldAutoTransitionToJobStarted("COMPLETED", appointment, now)).toBe(false);
  });
});
