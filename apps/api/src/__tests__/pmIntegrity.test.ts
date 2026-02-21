import { describe, expect, test } from "vitest";
import { PMAllowedTransitions, assertAllowedTransition } from "@8fold/shared";
import { buildPmPiIdempotencyKey, buildPmPiMetadata } from "@/src/pm/integrity";
import { computePmReleaseAmounts } from "@/src/pm/releasePmFunds";

describe("P&M integrity guards", () => {
  test("payment intent idempotency key is stable", () => {
    expect(buildPmPiIdempotencyKey("abc-123")).toBe("pm:abc-123:pi");
  });

  test("payment intent metadata includes required anti-duplication fields", () => {
    const metadata = buildPmPiMetadata({
      pmRequestId: "pm-1",
      jobId: "job-1",
      posterId: "poster-1",
      contractorId: "contractor-1",
    });
    expect(metadata.type).toBe("pm_escrow");
    expect(metadata.pmRequestId).toBe("pm-1");
    expect(metadata.jobId).toBe("job-1");
    expect(metadata.posterId).toBe("poster-1");
    expect(metadata.contractorId).toBe("contractor-1");
  });

  test("overrun is capped at approved quote", () => {
    const { releaseAmountCents, remainderCents } = computePmReleaseAmounts(15_000, 10_000);
    expect(releaseAmountCents).toBe(10_000);
    expect(remainderCents).toBe(0);
  });

  test("normal release uses receipt total when below approved quote", () => {
    const { releaseAmountCents, remainderCents } = computePmReleaseAmounts(8_500, 10_000);
    expect(releaseAmountCents).toBe(8_500);
    expect(remainderCents).toBe(1_500);
  });

  test("state machine supports safe idempotent flow edges", () => {
    expect(() =>
      assertAllowedTransition("PMRequest", "DRAFT", "SUBMITTED", PMAllowedTransitions),
    ).not.toThrow();
    expect(() =>
      assertAllowedTransition("PMRequest", "SUBMITTED", "APPROVED", PMAllowedTransitions),
    ).not.toThrow();
    expect(() =>
      assertAllowedTransition("PMRequest", "APPROVED", "PAYMENT_PENDING", PMAllowedTransitions),
    ).not.toThrow();
    expect(() =>
      assertAllowedTransition("PMRequest", "PAYMENT_PENDING", "FUNDED", PMAllowedTransitions),
    ).not.toThrow();
    expect(() =>
      assertAllowedTransition("PMRequest", "VERIFIED", "RELEASED", PMAllowedTransitions),
    ).not.toThrow();
  });
});
