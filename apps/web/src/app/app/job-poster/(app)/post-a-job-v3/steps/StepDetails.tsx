"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { TradeCategorySchema, TradeCategoryLabel } from "@8fold/shared";
import type { useJobDraftV3 } from "../useJobDraftV3";
import { PhotoUpload } from "@/components/PhotoUpload";
import { AppraisalModal } from "./AppraisalModal";

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
  const [profileProvince, setProfileProvince] = useState("");
  const [profileData, setProfileData] = useState<Record<string, any> | null>(null);
  const [appraising, setAppraising] = useState(false);

  // Local state for title ensures immediate display on keystroke (avoids async/optimistic update lag)
  const [titleValue, setTitleValue] = useState("");
  const prevDraftId = useRef<string | null>(null);
  useEffect(() => {
    if (draft.loading) return;
    const draftId = draft.draft?.id ?? null;
    const fromDraft = String(details.title ?? "");
    // Sync from draft when draft loads or when we return to this step (new mount)
    if (draftId !== prevDraftId.current || prevDraftId.current === null) {
      prevDraftId.current = draftId;
      setTitleValue(fromDraft);
    }
  }, [draft.loading, draft.draft?.id, details.title]);

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
    let alive = true;
    (async () => {
      try {
        const resp = await fetch("/api/app/job-poster/profile", { cache: "no-store", credentials: "include" });
        const json = await resp.json().catch(() => null);
        if (!alive || !json?.profile) return;
        const p = json.profile as Record<string, any>;
        setProfileData(p);
        const province = String(p?.stateProvince ?? p?.legalProvince ?? "").trim().toUpperCase();
        if (province) setProfileProvince(province);
      } catch {
        /* ignore */
      }
    })();
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    if (addressSource !== "profile") return;
    if (!profileData) return;
    if (details.address && details.lat != null && details.lon != null) return;
    const province = String(profileData?.stateProvince ?? profileData?.legalProvince ?? profileProvince).trim().toUpperCase();
    const addr = String(profileData?.mapDisplayName ?? profileData?.address ?? profileData?.defaultJobLocation ?? "").trim();
    const lat = typeof profileData?.lat === "number" ? profileData.lat : null;
    const lng = typeof profileData?.lng === "number" ? profileData.lng : null;
    if (!addr && lat == null && lng == null) return;
    draft.autosavePatch({
      details: {
        ...details,
        address: addr || details.address,
        lat: lat ?? details.lat,
        lon: lng ?? details.lon,
        addressLine1: profileData?.address ?? details.addressLine1,
        city: profileData?.city ?? details.city,
        postalCode: profileData?.postalCode ?? details.postalCode,
        province: province || details.province,
        stateCode: province || details.stateCode,
        region: province || details.region,
        countryCode: profileData?.country ?? details.countryCode ?? "US",
      },
    });
  }, [addressSource, profileData, profileProvince, details.address, details.lat, details.lon, draft, details]);

  useEffect(() => {
    const province = String(profileProvince || details.province || "").trim().toUpperCase();
    if (!province || addressSource !== "new") return;
    if (
      String(details.province ?? "").trim().toUpperCase() === province &&
      String(details.stateCode ?? "").trim().toUpperCase() === province &&
      String(details.region ?? "").trim().toUpperCase() === province
    ) {
      return;
    }
    draft.autosavePatch({
      details: {
        ...details,
        province,
        stateCode: province,
        region: province,
      },
    });
  }, [profileProvince, addressSource, draft, details, details.province, details.stateCode, details.region]);

  const beginAppraisal = useCallback(async () => {
    setAppraising(true);
    try {
      const province = String(profileProvince || details.province || details.stateCode || details.region || "")
        .trim()
        .toUpperCase();
      const normalizedDetails = {
        ...details,
        province,
        stateCode: province || details.stateCode,
        region: province || details.region,
      };
      await draft.patchDraft({ dataPatch: { details: normalizedDetails } });
      await draft.appraise();
      await draft.patchDraft({ step: "PRICING" });
    } finally {
      setAppraising(false);
    }
  }, [details, draft, profileProvince]);

  return (
    <div className="space-y-4">
      <AppraisalModal open={appraising} />
      <h2 className="text-lg font-bold text-gray-900">Details</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <input
          type="text"
          value={titleValue}
          onChange={(e) => {
            const v = e.target.value;
            setTitleValue(v);
            setField("title", v);
          }}
          placeholder="Job title"
          className="border border-gray-300 rounded-lg px-3 py-2"
          aria-label="Job title"
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
          <div className="mt-2 space-y-3">
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

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Address (Address Line 1)</label>
              <input
                value={String(details.addressLine1 ?? "")}
                onChange={(e) => setField("addressLine1", e.target.value)}
                placeholder="Address line 1"
                className="border border-gray-300 rounded-lg px-3 py-2 w-full"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">City</label>
              <input
                value={String(details.city ?? "")}
                onChange={(e) => setField("city", e.target.value)}
                placeholder="City"
                className="border border-gray-300 rounded-lg px-3 py-2 w-full"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Postal Code</label>
              <input
                value={String(details.postalCode ?? "")}
                onChange={(e) => setField("postalCode", e.target.value)}
                placeholder="Postal code"
                className="border border-gray-300 rounded-lg px-3 py-2 w-full"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Province/State</label>
              <input
                value={String(profileProvince || details.province || "")}
                disabled
                className="border border-gray-300 rounded-lg px-3 py-2 w-full bg-gray-50 text-gray-700"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Map Location (OpenStreetMap)</label>
              <input
                value={String(details.address ?? "")}
                readOnly
                className="border border-gray-300 rounded-lg px-3 py-2 w-full bg-gray-50 text-gray-700"
              />
            </div>

            <input type="hidden" value={String(details.lat ?? "")} />
            <input type="hidden" value={String(details.lon ?? "")} />
          </div>
        )}
        {addressSource === "profile" ? (
          <div className="mt-2">
            <label className="block text-sm font-medium text-gray-700 mb-1">Map Location (OpenStreetMap)</label>
            <input
              value={String(details.address ?? "")}
              readOnly
              className="border border-gray-300 rounded-lg px-3 py-2 w-full bg-gray-50 text-gray-700"
            />
          </div>
        ) : null}
      </div>
      <textarea
        value={String(details.description ?? "")}
        onChange={(e) => setField("description", e.target.value)}
        placeholder="Describe the work needed"
        className="w-full border border-gray-300 rounded-lg px-3 py-2 min-h-32"
      />

      <PhotoUpload urls={photos} onChange={setPhotos} />

      <div className="pt-2">
        <button
          onClick={() => void beginAppraisal()}
          className="bg-8fold-green hover:bg-8fold-green-dark text-white font-semibold px-4 py-2 rounded-lg"
          disabled={appraising}
        >
          Begin Appraisal
        </button>
      </div>
    </div>
  );
}
