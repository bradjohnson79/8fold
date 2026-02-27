import { describe, expect, test } from "vitest";
import { getUnassignedRefundEligibility } from "@/src/services/escrow/refundEligibility";

describe("getUnassignedRefundEligibility", () => {
  test("eligible exactly at 7-day threshold", () => {
    const paidAt = new Date("2026-01-01T00:00:00.000Z");
    const now = new Date("2026-01-08T00:00:00.000Z");

    const result = getUnassignedRefundEligibility({
      status: "OPEN_FOR_ROUTING",
      paymentStatus: "FUNDS_SECURED",
      contractorUserId: null,
      hasActiveAssignment: false,
      stripePaidAt: paidAt,
      stripeRefundedAt: null,
      now,
    });

    expect(result.eligible).toBe(true);
  });

  test("rejects before 7-day threshold", () => {
    const paidAt = new Date("2026-01-01T00:00:00.000Z");
    const now = new Date("2026-01-07T23:59:59.000Z");

    const result = getUnassignedRefundEligibility({
      status: "OPEN_FOR_ROUTING",
      paymentStatus: "FUNDS_SECURED",
      contractorUserId: null,
      hasActiveAssignment: false,
      stripePaidAt: paidAt,
      stripeRefundedAt: null,
      now,
    });

    expect(result).toMatchObject({ eligible: false, code: "REFUND_WINDOW_NOT_REACHED" });
  });

  test("rejects already-assigned jobs", () => {
    const result = getUnassignedRefundEligibility({
      status: "OPEN_FOR_ROUTING",
      paymentStatus: "FUNDS_SECURED",
      contractorUserId: "contractor_1",
      hasActiveAssignment: true,
      stripePaidAt: new Date("2026-01-01T00:00:00.000Z"),
      stripeRefundedAt: null,
      now: new Date("2026-01-09T00:00:00.000Z"),
    });

    expect(result).toMatchObject({ eligible: false, code: "ASSIGNED" });
  });

  test("returns already-refunded when refunded markers exist", () => {
    const result = getUnassignedRefundEligibility({
      status: "OPEN_FOR_ROUTING",
      paymentStatus: "REFUNDED",
      contractorUserId: null,
      hasActiveAssignment: false,
      stripePaidAt: new Date("2026-01-01T00:00:00.000Z"),
      stripeRefundedAt: new Date("2026-01-09T00:00:00.000Z"),
      now: new Date("2026-01-10T00:00:00.000Z"),
    });

    expect(result).toMatchObject({ eligible: false, code: "ALREADY_REFUNDED" });
  });
});
