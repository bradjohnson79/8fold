"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { TradeCategorySchema, TradeCategoryLabel } from "@8fold/shared";
import type { useJobDraftV3 } from "../useJobDraftV3";
import { AppraisalProcessingModal } from "./AppraisalProcessingModal";

type DraftHook = ReturnType<typeof useJobDraftV3>;

type DetailsForm = {
  title: string;
  description: string;
  city: string;
  postalCode: string;
  region: string;
  category: string;
  isRegional: boolean;
  countryCode: string;
  addressSource: string;
  address: string;
  lat: number | null;
  lon: number | null;
  photos: string[];
};

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
  const [addressQuery, setAddressQuery] = useState("");
  const [nominatimResults, setNominatimResults] = useState<Array<{ display_name: string; lat: string; lon: string }>>([]);
  const [processingAppraisal, setProcessingAppraisal] = useState(false);
  const [appraisalError, setAppraisalError] = useState("");
  // IMPORTANT:
  // Form fields are local state.
  // Do NOT bind inputs directly to draft.data.details.
  // Draft is persisted only when Begin Appraisal is clicked.
  const [form, setForm] = useState<DetailsForm>(() => ({
    title: String(details.title ?? ""),
    description: String(details.description ?? ""),
    city: String(details.city ?? ""),
    postalCode: String(details.postalCode ?? ""),
    region: String(details.region ?? ""),
    category: String(details.category ?? ""),
    isRegional: Boolean(details.isRegional ?? false),
    countryCode: String(details.countryCode ?? "US"),
    addressSource: String(details.addressSource ?? "profile"),
    address: String(details.address ?? ""),
    lat: typeof details.lat === "number" ? details.lat : null,
    lon: typeof details.lon === "number" ? details.lon : null,
    photos: Array.isArray(details.photos) ? (details.photos as string[]).slice(0, 5) : [],
  }));

  function setField<K extends keyof DetailsForm>(key: K, value: DetailsForm[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function setPhotos(next: string[]) {
    setForm((prev) => ({ ...prev, photos: next.slice(0, 5) }));
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

  const profileSyncAttemptedRef = useRef(false);
  useEffect(() => {
    if (form.addressSource !== "profile") return;
    if (profileSyncAttemptedRef.current) return;
    if (form.city.trim() || form.region.trim()) return;

    let alive = true;
    profileSyncAttemptedRef.current = true;

    (async () => {
      try {
        const resp = await fetch("/api/app/job-poster/profile", { cache: "no-store", credentials: "include" });
        const json = await resp.json().catch(() => null);
        if (!alive || !json?.profile) return;
        const p = json.profile as Record<string, any>;
        setForm((prev) => ({
          ...prev,
          city: String(p?.city ?? prev.city),
          region: String(p?.stateProvince ?? prev.region),
          countryCode: String(p?.country ?? prev.countryCode ?? "US"),
        }));
      } catch {
        /* ignore */
      }
    })();

    return () => {
      alive = false;
    };
  }, [form.addressSource, form.city, form.region]);

  async function beginAppraisal() {
    setAppraisalError("");
    setProcessingAppraisal(true);

    try {
      await draft.patchDraft({
        dataPatch: {
          details: form,
        },
      });

      await draft.appraise();
    } catch (e) {
      setAppraisalError(e instanceof Error ? e.message : "Failed to appraise.");
    } finally {
      setProcessingAppraisal(false);
    }
  }

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-bold text-gray-900">Details</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <input
          type="text"
          value={form.title}
          onChange={(e) => setField("title", e.target.value)}
          placeholder="Job title"
          className="border border-gray-300 rounded-lg px-3 py-2"
          aria-label="Job title"
        />
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Category</label>
          <select
            value={form.category}
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
          value={form.region}
          placeholder="Province / State"
          className="border border-gray-300 rounded-lg px-3 py-2 bg-gray-100 text-gray-600"
          disabled
          readOnly
        />
        <input
          value={form.city}
          onChange={(e) => setField("city", e.target.value)}
          placeholder="City"
          className="border border-gray-300 rounded-lg px-3 py-2"
        />
        <input
          value={form.postalCode}
          onChange={(e) => setField("postalCode", e.target.value)}
          placeholder="Postal Code"
          className="border border-gray-300 rounded-lg px-3 py-2"
        />
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Country</label>
          <select
            value={form.countryCode}
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
          value={form.isRegional ? "regional" : "urban"}
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
              checked={form.addressSource === "profile"}
              onChange={() => setField("addressSource", "profile")}
            />
            Use profile address
          </label>
          <label className="flex items-center gap-2">
            <input
              type="radio"
              name="addressSource"
              checked={form.addressSource === "new"}
              onChange={() => setField("addressSource", "new")}
            />
            New address
          </label>
        </div>
        {form.addressSource === "new" && (
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
                      setForm((prev) => ({
                        ...prev,
                        address: r.display_name,
                        lat: parseFloat(r.lat),
                        lon: parseFloat(r.lon),
                      }));
                      setNominatimResults([]);
                      setAddressQuery(r.display_name);
                    }}
                  >
                    {r.display_name}
                  </li>
                ))}
              </ul>
            )}
            {form.lat != null && form.lon != null && (
              <p className="text-xs text-green-600 mt-1">Location: {form.lat.toFixed(4)}, {form.lon.toFixed(4)}</p>
            )}
          </div>
        )}
      </div>
      <textarea
        value={form.description}
        onChange={(e) => setField("description", e.target.value)}
        placeholder="Describe the work needed"
        className="w-full border border-gray-300 rounded-lg px-3 py-2 min-h-32"
      />

      <div>
        <div className="text-sm font-semibold text-gray-700">Photos (max 5 URL entries)</div>
        <div className="mt-2 space-y-2">
          {form.photos.map((p, idx) => (
            <div key={`${idx}-${p}`} className="flex gap-2">
              <input
                value={p}
                onChange={(e) => {
                  const next = [...form.photos];
                  next[idx] = e.target.value;
                  setPhotos(next);
                }}
                placeholder="https://..."
                className="flex-1 border border-gray-300 rounded-lg px-3 py-2"
              />
              <button
                onClick={() => setPhotos(form.photos.filter((_, i) => i !== idx))}
                className="border border-gray-300 rounded-lg px-3 py-2"
              >
                Remove
              </button>
            </div>
          ))}
          {form.photos.length < 5 ? (
            <button
              onClick={() => setPhotos([...form.photos, ""])}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
            >
              Add Photo URL
            </button>
          ) : null}
        </div>
      </div>

      <div className="pt-2">
        <button
          onClick={() => void beginAppraisal()}
          className="bg-8fold-green hover:bg-8fold-green-dark text-white font-semibold px-4 py-2 rounded-lg"
        >
          Begin Appraisal
        </button>
      </div>
      <AppraisalProcessingModal open={processingAppraisal} error={appraisalError} />
    </div>
  );
}
