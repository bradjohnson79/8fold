import { describe, expect, it } from "vitest";
import { isRefundInitiatedOrCompleteJobPayment } from "./releaseSafetyGuards";

describe("releaseSafetyGuards", () => {
  it("blocks when status is REFUNDED", () => {
    expect(isRefundInitiatedOrCompleteJobPayment({ status: "REFUNDED" }).blocked).toBe(true);
  });

  it("blocks when refund timestamps are set", () => {
    expect(isRefundInitiatedOrCompleteJobPayment({ status: "CAPTURED", refundedAt: new Date() }).blocked).toBe(true);
    expect(isRefundInitiatedOrCompleteJobPayment({ status: "CAPTURED", refundIssuedAt: new Date() }).blocked).toBe(true);
  });

  it("allows when no refund indicators exist", () => {
    expect(isRefundInitiatedOrCompleteJobPayment({ status: "CAPTURED", refundedAt: null, refundIssuedAt: null }).blocked).toBe(false);
  });
});

