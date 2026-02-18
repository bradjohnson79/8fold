import { describe, expect, it } from "vitest";
import { exitCodeForAudit } from "./auditFinanceCiLogic";

describe("auditFinanceCiLogic", () => {
  it("returns non-zero exit code when CRITICAL exists", () => {
    const audit: any = {
      summary: { releasedJobsAudited: 1, jobsWithViolations: 1, violationCount: 1, violationsByType: { PLATFORM_LEDGER_DRIFT: 1 } },
      violations: [
        {
          type: "PLATFORM_LEDGER_DRIFT",
          severity: "CRITICAL",
          jobId: "aggregate",
          message: "Platform broker-fee ledger drift exceeds threshold",
          details: { absDiffCents: 500 },
        },
      ],
    };
    expect(exitCodeForAudit(audit)).toBe(2);
  });

  it("returns 0 when no CRITICAL exists", () => {
    const audit: any = { summary: {}, violations: [{ type: "X", severity: "HIGH", jobId: "job_1", message: "x" }] };
    expect(exitCodeForAudit(audit)).toBe(0);
  });
});

