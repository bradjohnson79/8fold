/**
 * Maps raw job status codes to user-friendly labels.
 */
export function jobStatusLabel(status: string): string {
  switch (status) {
    case "OPEN_FOR_ROUTING":
      return "Awaiting Router";
    case "ASSIGNED":
      return "Routed";
    case "COMPLETED":
      return "Completed";
    case "CANCELLED":
      return "Cancelled";
    case "CUSTOMER_APPROVED":
      return "Customer Approved";
    case "CUSTOMER_APPROVED_AWAITING_ROUTER":
      return "Awaiting Router";
    default:
      return status.replaceAll("_", " ");
  }
}
