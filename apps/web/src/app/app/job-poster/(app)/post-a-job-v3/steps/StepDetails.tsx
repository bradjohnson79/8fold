"use client";

import type { useJobDraftV3 } from "../useJobDraftV3";

type DraftHook = ReturnType<typeof useJobDraftV3>;

export function StepDetails({ draft }: { draft: DraftHook }) {
  const details = (draft.draft?.data?.details ?? {}) as Record<string, any>;
  const photos = Array.isArray(details.photos) ? (details.photos as string[]) : [];

  function setField(key: string, value: unknown) {
    draft.autosavePatch({ details: { ...details, [key]: value } });
  }

  function setPhotos(next: string[]) {
    draft.autosavePatch({ details: { ...details, photos: next.slice(0, 5) } });
  }

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-bold text-gray-900">Details</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <input
          value={String(details.title ?? "")}
          onChange={(e) => setField("title", e.target.value)}
          placeholder="Job title"
          className="border border-gray-300 rounded-lg px-3 py-2"
        />
        <input
          value={String(details.category ?? "")}
          onChange={(e) => setField("category", e.target.value)}
          placeholder="Category (e.g. HANDYMAN)"
          className="border border-gray-300 rounded-lg px-3 py-2"
        />
        <input
          value={String(details.region ?? "")}
          onChange={(e) => setField("region", e.target.value)}
          placeholder="Region / State"
          className="border border-gray-300 rounded-lg px-3 py-2"
        />
        <input
          value={String(details.city ?? "")}
          onChange={(e) => setField("city", e.target.value)}
          placeholder="City"
          className="border border-gray-300 rounded-lg px-3 py-2"
        />
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={Boolean(details.isRegional)}
          onChange={(e) => setField("isRegional", e.target.checked)}
        />
        Regional job (+$20 routing fee)
      </label>
      <textarea
        value={String(details.description ?? "")}
        onChange={(e) => setField("description", e.target.value)}
        placeholder="Describe the work needed"
        className="w-full border border-gray-300 rounded-lg px-3 py-2 min-h-32"
      />

      <div>
        <div className="text-sm font-semibold text-gray-700">Photos (max 5 URL entries)</div>
        <div className="mt-2 space-y-2">
          {photos.map((p, idx) => (
            <div key={`${idx}-${p}`} className="flex gap-2">
              <input
                value={p}
                onChange={(e) => {
                  const next = [...photos];
                  next[idx] = e.target.value;
                  setPhotos(next);
                }}
                placeholder="https://..."
                className="flex-1 border border-gray-300 rounded-lg px-3 py-2"
              />
              <button
                onClick={() => setPhotos(photos.filter((_, i) => i !== idx))}
                className="border border-gray-300 rounded-lg px-3 py-2"
              >
                Remove
              </button>
            </div>
          ))}
          {photos.length < 5 ? (
            <button
              onClick={() => setPhotos([...photos, ""])}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
            >
              Add Photo URL
            </button>
          ) : null}
        </div>
      </div>

      <div className="pt-2">
        <button
          onClick={() => void draft.patchDraft({ step: "PRICING" })}
          className="bg-8fold-green hover:bg-8fold-green-dark text-white font-semibold px-4 py-2 rounded-lg"
        >
          Continue to Pricing
        </button>
      </div>
    </div>
  );
}
