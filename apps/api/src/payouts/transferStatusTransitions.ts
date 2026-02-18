export type TransferRecordStatus = "PENDING" | "SENT" | "FAILED" | "REVERSED";

export type TransferLifecycleEventType = "transfer.created" | "transfer.failed" | "transfer.reversed";

export function nextStatusForTransferLifecycleEvent(eventType: TransferLifecycleEventType): TransferRecordStatus {
  if (eventType === "transfer.created") return "SENT";
  if (eventType === "transfer.failed") return "FAILED";
  return "REVERSED";
}

export function isAllowedTransferRecordStatusTransition(from: TransferRecordStatus, to: TransferRecordStatus): boolean {
  if (from === to) return true; // idempotent no-op

  // Allowed transitions (financially safe).
  if (from === "PENDING" && (to === "SENT" || to === "FAILED")) return true;
  if (from === "SENT" && to === "REVERSED") return true;
  if (from === "FAILED" && to === "REVERSED") return true;

  return false;
}

