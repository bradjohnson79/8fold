"use client";

export function ProgressBar({ value, max }: { value: number; max: number }) {
  const pct = max <= 0 ? 0 : Math.max(0, Math.min(100, (value / max) * 100));
  return (
    <div className="w-full">
      <div className="flex items-center justify-between text-sm text-gray-600">
        <span>
          <span className="font-semibold text-gray-900">{value}</span> / {max}
        </span>
        <span>{Math.round(pct)}%</span>
      </div>
      <div className="mt-2 h-3 rounded-full bg-gray-100 overflow-hidden border border-gray-200">
        <div
          className="h-full bg-8fold-green"
          style={{ width: `${pct}%` }}
          aria-label="progress"
        />
      </div>
    </div>
  );
}

export function IncentiveBadge({
  status
}: {
  status: "LOCKED" | "IN_PROGRESS" | "COMPLETED_AWAITING_ADMIN" | "ELIGIBLE_AWAITING_ADMIN";
}) {
  const cfg =
    status === "LOCKED"
      ? { label: "Locked", cls: "bg-gray-100 text-gray-700 border-gray-200" }
      : status === "IN_PROGRESS"
        ? { label: "In progress", cls: "bg-green-50 text-green-800 border-green-200" }
        : { label: "Completed (awaiting admin)", cls: "bg-yellow-50 text-yellow-800 border-yellow-200" };

  return (
    <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-semibold border ${cfg.cls}`}>
      {cfg.label}
    </span>
  );
}

