"use client";

const STATUS_COLORS: Record<string, string> = {
  OPEN_FOR_ROUTING: "bg-gray-100 text-gray-800",
  ASSIGNED: "bg-blue-100 text-blue-800",
  PUBLISHED: "bg-purple-100 text-purple-800",
  JOB_STARTED: "bg-yellow-100 text-yellow-800",
  IN_PROGRESS: "bg-yellow-100 text-yellow-800",
  COMPLETED: "bg-green-100 text-green-800",
  CONTRACTOR_COMPLETED: "bg-green-100 text-green-800",
  CUSTOMER_APPROVED: "bg-green-100 text-green-800",
  CANCELLED: "bg-red-100 text-red-800",
};

const STATUS_TOOLTIPS: Record<string, string> = {
  ASSIGNED:
    "The contractor accepted but has not scheduled the appointment yet.",
  PUBLISHED: "The contractor has scheduled the appointment.",
  JOB_STARTED: "The contractor has begun work.",
  IN_PROGRESS: "The contractor is currently working on the job.",
  COMPLETED: "The job has been completed and payment released.",
  CONTRACTOR_COMPLETED: "The contractor marked the job as finished.",
  CUSTOMER_APPROVED:
    "The customer approved completion and payment was released.",
};

type Props = { status: string };

export default function StatusBadge({ status }: Props) {
  const normalized = status.toUpperCase().replace(/\s+/g, "_");
  const color = STATUS_COLORS[normalized] ?? "bg-gray-100 text-gray-800";
  const tooltip = STATUS_TOOLTIPS[normalized];

  return (
    <span
      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${color}`}
      title={tooltip}
    >
      {status.replace(/_/g, " ")}
    </span>
  );
}
