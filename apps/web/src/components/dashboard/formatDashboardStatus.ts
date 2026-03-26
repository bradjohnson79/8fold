"use client";

const JOB_STATUS_LABELS: Record<string, string> = {
  OPEN: "Available",
  OPEN_FOR_ROUTING: "Available",
  UNROUTED: "Awaiting Routing",
  ROUTING: "Routing",
  ROUTED: "Routed",
  ASSIGNED: "Assigned",
  PUBLISHED: "Appointment Booked",
  APPOINTMENT_BOOKED: "Appointment Booked",
  APPOINTMENT_ACCEPTED: "Appointment Accepted",
  JOB_STARTED: "Job Started",
  IN_PROGRESS: "In Progress",
  CONTRACTOR_COMPLETED: "Contractor Completed",
  CUSTOMER_APPROVED: "Customer Approved",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
};

export function formatJobStatus(status: string | null | undefined): string {
  const normalized = String(status ?? "").trim().toUpperCase().replace(/\s+/g, "_");
  if (!normalized) return "Unknown";

  return (
    JOB_STATUS_LABELS[normalized] ??
    normalized
      .toLowerCase()
      .replace(/_/g, " ")
      .replace(/\b\w/g, (char) => char.toUpperCase())
  );
}
