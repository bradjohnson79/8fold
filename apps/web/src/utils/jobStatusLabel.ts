/**
 * Maps canonical job status codes to user-friendly display labels.
 */
export function jobStatusLabel(status: string): string {
  switch (status) {
    case "OPEN_FOR_ROUTING":
      return "Awaiting Router";
    case "ASSIGNED":
      return "Routed";
    case "CUSTOMER_APPROVED":
      return "Customer Approved";
    case "COMPLETED":
      return "Completed";
    case "CANCELLED":
      return "Cancelled";
    case "PENDING":
      return "Pending";
    case "IN_PROGRESS":
      return "In Progress";
    default:
      // Fallback: convert snake_case to Title Case
      return status
        .replaceAll("_", " ")
        .toLowerCase()
        .replace(/\b\w/g, (c) => c.toUpperCase());
  }
}

/**
 * Converts text to Title Case (e.g., "british columbia" → "British Columbia")
 */
export function titleCase(text: string): string {
  return text
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Formats a date string to a clean, readable format.
 * Example: "Mar 2, 2026"
 */
export function formatDate(date: string | Date | null | undefined): string {
  if (!date) return "—";
  const d = typeof date === "string" ? new Date(date) : date;
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}
