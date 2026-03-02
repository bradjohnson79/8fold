import { describe, expect, test } from "vitest";
import { computeExecutionEligibility } from "@/src/services/v4/jobExecutionRules";

describe("job dual completion markers", () => {
  test("single contractor mark leaves job awaiting counterpart", () => {
    const now = new Date("2026-03-02T12:00:00.000Z");
    const eligibility = computeExecutionEligibility(
      {
        id: "job_1",
        status: "JOB_STARTED",
        appointment_at: new Date("2026-03-02T11:00:00.000Z"),
        completed_at: null,
        contractor_marked_complete_at: new Date("2026-03-02T11:45:00.000Z"),
        poster_marked_complete_at: null,
      },
      now,
    );
    expect(eligibility.executionStatus).toBe("AWAITING_COUNTERPARTY");
    expect(eligibility.canMarkComplete).toBe(true);
  });

  test("single poster mark leaves job awaiting counterpart", () => {
    const now = new Date("2026-03-02T12:00:00.000Z");
    const eligibility = computeExecutionEligibility(
      {
        id: "job_1",
        status: "JOB_STARTED",
        appointment_at: new Date("2026-03-02T11:00:00.000Z"),
        completed_at: null,
        contractor_marked_complete_at: null,
        poster_marked_complete_at: new Date("2026-03-02T11:46:00.000Z"),
      },
      now,
    );
    expect(eligibility.executionStatus).toBe("AWAITING_COUNTERPARTY");
    expect(eligibility.canMarkComplete).toBe(true);
  });

  test("dual marks with completed_at yields COMPLETED state", () => {
    const now = new Date("2026-03-02T12:00:00.000Z");
    const eligibility = computeExecutionEligibility(
      {
        id: "job_1",
        status: "COMPLETED",
        appointment_at: new Date("2026-03-02T11:00:00.000Z"),
        completed_at: new Date("2026-03-02T11:59:00.000Z"),
        contractor_marked_complete_at: new Date("2026-03-02T11:45:00.000Z"),
        poster_marked_complete_at: new Date("2026-03-02T11:46:00.000Z"),
      },
      now,
    );
    expect(eligibility.executionStatus).toBe("COMPLETED");
    expect(eligibility.canMarkComplete).toBe(false);
  });
});
