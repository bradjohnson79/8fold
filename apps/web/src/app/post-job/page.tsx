"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { GeoSearchMap, type GeoResult } from "@/components/maps/GeoSearchMap";

type TradeMeta = {
  canonical: string[];
  uiOrder: string[];
};

type AppraisalResult = {
  low: number;
  high: number;
  median: number;
  rationale: string;
  modelUsed: string;
  appraisalToken: string;
};

export default function PostJobPage() {
  const router = useRouter();
  const [tradeMeta, setTradeMeta] = useState<TradeMeta>({ canonical: [], uiOrder: [] });
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [tradeCategory, setTradeCategory] = useState("");
  const [regionalMode, setRegionalMode] = useState<"urban" | "regional">("urban");
  const [availability, setAvailability] = useState<string[]>([]);
  const [useProfileAddress, setUseProfileAddress] = useState(true);
  const [selectedGeo, setSelectedGeo] = useState<GeoResult | null>(null);
  const [profileGeo, setProfileGeo] = useState<GeoResult | null>(null);
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
          fetch("/api/v4/meta/trade-categories", { cache: "no-store" }),
          fetch("/api/v4/job-poster/profile", { cache: "no-store", credentials: "include" }),
          fetch("/api/v4/job-poster/payment/status", { cache: "no-store", credentials: "include" }),
        ]);
        const meta = (await metaResp.json().catch(() => ({}))) as Partial<TradeMeta>;
        const profile = (await profileResp.json().catch(() => ({}))) as { profile?: Partial<GeoResult> };
        const payment = (await paymentResp.json().catch(() => ({}))) as { connected?: boolean };
        if (cancelled) return;
        setTradeMeta({
          canonical: Array.isArray(meta.canonical) ? meta.canonical : [],
          uiOrder: Array.isArray(meta.uiOrder) ? meta.uiOrder : [],
        });
        setPaymentConnected(typeof payment.connected === "boolean" ? payment.connected : null);
        const p = profile?.profile;
        if (
          p &&
          typeof p.latitude === "number" &&
          typeof p.longitude === "number" &&
          typeof p.provinceState === "string" &&
          typeof p.formattedAddress === "string"
        ) {
          setProfileGeo({
            latitude: p.latitude,
            longitude: p.longitude,
            provinceState: p.provinceState,
            formattedAddress: p.formattedAddress,
            displayName: p.formattedAddress,
            countryCode: "",
            regionCode: p.provinceState,
            city: "",
            postalCode: "",
            placeId: "",
          });
        }
      } catch {}
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const activeGeo = useMemo(() => (useProfileAddress ? profileGeo : selectedGeo), [profileGeo, selectedGeo, useProfileAddress]);

  function toggleAvailability(slot: string) {
    setAvailability((prev) => (prev.includes(slot) ? prev.filter((s) => s !== slot) : [...prev, slot]));
  }

  async function handleUpload(files: FileList | null) {
    if (!files || files.length === 0) return;
    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        const form = new FormData();
        form.set("file", file);
        const resp = await fetch("/api/web/v4/job/upload", { method: "POST", body: form });
        const data = (await resp.json().catch(() => ({}))) as { uploadId?: string; url?: string; error?: string };
        if (!resp.ok || !data.uploadId || !data.url) {
          throw new Error(data.error ?? "Upload failed");
        }
        setUploadIds((prev) => [...prev, data.uploadId!]);
        setUploadedUrls((prev) => [...prev, data.url!]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  async function handleBeginAppraisal() {
    setError(null);
    setModalOpen(true);
    try {
      if (!activeGeo) throw new Error("Select a valid address first.");
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
      const data = (await resp.json()) as AppraisalResult | { error?: string };
      if (!resp.ok) {
        throw new Error((data as { error?: string }).error ?? "Appraisal failed");
      }
      const result = data as AppraisalResult;
      setAppraisal(result);
      setSliderValue(result.median);
      setModalOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Appraisal failed");
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
      behavioralMessage =
        "Lower pricing may result in slower response from 8Fold Contractors.";
    } else if (sliderValue > suggestedTotal) {
      behavioralMessage =
        "Higher pricing encourages faster response from 8Fold Contractors.";
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
      setSubmitError("Address selection is required.");
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
          country: "US",
          trade_category: tc,
          appraisalCompleted: true,
          appraisalToken: appraisal.appraisalToken,
          labor_total_cents: laborCents,
          provinceState: geo.provinceState,
          latitude: geo.latitude,
          longitude: geo.longitude,
          isRegionalRequested: regionalMode === "regional",
          availability,
          address_full: geo.formattedAddress,
          uploadIds,
        }),
      });
      const data = (await resp.json()) as { ok?: boolean; jobId?: string; error?: string };
      if (!resp.ok) {
        throw new Error(data.error ?? "Job create failed");
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
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <h1 className="text-4xl font-bold text-gray-900">Post a Job (v4 Portal)</h1>
        <p className="text-gray-600 mt-3">Stateless Intake Version</p>

        {paymentConnected === false && (
          <div className="mt-6 p-4 rounded-lg bg-amber-50 border border-amber-200 text-amber-900">
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
                }}
              />
            </div>
            {!useProfileAddress && (
              <>
                <GeoSearchMap
                  initialQuery={selectedGeo?.formattedAddress ?? ""}
                  onSelect={(result) => {
                    setSelectedGeo(result);
                  }}
                />
              </>
            )}
            {activeGeo && (
              <div className="mt-3 text-xs text-gray-600">
                <div>{activeGeo.formattedAddress}</div>
                <div>
                  {activeGeo.latitude.toFixed(5)}, {activeGeo.longitude.toFixed(5)}
                </div>
              </div>
            )}
            {!useProfileAddress && selectedGeo && (
              <button
                type="button"
                onClick={async () => {
                  const parts = selectedGeo.formattedAddress.split(",").map((p) => p.trim());
                  await fetch("/api/web/v4/job-poster/profile", {
                    method: "PUT",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      addressLine1: parts[0] ?? selectedGeo.formattedAddress,
                      addressLine2: "",
                      city: parts[1] ?? "Unknown",
                      provinceState: selectedGeo.provinceState,
                      postalCode: parts[2] ?? "N/A",
                      country: "US",
                      formattedAddress: selectedGeo.formattedAddress,
                      latitude: selectedGeo.latitude,
                      longitude: selectedGeo.longitude,
                    }),
                  });
                  setProfileGeo(selectedGeo);
                }}
                className="mt-2 rounded border border-gray-300 px-3 py-1 text-sm"
              >
                Save as profile address
              </button>
            )}
          </div>
          <div className="rounded-lg border border-gray-200 p-4">
            <div className="text-sm font-medium text-gray-700">Availability</div>
            <div className="mt-2 flex flex-wrap gap-2">
              {["Mon AM", "Mon PM", "Tue AM", "Tue PM", "Wed AM", "Wed PM", "Thu AM", "Thu PM", "Fri AM", "Fri PM"].map((slot) => (
                <label key={slot} className="inline-flex items-center gap-2 rounded border px-2 py-1 text-xs">
                  <input type="checkbox" checked={availability.includes(slot)} onChange={() => toggleAvailability(slot)} />
                  {slot}
                </label>
              ))}
            </div>
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
              className="inline-flex items-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSubmitting ? "Posting..." : "Post Job"}
            </button>
          </div>
        </div>

        {error && (
          <div className="mt-4 rounded-md bg-red-50 p-4 text-sm text-red-700">
            {error}
          </div>
        )}

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
              {behavioralMessage && (
                <p className="mt-3 text-sm text-amber-700">{behavioralMessage}</p>
              )}
            </section>
          </div>
        )}

        {submitSuccess && (
          <div className="mt-4 rounded-md bg-green-50 p-4 text-sm text-green-700">
            Job posted successfully. Redirecting…
          </div>
        )}
        {submitError && (
          <div className="mt-4 rounded-md bg-red-50 p-4 text-sm text-red-700">{submitError}</div>
        )}

        {modalOpen && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
            role="dialog"
            aria-modal="true"
            aria-label="Processing"
          >
            <div className="rounded-lg bg-white px-8 py-6 shadow-xl">
              <div className="flex items-center gap-3">
                <svg
                  className="h-6 w-6 animate-spin text-green-600"
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  />
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
