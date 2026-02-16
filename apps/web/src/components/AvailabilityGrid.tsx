"use client";

import React from "react";

export type AvailabilityDayKey =
  | "monday"
  | "tuesday"
  | "wednesday"
  | "thursday"
  | "friday"
  | "saturday"
  | "sunday";

export type AvailabilityBlockKey = "morning" | "afternoon" | "evening";

export type AvailabilityDay = { morning: boolean; afternoon: boolean; evening: boolean };

export type Availability = Partial<Record<AvailabilityDayKey, AvailabilityDay>>;

const DAYS: { key: AvailabilityDayKey; label: string }[] = [
  { key: "monday", label: "Monday" },
  { key: "tuesday", label: "Tuesday" },
  { key: "wednesday", label: "Wednesday" },
  { key: "thursday", label: "Thursday" },
  { key: "friday", label: "Friday" },
  { key: "saturday", label: "Saturday" },
  { key: "sunday", label: "Sunday" },
];

const BLOCKS: { key: AvailabilityBlockKey; label: string; range: string }[] = [
  { key: "morning", label: "Morning", range: "7am–11am" },
  { key: "afternoon", label: "Afternoon", range: "12pm–4pm" },
  { key: "evening", label: "Evening", range: "5pm–9pm" },
];

export function normalizeAvailability(value: Availability | null | undefined): Availability | null {
  if (!value) return null;
  const out: Availability = {};
  for (const d of DAYS) {
    const day = value[d.key];
    const morning = Boolean(day?.morning);
    const afternoon = Boolean(day?.afternoon);
    const evening = Boolean(day?.evening);
    if (morning || afternoon || evening) out[d.key] = { morning, afternoon, evening };
  }
  return Object.keys(out).length ? out : null;
}

export function formatAvailability(value: Availability | null | undefined): string[] {
  const a = normalizeAvailability(value);
  if (!a) return [];
  const out: string[] = [];
  for (const d of DAYS) {
    const day = a[d.key];
    if (!day) continue;
    const parts: string[] = [];
    if (day.morning) parts.push("Morning");
    if (day.afternoon) parts.push("Afternoon");
    if (day.evening) parts.push("Evening");
    if (parts.length) out.push(`${d.label}: ${parts.join(", ")}`);
  }
  return out;
}

export function AvailabilityGrid({
  value,
  onChange,
}: {
  value: Availability;
  onChange: (next: Availability) => void;
}) {
  function toggle(day: AvailabilityDayKey, block: AvailabilityBlockKey) {
    const current = value[day] ?? { morning: false, afternoon: false, evening: false };
    const nextDay: AvailabilityDay = { ...current, [block]: !current[block] };
    onChange({ ...value, [day]: nextDay });
  }

  return (
    <div className="mt-4 border border-gray-200 rounded-2xl overflow-hidden">
      <div className="px-4 py-3 bg-gray-50 border-b border-gray-200">
        <div className="text-sm font-semibold text-gray-900">Job Poster Availability (optional)</div>
        <div className="text-xs text-gray-600 mt-1">
          Contractors can still propose any time. This is informational only.
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-[640px] w-full text-sm">
          <thead>
            <tr className="text-left bg-white">
              <th className="px-4 py-3 border-b border-gray-200 w-[160px]">Day</th>
              {BLOCKS.map((b) => (
                <th key={b.key} className="px-4 py-3 border-b border-gray-200">
                  <div className="font-semibold text-gray-900">{b.label}</div>
                  <div className="text-xs text-gray-500">{b.range}</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {DAYS.map((d) => {
              const day = value[d.key] ?? { morning: false, afternoon: false, evening: false };
              return (
                <tr key={d.key} className="bg-white">
                  <td className="px-4 py-3 border-b border-gray-100 font-semibold text-gray-900">{d.label}</td>
                  {BLOCKS.map((b) => {
                    const checked = Boolean((day as any)[b.key]);
                    return (
                      <td key={b.key} className="px-4 py-3 border-b border-gray-100">
                        <label className="inline-flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggle(d.key, b.key)}
                            className="h-4 w-4"
                            aria-label={`${d.label} ${b.label}`}
                          />
                          <span className="text-gray-700">{checked ? "Selected" : "—"}</span>
                        </label>
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

