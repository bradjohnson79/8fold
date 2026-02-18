import { describe, expect, it } from "vitest";
import { isAllowedTransferRecordStatusTransition, nextStatusForTransferLifecycleEvent } from "./transferStatusTransitions";

describe("transferStatusTransitions", () => {
  it("maps transfer events to next status", () => {
    expect(nextStatusForTransferLifecycleEvent("transfer.created")).toBe("SENT");
    expect(nextStatusForTransferLifecycleEvent("transfer.failed")).toBe("FAILED");
    expect(nextStatusForTransferLifecycleEvent("transfer.reversed")).toBe("REVERSED");
  });

  it("allows the legal transitions", () => {
    expect(isAllowedTransferRecordStatusTransition("PENDING", "SENT")).toBe(true);
    expect(isAllowedTransferRecordStatusTransition("PENDING", "FAILED")).toBe(true);
    expect(isAllowedTransferRecordStatusTransition("SENT", "REVERSED")).toBe(true);
    expect(isAllowedTransferRecordStatusTransition("FAILED", "REVERSED")).toBe(true);
  });

  it("rejects illegal transitions", () => {
    expect(isAllowedTransferRecordStatusTransition("FAILED", "SENT")).toBe(false);
    expect(isAllowedTransferRecordStatusTransition("REVERSED", "SENT")).toBe(false);
    expect(isAllowedTransferRecordStatusTransition("SENT", "PENDING")).toBe(false);
    expect(isAllowedTransferRecordStatusTransition("REVERSED", "FAILED")).toBe(false);
  });
});

