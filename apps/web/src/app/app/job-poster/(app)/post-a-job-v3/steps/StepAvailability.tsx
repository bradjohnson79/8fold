"use client";

import type { useJobDraftV3 } from "../useJobDraftV3";

type DraftHook = ReturnType<typeof useJobDraftV3>;

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;
const WINDOWS = ["Morning", "Afternoon", "Evening"] as const;

export function StepAvailability({ draft }: { draft: DraftHook }) {
  const availability = (draft.draft?.data?.availability ?? {}) as Record<string, boolean>;

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
    <div className="space-y-4">
      <h2 className="text-lg font-bold text-gray-900">Availability</h2>
      <p className="text-sm text-gray-600">Select preferred times: Mon-Sun x Morning/Afternoon/Evening.</p>

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

      <div className="pt-2 flex gap-2">
        <button
          onClick={() => void draft.patchDraft({ step: "PRICING" })}
          className="border border-gray-300 text-gray-700 font-semibold px-4 py-2 rounded-lg"
        >
          Back
        </button>
        <button
          onClick={() => void draft.patchDraft({ step: "PAYMENT" })}
          className="bg-8fold-green hover:bg-8fold-green-dark text-white font-semibold px-4 py-2 rounded-lg"
        >
          Continue to Payment
        </button>
      </div>
    </div>
  );
}
