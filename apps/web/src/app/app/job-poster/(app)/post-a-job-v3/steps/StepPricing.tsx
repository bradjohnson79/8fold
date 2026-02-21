"use client";

import type { useJobDraftV3 } from "../useJobDraftV3";

type DraftHook = ReturnType<typeof useJobDraftV3>;

export function StepPricing({ draft }: { draft: DraftHook }) {
  const details = (draft.draft?.data?.details ?? {}) as Record<string, any>;
  const appraisal = (draft.draft?.data?.appraisal ?? null) as
    | null
    | { min: number; median: number; max: number; step: number; blurb: string };
  const pricing = (draft.draft?.data?.pricing ?? {}) as Record<string, any>;
  const selectedCents = Number(
    pricing.selectedPriceCents ?? (typeof appraisal?.median === "number" ? appraisal.median * 100 : 0)
  );
  const selectedDollars = Math.max(0, Math.round(selectedCents / 100));
  const min = Number(appraisal?.min ?? 50);
  const max = Number(appraisal?.max ?? 500);
  const median = Number(appraisal?.median ?? 100);
  const step = Number(appraisal?.step ?? 5);

  const guidance =
    selectedDollars < median
      ? "Caution: selected price is below AI median."
      : selectedDollars > median
      ? "Encouraging: selected price is above AI median."
      : "Selected price matches AI median.";

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-bold text-gray-900">Pricing</h2>
      <p className="text-sm text-gray-600">
        AI appraisal is a single call. Slider movement uses static UI rules only.
      </p>

      <button
        onClick={() => void draft.appraise()}
        disabled={draft.saving}
        className="border border-gray-300 rounded-lg px-4 py-2 font-semibold hover:bg-gray-50 disabled:opacity-60"
      >
        {draft.saving ? "Appraising..." : "Run AI Appraisal"}
      </button>

      {appraisal ? (
        <div className="rounded-xl border border-gray-200 p-4">
          <div className="text-sm text-gray-700">
            Range: <span className="font-semibold">${min}</span> - <span className="font-semibold">${max}</span> · Median{" "}
            <span className="font-semibold">${median}</span>
          </div>
          <input
            type="range"
            min={min}
            max={max}
            step={step}
            value={selectedDollars}
            onChange={(e) => {
              const dollars = Number(e.target.value);
              draft.autosavePatch({
                pricing: {
                  ...pricing,
                  selectedPriceCents: dollars * 100,
                  isRegional: Boolean(details.isRegional),
                },
              });
            }}
            className="w-full mt-3"
          />
          <div className="mt-2 text-sm font-semibold text-gray-900">Selected: ${selectedDollars}</div>
          <div className="mt-1 text-xs text-gray-600">{appraisal.blurb}</div>
          <div className="mt-2 text-xs text-gray-700">{guidance}</div>
        </div>
      ) : null}

      <div className="pt-2 flex gap-2">
        <button
          onClick={() => void draft.patchDraft({ step: "DETAILS" })}
          className="border border-gray-300 text-gray-700 font-semibold px-4 py-2 rounded-lg"
        >
          Back
        </button>
        <button
          onClick={() => void draft.patchDraft({ step: "AVAILABILITY" })}
          className="bg-8fold-green hover:bg-8fold-green-dark text-white font-semibold px-4 py-2 rounded-lg"
        >
          Continue to Availability
        </button>
      </div>
    </div>
  );
}
