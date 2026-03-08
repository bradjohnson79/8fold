"use client";

import React from "react";

type Step = {
  label: string;
  done: boolean;
};

type Props = {
  steps: Step[];
  className?: string;
};

/** Reusable lifecycle timeline. Renders checkmarks for completed steps. */
export function JobLifecycleTimeline({ steps, className = "" }: Props) {
  return (
    <div className={`rounded-xl border border-slate-200 bg-white p-4 ${className}`}>
      <h3 className="text-sm font-semibold text-slate-700">Job Lifecycle</h3>
      <ul className="mt-2 space-y-1.5">
        {steps.map((step, i) => (
          <li key={i} className="flex items-center gap-2 text-sm">
            <span
              className={
                step.done
                  ? "text-emerald-600"
                  : "text-slate-300"
              }
            >
              {step.done ? "\u2713" : "\u25cb"}
            </span>
            <span className={step.done ? "text-slate-800" : "text-slate-500"}>
              {step.label}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Maps override state to number of completed steps (0-7). */
export function stepsForLifecycleState(state: string | null): Step[] {
  const base: Step[] = [
    { label: "Job Accepted", done: false },
    { label: "Appointment Booked", done: false },
    { label: "Job Started", done: false },
    { label: "Contractor Completed", done: false },
    { label: "Poster Completed", done: false },
    { label: "Funds Released", done: false },
    { label: "Review Submitted", done: false },
  ];

  const doneCount: Record<string, number> = {
    ACCEPTED: 1,
    APPOINTMENT_BOOKED: 2,
    JOB_STARTED: 3,
    CONTRACTOR_COMPLETED: 4,
    AWAITING_POSTER_COMPLETION: 4,
    COMPLETED: 5,
    PAYOUT_READY: 5,
    REVIEW_STAGE: 5,
    PAID: 6,
  };

  const n = state && state !== "REAL_STATE" ? (doneCount[state] ?? 0) : 0;
  return base.map((s, i) => ({ ...s, done: i < n }));
}
