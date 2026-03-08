"use client";

import React, { useState } from "react";

export const LIFECYCLE_STATES = [
  "REAL_STATE",
  "ACCEPTED",
  "APPOINTMENT_BOOKED",
  "JOB_STARTED",
  "CONTRACTOR_COMPLETED",
  "AWAITING_POSTER_COMPLETION",
  "COMPLETED",
  "PAYOUT_READY",
  "REVIEW_STAGE",
  "PAID",
] as const;

export type LifecycleState = (typeof LIFECYCLE_STATES)[number];

type Props = {
  show: boolean;
  currentState: LifecycleState | null;
  onApply: (state: LifecycleState | null) => void;
};

/** Development-only lifecycle override. Visible when isAdmin or NODE_ENV=development. Does not modify DB. */
export function LifecycleDebugPanel({ show, currentState, onApply }: Props) {
  const [selected, setSelected] = useState<LifecycleState>(currentState ?? "REAL_STATE");

  if (!show) return null;

  return (
    <section className="rounded-xl border border-amber-300 bg-amber-50 p-4">
      <h3 className="text-sm font-bold text-amber-800">Lifecycle Debug (Admin Only)</h3>
      <p className="mt-0.5 text-xs text-amber-700">
        UI-only override. Does not modify database.
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <select
          value={selected}
          onChange={(e) => setSelected(e.target.value as LifecycleState)}
          className="rounded-lg border border-amber-300 bg-white px-3 py-2 text-sm font-medium text-slate-800"
        >
          {LIFECYCLE_STATES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => onApply(selected === "REAL_STATE" ? null : selected)}
          className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-700"
        >
          Apply
        </button>
      </div>
    </section>
  );
}
