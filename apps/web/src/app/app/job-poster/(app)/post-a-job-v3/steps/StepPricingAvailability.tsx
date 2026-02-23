"use client";

import { useEffect, useMemo, useState } from "react";
import type { useJobDraftV3 } from "../useJobDraftV3";

type DraftHook = ReturnType<typeof useJobDraftV3>;

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;
const WINDOWS = ["Morning", "Afternoon", "Evening"] as const;

export function StepPricingAvailability({ draft }: { draft: DraftHook }) {
  const details = (draft.draft?.data?.details ?? {}) as Record<string, any>;
  const persistedAppraisal = (draft.draft?.data?.appraisal ?? null) as
    | null
    | { min: number; median: number; max: number; step?: number; rationale?: string; blurb?: string };
  const appraisal = (draft.appraisal ?? persistedAppraisal ?? null) as
    | null
    | { min: number; median: number; max: number; step?: number; rationale?: string; blurb?: string };
  const pricing = (draft.draft?.data?.pricing ?? {}) as Record<string, any>;
  const availability = (draft.draft?.data?.availability ?? {}) as Record<string, boolean>;

  const initialSelectedDollars = useMemo(() => {
    const fromPricing = Number(pricing.selectedPriceCents ?? 0);
    if (Number.isFinite(fromPricing) && fromPricing > 0) return Math.max(0, Math.round(fromPricing / 100));
    return Number(appraisal?.median ?? 0);
  }, [pricing.selectedPriceCents, appraisal?.median]);
  const [selectedDollars, setSelectedDollars] = useState<number>(initialSelectedDollars);
  useEffect(() => {
    setSelectedDollars(initialSelectedDollars);
  }, [initialSelectedDollars]);

  const selectedCents = Math.max(0, Math.round(selectedDollars * 100));
  const min = Number(appraisal?.min ?? 50);
  const max = Number(appraisal?.max ?? 500);
  const median = Number(appraisal?.median ?? 100);
  const step = 5;
  const rationale = String(appraisal?.rationale ?? appraisal?.blurb ?? "").trim();

  const guidance =
    selectedDollars < median
      ? "Lower pricing may result in slower response from 8Fold Contractors."
      : selectedDollars > median
        ? "Higher pricing encourages faster response from 8Fold Contractors."
        : "";

  function key(day: string, window: string) {
    return `${day}_${window}`;
  }

  function toggle(day: string, window: string, checked: boolean) {
    draft.autosavePatch({
      availability: {
        ...availability,
        [key(day, window)]: checked,
      },
    });
  }

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-bold text-gray-900">AI Appraisal + Pricing + Availability</h2>

      {appraisal ? (
        <div className="rounded-xl border border-gray-200 p-4">
          <div className="text-sm font-semibold text-gray-900">Job Appraisal Rationale</div>
          <div className="mt-1 text-xs text-gray-700">{rationale}</div>
          <div className="text-sm text-gray-700">
            Estimated range: <span className="font-semibold">${min}</span> - <span className="font-semibold">${max}</span> · Median{" "}
            <span className="font-semibold">${median}</span>
          </div>
          <input
            type="range"
            min={min}
            max={max}
            step={step}
            value={Math.min(max, Math.max(min, selectedDollars))}
            onChange={(e) => {
              const dollars = Number(e.target.value);
              setSelectedDollars(Math.min(max, Math.max(min, dollars)));
            }}
            className="w-full mt-3"
          />
          <div className="mt-2 text-sm font-semibold text-gray-900">Selected: ${selectedDollars} ($5 increments)</div>
          {guidance ? <div className="mt-2 text-xs text-gray-700">{guidance}</div> : null}
        </div>
      ) : (
        <div className="rounded-xl border border-gray-200 p-4 bg-gray-50">
          <div className="text-sm text-gray-600">Run appraisal from the Details step to continue.</div>
        </div>
      )}

      <div>
        <h3 className="text-base font-semibold text-gray-900 mb-2">Availability</h3>
        <p className="text-sm text-gray-600 mb-3">Select preferred times: Mon-Sun × Morning/Afternoon/Evening.</p>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <th className="border border-gray-200 p-2 text-left">Day</th>
                {WINDOWS.map((w) => (
                  <th key={w} className="border border-gray-200 p-2 text-left">
                    {w}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {DAYS.map((d) => (
                <tr key={d}>
                  <td className="border border-gray-200 p-2 font-medium">{d}</td>
                  {WINDOWS.map((w) => (
                    <td key={w} className="border border-gray-200 p-2">
                      <input
                        type="checkbox"
                        checked={Boolean(availability[key(d, w)])}
                        onChange={(e) => toggle(d, w, e.target.checked)}
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="pt-2 flex gap-2">
        <button
          onClick={() => void draft.patchDraft({ step: "DETAILS" })}
          className="border border-gray-300 text-gray-700 font-semibold px-4 py-2 rounded-lg"
        >
          Back
        </button>
        <button
          onClick={() => {
            if (!appraisal) return;
            void draft.patchDraft({
              dataPatch: {
                appraisal: {
                  min: appraisal.min,
                  median: appraisal.median,
                  max: appraisal.max,
                  step: step,
                  rationale: rationale,
                },
                pricing: {
                  ...pricing,
                  selectedPriceCents: selectedCents,
                  isRegional: Boolean(details.isRegional),
                  totalCents: selectedCents + (Boolean(details.isRegional) ? 2000 : 0),
                },
              },
              step: "PAYMENT",
            });
          }}
          disabled={!appraisal}
          className="bg-8fold-green hover:bg-8fold-green-dark text-white font-semibold px-4 py-2 rounded-lg"
        >
          Continue to Payment
        </button>
      </div>
    </div>
  );
}
