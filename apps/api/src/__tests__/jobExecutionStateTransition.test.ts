import { describe, expect, test } from "vitest";
import { computeExecutionEligibility, mapLegacyStatusForExecution } from "@/src/services/v4/jobExecutionRules";

describe("job execution state transitions", () => {
  test("legacy IN_PROGRESS maps to JOB_STARTED for execution UI", () => {
    expect(mapLegacyStatusForExecution("IN_PROGRESS")).toBe("JOB_STARTED");
    expect(mapLegacyStatusForExecution("PUBLISHED")).toBe("PUBLISHED");
  });

  test("can mark complete only when started, appointment reached, and not completed", () => {
    const now = new Date("2026-03-02T12:00:00.000Z");
    const eligibility = computeExecutionEligibility(
      {
        id: "job_1",
        status: "JOB_STARTED",
        appointment_at: new Date("2026-03-02T11:00:00.000Z"),
        completed_at: null,
        contractor_marked_complete_at: null,
        poster_marked_complete_at: null,
      },
      now,
    );
    expect(eligibility.canMarkComplete).toBe(true);
    expect(eligibility.executionStatus).toBe("READY");
  });

  test("completion blocks further mark-complete actions", () => {
    const now = new Date("2026-03-02T12:00:00.000Z");
    const eligibility = computeExecutionEligibility(
      {
        id: "job_1",
        status: "COMPLETED",
        appointment_at: new Date("2026-03-02T11:00:00.000Z"),
        completed_at: new Date("2026-03-02T11:55:00.000Z"),
        contractor_marked_complete_at: new Date("2026-03-02T11:30:00.000Z"),
        poster_marked_complete_at: new Date("2026-03-02T11:50:00.000Z"),
      },
      now,
    );
    expect(eligibility.canMarkComplete).toBe(false);
    expect(eligibility.executionStatus).toBe("COMPLETED");
  });
});
