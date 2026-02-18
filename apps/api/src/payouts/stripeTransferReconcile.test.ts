import { describe, expect, it } from "vitest";
import { buildTransferRecordReconcilePlan, desiredTransferRecordStatusFromStripeTransfer } from "./stripeTransferReconcile";

describe("stripeTransferReconcile", () => {
  it("noops when already in desired state", () => {
    expect(buildTransferRecordReconcilePlan("SENT", "SENT").kind).toBe("noop");
  });

  it("builds two-step plan for PENDING -> REVERSED", () => {
    const plan = buildTransferRecordReconcilePlan("PENDING", "REVERSED");
    expect(plan.kind).toBe("update");
    if (plan.kind !== "update") return;
    expect(plan.steps).toEqual([
      { from: "PENDING", to: "SENT" },
      { from: "SENT", to: "REVERSED" },
    ]);
  });

  it("rejects illegal regression FAILED -> SENT", () => {
    const plan = buildTransferRecordReconcilePlan("FAILED", "SENT");
    expect(plan.kind).toBe("illegal");
  });

  it("infers desired status from transfer.updated fields", () => {
    expect(desiredTransferRecordStatusFromStripeTransfer({ reversed: false, amount_reversed: 0 } as any)).toBe("SENT");
    expect(desiredTransferRecordStatusFromStripeTransfer({ reversed: true, amount_reversed: 0 } as any)).toBe("REVERSED");
    expect(desiredTransferRecordStatusFromStripeTransfer({ reversed: false, amount_reversed: 1 } as any)).toBe("REVERSED");
  });
});

