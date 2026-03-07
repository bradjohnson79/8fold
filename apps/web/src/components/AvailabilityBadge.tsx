"use client";

type Props = {
  status: "AVAILABLE" | "BUSY";
};

const CONFIG = {
  AVAILABLE: {
    label: "AVAILABLE",
    bg: "bg-emerald-50",
    text: "text-emerald-700",
    tooltip:
      "This contractor has no current assignments and is available.",
  },
  BUSY: {
    label: "BUSY",
    bg: "bg-amber-50",
    text: "text-amber-700",
    tooltip:
      "This contractor is on a job. You can still route work to them, but choosing an available contractor may result in faster scheduling.",
  },
};

export default function AvailabilityBadge({ status }: Props) {
  const cfg = CONFIG[status];
  return (
    <span
      title={cfg.tooltip}
      className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-semibold ${cfg.bg} ${cfg.text}`}
    >
      {cfg.label}
    </span>
  );
}
