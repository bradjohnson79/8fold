"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { TradeCategorySchema, TradeCategoryLabel } from "@8fold/shared";
import type { useJobDraftV3 } from "../useJobDraftV3";

type DraftHook = ReturnType<typeof useJobDraftV3>;

const TRADE_OPTIONS = TradeCategorySchema.options.map((v) => ({
  value: v,
  label: TradeCategoryLabel[v as keyof typeof TradeCategoryLabel] ?? v.replace(/_/g, " "),
}));

const REGION_OPTIONS = [
  { value: "urban", label: "Urban", isRegional: false },
  { value: "regional", label: "Regional", isRegional: true },
] as const;

export function StepDetails({ draft }: { draft: DraftHook }) {
  const details = (draft.draft?.data?.details ?? {}) as Record<string, any>;
  const photos = Array.isArray(details.photos) ? (details.photos as string[]) : [];
  const [addressQuery, setAddressQuery] = useState("");
  const [nominatimResults, setNominatimResults] = useState<Array<{ display_name: string; lat: string; lon: string }>>([]);

  function setField(key: string, value: unknown) {
    draft.autosavePatch({ details: { ...details, [key]: value } });
  }

  function setPhotos(next: string[]) {
    draft.autosavePatch({ details: { ...details, photos: next.slice(0, 5) } });
  }

  const nominatimTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchNominatim = useCallback(async () => {
    if (!addressQuery.trim()) return;
    try {
      const resp = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(addressQuery)}&limit=5`,
        { headers: { "Accept-Language": "en", "User-Agent": "8Fold-Local/1.0" } }
      );
      const data = await resp.json();
      setNominatimResults(Array.isArray(data) ? data : []);
    } catch {
      setNominatimResults([]);
    }
  }, [addressQuery]);

  const debouncedSearchNominatim = useCallback(() => {
    if (nominatimTimerRef.current) clearTimeout(nominatimTimerRef.current);
    if (!addressQuery.trim()) {
      setNominatimResults([]);
      return;
    }
    nominatimTimerRef.current = setTimeout(() => void searchNominatim(), 400);
  }, [addressQuery, searchNominatim]);

  const addressSource = details.addressSource ?? "profile";
  const isRegional = Boolean(details.isRegional);

  useEffect(() => {
    if (addressSource !== "profile") return;
    if (details.address && details.lat != null && details.lon != null) return;
    let alive = true;
    (async () => {
      try {
        const resp = await fetch("/api/app/job-poster/profile", { cache: "no-store", credentials: "include" });
        const json = await resp.json().catch(() => null);
        if (!alive || !json?.profile) return;
        const p = json.profile as Record<string, any>;
        const addr = String(p?.mapDisplayName ?? p?.address ?? p?.defaultJobLocation ?? "").trim();
        const lat = typeof p?.lat === "number" ? p.lat : null;
        const lng = typeof p?.lng === "number" ? p.lng : null;
        if (!addr && lat == null && lng == null) return;
        draft.autosavePatch({
          details: {
            ...details,
            address: addr || details.address,
            lat: lat ?? details.lat,
            lon: lng ?? details.lon,
            city: p?.city ?? details.city,
            region: p?.stateProvince ?? details.region,
            countryCode: p?.country ?? details.countryCode ?? "US",
          },
        });
      } catch {
        /* ignore */
      }
    })();
    return () => { alive = false; };
  }, [addressSource, details.address, details.lat, details.lon, draft]);

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
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Category</label>
          <select
            value={String(details.category ?? "")}
            onChange={(e) => setField("category", e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2"
          >
            <option value="">Select category</option>
            {TRADE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
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
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Country</label>
          <select
            value={String(details.countryCode ?? "US")}
            onChange={(e) => setField("countryCode", e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2"
          >
            <option value="US">United States</option>
            <option value="CA">Canada</option>
          </select>
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">Job scope</label>
        <select
          value={isRegional ? "regional" : "urban"}
          onChange={(e) => setField("isRegional", e.target.value === "regional")}
          className="border border-gray-300 rounded-lg px-3 py-2"
        >
          {REGION_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <p className="text-xs text-gray-500 mt-1" title="Urban: local area. Regional: wider radius, +$20 routing fee to contractor on acceptance.">
          Urban: local area. Regional: wider radius, +$20 CAD/USD routing fee (goes to contractor on acceptance).
        </p>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">Address</label>
        <div className="space-y-2">
          <label className="flex items-center gap-2">
            <input
              type="radio"
              name="addressSource"
              checked={addressSource === "profile"}
              onChange={() => setField("addressSource", "profile")}
            />
            Use profile address
          </label>
          <label className="flex items-center gap-2">
            <input
              type="radio"
              name="addressSource"
              checked={addressSource === "new"}
              onChange={() => setField("addressSource", "new")}
            />
            New address
          </label>
        </div>
        {addressSource === "new" && (
          <div className="mt-2">
            <input
              value={addressQuery}
              onChange={(e) => {
                setAddressQuery(e.target.value);
                debouncedSearchNominatim();
              }}
              onBlur={() => void searchNominatim()}
              onKeyDown={(e) => e.key === "Enter" && void searchNominatim()}
              placeholder="Search address (OpenStreetMap)"
              className="border border-gray-300 rounded-lg px-3 py-2 w-full"
            />
            {nominatimResults.length > 0 && (
              <ul className="mt-2 border border-gray-200 rounded-lg divide-y">
                {nominatimResults.map((r, i) => (
                  <li
                    key={i}
                    className="px-3 py-2 text-sm cursor-pointer hover:bg-gray-50"
                    onClick={() => {
                      draft.autosavePatch({
                        details: {
                          ...details,
                          address: r.display_name,
                          lat: parseFloat(r.lat),
                          lon: parseFloat(r.lon),
                        },
                      });
                      setNominatimResults([]);
                      setAddressQuery(r.display_name);
                    }}
                  >
                    {r.display_name}
                  </li>
                ))}
              </ul>
            )}
            {(details.lat != null && details.lon != null) && (
              <p className="text-xs text-green-600 mt-1">Location: {details.lat?.toFixed(4)}, {details.lon?.toFixed(4)}</p>
            )}
          </div>
        )}
      </div>
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
          Continue to AI + Pricing
        </button>
      </div>
    </div>
  );
}
