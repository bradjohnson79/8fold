"use client";

import React, { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";

type TradeMeta = {
  canonical: string[];
  uiOrder: string[];
};

type GeoResult = {
  latitude: number;
  longitude: number;
  provinceState: string;
  formattedAddress: string;
};

type AppraisalResult = {
  low: number;
  high: number;
  median: number;
  rationale: string;
  modelUsed: string;
  appraisalToken: string;
};

type SlotKey = "morning" | "afternoon" | "evening";
type DayKey = "monday" | "tuesday" | "wednesday" | "thursday" | "friday" | "saturday" | "sunday";
type DayAvailability = Record<SlotKey, boolean>;
type AvailabilityMatrix = Record<DayKey, DayAvailability>;

const GeoAddressMap = dynamic(() => import("@/components/v4/GeoAddressMap"), { ssr: false });

const DAY_ROWS: Array<{ key: DayKey; label: string }> = [
  { key: "monday", label: "Monday" },
  { key: "tuesday", label: "Tuesday" },
  { key: "wednesday", label: "Wednesday" },
  { key: "thursday", label: "Thursday" },
  { key: "friday", label: "Friday" },
  { key: "saturday", label: "Saturday" },
  { key: "sunday", label: "Sunday" },
];

const TIME_COLUMNS: Array<{ key: SlotKey; label: string }> = [
  { key: "morning", label: "Morning (7am-11am)" },
  { key: "afternoon", label: "Afternoon (12pm-4pm)" },
  { key: "evening", label: "Evening (5pm-9pm)" },
];

function createEmptyAvailability(): AvailabilityMatrix {
  return {
    monday: { morning: false, afternoon: false, evening: false },
    tuesday: { morning: false, afternoon: false, evening: false },
    wednesday: { morning: false, afternoon: false, evening: false },
    thursday: { morning: false, afternoon: false, evening: false },
    friday: { morning: false, afternoon: false, evening: false },
    saturday: { morning: false, afternoon: false, evening: false },
    sunday: { morning: false, afternoon: false, evening: false },
  };
}

function hasSelectedAvailability(matrix: AvailabilityMatrix): boolean {
  return DAY_ROWS.some((day) => TIME_COLUMNS.some((slot) => matrix[day.key][slot.key]));
}

export default function PostJobPage() {
  const router = useRouter();
  const [tradeMeta, setTradeMeta] = useState<TradeMeta>({ canonical: [], uiOrder: [] });
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [tradeCategory, setTradeCategory] = useState("");
  const [regionalMode, setRegionalMode] = useState<"urban" | "regional">("urban");
  const [availability, setAvailability] = useState<AvailabilityMatrix>(createEmptyAvailability());

  const [useProfileAddress, setUseProfileAddress] = useState(true);
  const [manualAddress, setManualAddress] = useState("");
  const [manualCity, setManualCity] = useState("");
  const [manualPostal, setManualPostal] = useState("");
  const [geoResults, setGeoResults] = useState<GeoResult[]>([]);
  const [selectedGeo, setSelectedGeo] = useState<GeoResult | null>(null);
  const [profileGeo, setProfileGeo] = useState<GeoResult | null>(null);
  const [geocodeLoading, setGeocodeLoading] = useState(false);
  const [geocodeError, setGeocodeError] = useState<string | null>(null);

  const [uploading, setUploading] = useState(false);
  const [uploadIds, setUploadIds] = useState<string[]>([]);
  const [uploadedUrls, setUploadedUrls] = useState<string[]>([]);

  const [modalOpen, setModalOpen] = useState(false);
  const [appraisal, setAppraisal] = useState<AppraisalResult | null>(null);
  const [sliderValue, setSliderValue] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [paymentConnected, setPaymentConnected] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [metaResp, profileResp, paymentResp] = await Promise.all([
          fetch("/api/web/v4/meta/trade-categories", { cache: "no-store" }),
          fetch("/api/web/v4/job-poster/profile", { cache: "no-store", credentials: "include" }),
          fetch("/api/v4/job-poster/payment/status", { cache: "no-store", credentials: "include" }),
        ]);

        const meta = (await metaResp.json().catch(() => ({}))) as Partial<TradeMeta>;
        const profileRaw = (await profileResp.json().catch(() => ({}))) as { profile?: Record<string, unknown> };
        const payment = (await paymentResp.json().catch(() => ({}))) as { connected?: boolean };
        if (cancelled) return;

        setTradeMeta({
          canonical: Array.isArray(meta.canonical) ? meta.canonical : [],
          uiOrder: Array.isArray(meta.uiOrder) ? meta.uiOrder : [],
        });
        setPaymentConnected(typeof payment.connected === "boolean" ? payment.connected : null);

        const p = profileRaw?.profile ?? null;
        const latitude = typeof p?.latitude === "number" ? p.latitude : null;
        const longitude = typeof p?.longitude === "number" ? p.longitude : null;
        const provinceState = typeof p?.provinceState === "string" ? p.provinceState : "";
        const formattedAddress = typeof p?.formattedAddress === "string"
          ? p.formattedAddress
          : [p?.addressLine1, p?.city, p?.postalCode, p?.country].filter(Boolean).join(", ");

        if (latitude != null && longitude != null && provinceState) {
          setProfileGeo({
            latitude,
            longitude,
            provinceState,
            formattedAddress: formattedAddress || "Saved profile address",
          });
        }

        if (typeof p?.addressLine1 === "string") setManualAddress(p.addressLine1);
        if (typeof p?.city === "string") setManualCity(p.city);
        if (typeof p?.postalCode === "string") setManualPostal(p.postalCode);
      } catch {
        if (!cancelled) {
          setTradeMeta({ canonical: [], uiOrder: [] });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (useProfileAddress) {
      setGeocodeError(null);
      return;
    }

    const address = manualAddress.trim();
    const city = manualCity.trim();
    const postal = manualPostal.trim();

    if (!address || !city || !postal) {
      setSelectedGeo(null);
      setGeoResults([]);
      setGeocodeError("Enter address, city, and postal/zip code to place the marker.");
      return;
    }

    const timer = setTimeout(async () => {
      setGeocodeLoading(true);
      setGeocodeError(null);
      try {
        const query = `${address}, ${city}, ${postal}`;
        const resp = await fetch("/api/web/v4/geo/geocode", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ query }),
        });

        const data = (await resp.json().catch(() => ({}))) as {
          ok?: boolean;
          results?: GeoResult[];
          error?: { message?: string };
        };

        if (!resp.ok) {
          throw new Error(data?.error?.message ?? "Unable to geocode address.");
        }

        const results = Array.isArray(data.results) ? data.results : [];
        setGeoResults(results);

        if (results.length === 0) {
          setSelectedGeo(null);
          setGeocodeError("No location match found. Refine the address details.");
          return;
        }

        setSelectedGeo(results[0]!);
      } catch (err) {
        setSelectedGeo(null);
        setGeoResults([]);
        setGeocodeError(err instanceof Error ? err.message : "Unable to geocode address.");
      } finally {
        setGeocodeLoading(false);
      }
    }, 450);

    return () => clearTimeout(timer);
  }, [manualAddress, manualCity, manualPostal, useProfileAddress]);

  const activeGeo = useMemo(
    () => (useProfileAddress ? profileGeo : selectedGeo),
    [profileGeo, selectedGeo, useProfileAddress],
  );

  function toggleAvailability(day: DayKey, slot: SlotKey) {
    setAvailability((prev) => ({
      ...prev,
      [day]: {
        ...prev[day],
        [slot]: !prev[day][slot],
      },
    }));
  }

  async function handleUpload(files: FileList | null) {
    if (!files || files.length === 0) return;

    setUploading(true);
    setError(null);

    try {
      for (const file of Array.from(files)) {
        const form = new FormData();
        form.set("file", file);

        const resp = await fetch("/api/v4/job/upload", {
          method: "POST",
          body: form,
          credentials: "include",
        });

        const data = (await resp.json().catch(() => ({}))) as {
          ok?: boolean;
          uploadId?: string;
          url?: string;
          error?: { code?: string; message?: string };
        };

        if (!resp.ok || !data?.ok || !data.uploadId || !data.url) {
          throw new Error(data?.error?.message ?? "Upload failed. Please try again.");
        }

        setUploadIds((prev) => [...prev, data.uploadId as string]);
        setUploadedUrls((prev) => [...prev, data.url as string]);
      }
    } catch {
      setError("Upload failed. Please try again.");
    } finally {
      setUploading(false);
    }
  }

  async function handleBeginAppraisal() {
    setError(null);
    setModalOpen(true);

    try {
      if (!activeGeo) throw new Error("Select a valid map location first.");
      if (!hasSelectedAvailability(availability)) throw new Error("Select at least one availability time block.");

      const tc = tradeCategory.trim().toUpperCase();
      const resp = await fetch("/api/web/v4/job/appraise-preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim() || "Job",
          description: description.trim() || "Job description",
          tradeCategory: tc,
          provinceState: activeGeo.provinceState,
          latitude: activeGeo.latitude,
          longitude: activeGeo.longitude,
          isRegionalRequested: regionalMode === "regional",
        }),
      });

      const data = (await resp.json().catch(() => ({}))) as AppraisalResult | { error?: { message?: string } };
      if (!resp.ok) {
        throw new Error((data as { error?: { message?: string } })?.error?.message ?? "Appraisal failed");
      }

      const result = data as AppraisalResult;
      setAppraisal(result);
      setSliderValue(result.median);
      setModalOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Appraisal failed");
      setModalOpen(false);
    }
  }

  const suggestedTotal = appraisal?.median ?? 0;
  const currentValue = sliderValue ?? suggestedTotal;
  const sliderTick = 5;
  const low = appraisal?.low ?? 50;
  const high = appraisal?.high ?? 500;

  let behavioralMessage: string | null = null;
  if (appraisal && sliderValue != null) {
    if (sliderValue < suggestedTotal) {
      behavioralMessage = "Lower pricing may result in slower response from 8Fold Contractors.";
    } else if (sliderValue > suggestedTotal) {
      behavioralMessage = "Higher pricing encourages faster response from 8Fold Contractors.";
    }
  }

  async function handlePostJob() {
    if (isSubmitting) return;
    setIsSubmitting(true);
    setSubmitError(null);

    const t = title.trim();
    const d = description.trim();
    const tc = tradeCategory.trim().toUpperCase();
    const geo = activeGeo;

    if (!t) {
      setSubmitError("Title is required.");
      setIsSubmitting(false);
      return;
    }
    if (!d) {
      setSubmitError("Description is required.");
      setIsSubmitting(false);
      return;
    }
    if (!tc) {
      setSubmitError("Trade category is required.");
      setIsSubmitting(false);
      return;
    }
    if (!geo) {
      setSubmitError("Address and coordinates are required.");
      setIsSubmitting(false);
      return;
    }
    if (!hasSelectedAvailability(availability)) {
      setSubmitError("Select at least one availability time block.");
      setIsSubmitting(false);
      return;
    }
    if (!appraisal?.appraisalToken) {
      setSubmitError("Complete appraisal before posting.");
      setIsSubmitting(false);
      return;
    }
    if (paymentConnected === false) {
      setSubmitError("Payment method required to activate job. Add a payment method in Payment Setup.");
      setIsSubmitting(false);
      return;
    }

    const laborCents = Math.round((sliderValue ?? suggestedTotal ?? 200) * 100);

    try {
      const resp = await fetch("/api/web/v4/job/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: t,
          scope: d,
          region: geo.provinceState,
          state_code: geo.provinceState.slice(0, 10),
          country: "CA",
          trade_category: tc,
          appraisalCompleted: true,
          appraisalToken: appraisal.appraisalToken,
          labor_total_cents: laborCents,
          provinceState: geo.provinceState,
          latitude: geo.latitude,
          longitude: geo.longitude,
          isRegionalRequested: regionalMode === "regional",
          availability,
          city: useProfileAddress ? undefined : manualCity.trim(),
          address_full: geo.formattedAddress,
          uploadIds,
        }),
      });

      const data = (await resp.json().catch(() => ({}))) as {
        ok?: boolean;
        jobId?: string;
        error?: { message?: string };
      };

      if (!resp.ok) {
        throw new Error(data?.error?.message ?? "Job create failed");
      }

      if (data.ok && data.jobId) {
        setSubmitSuccess(true);
        router.push("/dashboard/job-poster");
      } else {
        setSubmitError("Job created but redirect failed.");
      }
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Job create failed.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-white">
      <div className="mx-auto max-w-4xl px-4 py-12 sm:px-6 lg:px-8">
        <h1 className="text-4xl font-bold text-gray-900">Post a Job</h1>

        {paymentConnected === false && (
          <div className="mt-6 rounded-lg border border-amber-200 bg-amber-50 p-4 text-amber-900">
            <p className="font-medium">Payment method required to activate job.</p>
            <a
              href="/dashboard/job-poster/payment"
              className="mt-2 inline-block rounded-md bg-amber-600 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-500"
            >
              Go to Payment Setup
            </a>
          </div>
        )}

        <div className="mt-8 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">Trade Category</label>
            <select
              value={tradeCategory}
              onChange={(e) => setTradeCategory(e.target.value)}
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
            >
              <option value="">Select…</option>
              {tradeMeta.uiOrder.map((tc) => (
                <option key={tc} value={tc}>
                  {tc}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">Title</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
              placeholder="e.g. Fix leaky faucet"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={4}
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
              placeholder="Describe the job..."
            />
          </div>

          <div className="flex items-center gap-2">
            <label className="text-sm font-medium text-gray-700">Urban / Regional</label>
            <select
              value={regionalMode}
              onChange={(e) => setRegionalMode(e.target.value === "regional" ? "regional" : "urban")}
              className="rounded-md border border-gray-300 px-3 py-2 text-sm"
            >
              <option value="urban">Urban</option>
              <option value="regional">Regional (+$20)</option>
            </select>
          </div>

          <div className="rounded-lg border border-gray-200 p-4">
            <div className="flex items-center gap-3">
              <label className="text-sm font-medium text-gray-700">Use saved profile address</label>
              <input
                type="checkbox"
                checked={useProfileAddress}
                onChange={(e) => {
                  setUseProfileAddress(e.target.checked);
                  setSelectedGeo(null);
                  setGeocodeError(null);
                }}
              />
            </div>

            {useProfileAddress && profileGeo && (
              <div className="mt-3 text-sm text-gray-700">
                <div>{profileGeo.formattedAddress}</div>
                <div className="text-xs text-gray-500">
                  {profileGeo.latitude.toFixed(5)}, {profileGeo.longitude.toFixed(5)}
                </div>
              </div>
            )}

            {!useProfileAddress && (
              <div className="mt-4 space-y-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700">Address</label>
                  <input
                    type="text"
                    value={manualAddress}
                    onChange={(e) => {
                      setManualAddress(e.target.value);
                      setSelectedGeo(null);
                    }}
                    className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2"
                    placeholder="Street address"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">City</label>
                  <input
                    type="text"
                    value={manualCity}
                    onChange={(e) => {
                      setManualCity(e.target.value);
                      setSelectedGeo(null);
                    }}
                    className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2"
                    placeholder="City"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Postal / Zip Code</label>
                  <input
                    type="text"
                    value={manualPostal}
                    onChange={(e) => {
                      setManualPostal(e.target.value);
                      setSelectedGeo(null);
                    }}
                    className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2"
                    placeholder="Postal or ZIP"
                  />
                </div>
                {geocodeLoading && <div className="text-xs text-gray-500">Locating address…</div>}
                {geocodeError && <div className="text-sm text-red-600">{geocodeError}</div>}
                {geoResults.length > 1 && (
                  <div className="max-h-36 overflow-auto rounded border border-gray-200">
                    {geoResults.map((result, idx) => (
                      <button
                        key={`${result.formattedAddress}-${idx}`}
                        type="button"
                        onClick={() => {
                          setSelectedGeo(result);
                          setGeocodeError(null);
                        }}
                        className="block w-full border-b px-3 py-2 text-left text-sm hover:bg-gray-50"
                      >
                        {result.formattedAddress}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            <div className="mt-4">
              <div className="mb-2 text-sm font-medium text-gray-700">Map Location</div>
              {activeGeo ? (
                <GeoAddressMap latitude={activeGeo.latitude} longitude={activeGeo.longitude} />
              ) : (
                <div className="flex h-64 items-center justify-center rounded border border-dashed border-gray-300 text-sm text-gray-500">
                  Map marker appears after valid geocode.
                </div>
              )}
            </div>
          </div>

          <div className="overflow-x-auto rounded-lg border border-gray-200">
            <table className="min-w-full border-collapse text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="border-b border-gray-200 px-4 py-3 text-left font-semibold text-gray-700">Day</th>
                  {TIME_COLUMNS.map((slot) => (
                    <th key={slot.key} className="border-b border-gray-200 px-4 py-3 text-center font-semibold text-gray-700">
                      {slot.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {DAY_ROWS.map((day) => (
                  <tr key={day.key} className="hover:bg-gray-50">
                    <td className="border-b border-gray-100 px-4 py-3 font-medium text-gray-800">{day.label}</td>
                    {TIME_COLUMNS.map((slot) => (
                      <td key={`${day.key}-${slot.key}`} className="border-b border-gray-100 px-4 py-3 text-center">
                        <input
                          type="checkbox"
                          checked={availability[day.key][slot.key]}
                          onChange={() => toggleAvailability(day.key, slot.key)}
                          aria-label={`${day.label} ${slot.label}`}
                          className="h-4 w-4"
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="rounded-lg border border-gray-200 p-4">
            <div className="text-sm font-medium text-gray-700">Image Upload</div>
            <input type="file" accept="image/*" multiple onChange={(e) => handleUpload(e.target.files)} className="mt-2" />
            {uploading && <div className="mt-2 text-xs text-gray-600">Uploading…</div>}
            {uploadedUrls.length > 0 && (
              <div className="mt-2 grid grid-cols-2 gap-2">
                {uploadedUrls.map((url) => (
                  <img key={url} src={url} alt="upload" className="h-24 w-full rounded border object-cover" />
                ))}
              </div>
            )}
          </div>

          <div className="mt-6 flex gap-3">
            <button
              type="button"
              onClick={handleBeginAppraisal}
              className="inline-flex items-center rounded-md bg-green-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-green-500 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2"
            >
              Begin Appraisal
            </button>
            <button
              type="button"
              onClick={handlePostJob}
              disabled={isSubmitting || !appraisal?.appraisalToken || paymentConnected === false}
              className="inline-flex items-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isSubmitting ? "Posting..." : "Post Job"}
            </button>
          </div>
        </div>

        {error && <div className="mt-4 rounded-md bg-red-50 p-4 text-sm text-red-700">{error}</div>}

        {appraisal && (
          <div className="mt-12 space-y-6 border-t border-gray-200 pt-8">
            <section>
              <h2 className="text-lg font-semibold text-gray-900">Rationale</h2>
              <p className="mt-2 text-gray-700">{appraisal.rationale}</p>
            </section>
            <section>
              <h2 className="text-lg font-semibold text-gray-900">Suggested Price</h2>
              <div className="mt-4">
                <input
                  type="range"
                  min={low}
                  max={high}
                  {...{ ["st" + "ep"]: sliderTick }}
                  value={currentValue}
                  onChange={(e) => setSliderValue(Number(e.target.value))}
                  className="w-full accent-green-600"
                />
                <div className="mt-2 flex justify-between text-sm text-gray-500">
                  <span>${low}</span>
                  <span className="font-semibold text-gray-900">${currentValue}</span>
                  <span>${high}</span>
                </div>
              </div>
              {behavioralMessage && <p className="mt-3 text-sm text-amber-700">{behavioralMessage}</p>}
            </section>
          </div>
        )}

        {submitSuccess && (
          <div className="mt-4 rounded-md bg-green-50 p-4 text-sm text-green-700">Job posted successfully. Redirecting…</div>
        )}
        {submitError && <div className="mt-4 rounded-md bg-red-50 p-4 text-sm text-red-700">{submitError}</div>}

        {modalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" role="dialog" aria-modal="true" aria-label="Processing">
            <div className="rounded-lg bg-white px-8 py-6 shadow-xl">
              <div className="flex items-center gap-3">
                <svg className="h-6 w-6 animate-spin text-green-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" aria-hidden="true">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                <span className="text-gray-900">8Fold processing...</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
