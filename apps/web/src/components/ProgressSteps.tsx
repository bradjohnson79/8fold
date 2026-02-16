"use client";

export type Step = { label: string };

export function ProgressSteps({
  steps,
  currentIdx,
}: {
  steps: readonly Step[];
  currentIdx: number;
}) {
  return (
    <div className="flex flex-wrap gap-2 text-sm">
      {steps.map((s, idx) => {
        const active = idx === currentIdx;
        const done = idx < currentIdx;
        return (
          <div
            key={s.label}
            className={[
              "rounded-full px-3 py-1 border",
              done ? "bg-8fold-green text-white border-8fold-green" : "",
              active ? "bg-white text-gray-900 border-gray-300 font-semibold" : "",
              !active && !done ? "bg-gray-50 text-gray-600 border-gray-200" : "",
            ].join(" ")}
          >
            {s.label}
          </div>
        );
      })}
    </div>
  );
}

