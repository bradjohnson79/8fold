"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { loadStripe } from "@stripe/stripe-js";
import { Elements, PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";
import { GoogleAddressAutocomplete } from "@/components/GoogleAddressAutocomplete";

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

type PaymentIntentResult = {
  success: boolean;
  clientSecret?: string | null;
  paymentIntentId: string;
  paymentStatus?: string;
  appraisalPriceCents: number;
  regionalFeeCents: number;
  taxRateBps?: number;
  taxCents: number;
  totalCents: number;
  currency: "USD" | "CAD";
  message?: string;
};

type PricingPreviewResult = {
  success: boolean;
  appraisalSubtotalCents: number;
  regionalFeeCents: number;
  splitBaseCents: number;
  taxRateBps: number;
  taxCents: number;
  totalCents: number;
  country: "US" | "CA";
  province: string | null;
  currency: "USD" | "CAD";
  paymentCurrency: "usd" | "cad";
  message?: string;
};

type AvailabilityJson = Record<string, { morning: boolean; afternoon: boolean; evening: boolean }>;

type UploadedImage = {
  uploadId: string;
  url: string;
};

const DAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"] as const;

function emptyAvailability(): AvailabilityJson {
  return DAYS.reduce((acc, day) => {
    acc[day] = { morning: false, afternoon: false, evening: false };
    return acc;
  }, {} as AvailabilityJson);
}

function hasAvailabilitySelection(value: AvailabilityJson): boolean {
  return Object.values(value).some((v) => v.morning || v.afternoon || v.evening);
}

function formatMoney(cents: number, currency: "USD" | "CAD") {
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(cents / 100);
}

function PaymentConfirm(props: {
  onConfirmed: () => void;
  onError: (message: string) => void;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [submitting, setSubmitting] = useState(false);

  return (
    <div className="space-y-3">
      <PaymentElement />
      <button
        type="button"
        disabled={!stripe || !elements || submitting}
        onClick={() => {
          void (async () => {
            setSubmitting(true);
            try {
              const result = await stripe!.confirmPayment({
                elements: elements!,
                redirect: "if_required",
              });
              if (result.error) throw new Error(result.error.message || "Payment confirmation failed.");
              const status = String(result.paymentIntent?.status ?? "").toLowerCase();
              if (status !== "succeeded") {
                throw new Error(`Payment charge not completed. Current Stripe status: ${status || "unknown"}.`);
              }
              props.onConfirmed();
            } catch (e) {
              props.onError(e instanceof Error ? e.message : "Payment confirmation failed.");
            } finally {
              setSubmitting(false);
            }
          })();
        }}
        className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {submitting ? "Confirming..." : "Confirm Payment"}
      </button>
    </div>
  );
}

export default function PostJobPage() {
  const router = useRouter();

  const [tradeMeta, setTradeMeta] = useState<TradeMeta>({ canonical: [], uiOrder: [] });
  const [loading, setLoading] = useState(true);

  const [tradeCategory, setTradeCategory] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");

  const [urbanOrRegional, setUrbanOrRegional] = useState<"urban" | "regional">("urban");

  const [useSavedAddress, setUseSavedAddress] = useState(true);
  const [savedAddress, setSavedAddress] = useState({
    address: "",
    city: "",
    postalCode: "",
    region: "",
    country: "US" as "US" | "CA",
    lat: null as number | null,
    lon: null as number | null,
  });
  const [address, setAddress] = useState("");
  const [city, setCity] = useState("");
  const [postalCode, setPostalCode] = useState("");
  const [region, setRegion] = useState("");
  const [country, setCountry] = useState<"US" | "CA">("US");
  const [lat, setLat] = useState<number | null>(null);
  const [lon, setLon] = useState<number | null>(null);
  const [mapQuery, setMapQuery] = useState("");

  const [availability, setAvailability] = useState<AvailabilityJson>(emptyAvailability());

  const [uploading, setUploading] = useState(false);
  const [images, setImages] = useState<UploadedImage[]>([]);

  const [appraisal, setAppraisal] = useState<AppraisalResult | null>(null);
  const [appraisalPrice, setAppraisalPrice] = useState(0);

  const [paymentConnected, setPaymentConnected] = useState<boolean | null>(null);
  const [paymentSummary, setPaymentSummary] = useState<PaymentIntentResult | null>(null);
  const [pricingPreview, setPricingPreview] = useState<PricingPreviewResult | null>(null);
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [paymentIntentId, setPaymentIntentId] = useState<string | null>(null);
  const [paymentConfirmed, setPaymentConfirmed] = useState(false);
  const [paymentCompleteMessage, setPaymentCompleteMessage] = useState<string | null>(null);

  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const stripePromise = useMemo(() => {
    const pk = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
    return pk ? loadStripe(pk) : null;
  }, []);

  const activeAddress = useMemo(() => {
    if (useSavedAddress) {
      return savedAddress;
    }
    return {
      address,
      city,
      postalCode,
      region,
      country,
      lat,
      lon,
    };
  }, [useSavedAddress, savedAddress, address, city, postalCode, region, country, lat, lon]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const [metaResp, profileResp, paymentResp, draftResp] = await Promise.all([
          fetch("/api/v4/meta/trade-categories", { cache: "no-store" }),
          fetch("/api/v4/job-poster/profile", { cache: "no-store", credentials: "include" }),
          fetch("/api/v4/job-poster/payment/status", { cache: "no-store", credentials: "include" }),
          fetch("/api/job-draft", { cache: "no-store", credentials: "include" }),
        ]);

        const metaJson = (await metaResp.json().catch(() => ({}))) as Partial<TradeMeta>;
        const profileJson = (await profileResp.json().catch(() => ({}))) as any;
        const paymentJson = (await paymentResp.json().catch(() => ({}))) as { connected?: boolean };
        const draftJson = (await draftResp.json().catch(() => ({}))) as any;

        if (cancelled) return;

        setTradeMeta({
          canonical: Array.isArray(metaJson.canonical) ? metaJson.canonical : [],
          uiOrder: Array.isArray(metaJson.uiOrder) ? metaJson.uiOrder : [],
        });
        setPaymentConnected(typeof paymentJson.connected === "boolean" ? paymentJson.connected : null);

        const profile = profileJson?.profile ?? null;
        if (profile && typeof profile.latitude === "number" && typeof profile.longitude === "number") {
          setSavedAddress({
            address: String(profile.formattedAddress ?? profile.addressLine1 ?? "").trim(),
            city: String(profile.city ?? "").trim(),
            postalCode: String(profile.postalCode ?? "").trim(),
            region: String(profile.provinceState ?? "").trim(),
            country: String(profile.country ?? "US").toUpperCase() === "CA" ? "CA" : "US",
            lat: Number(profile.latitude),
            lon: Number(profile.longitude),
          });
        }

        const draftData = draftJson?.draft?.data ?? null;
        if (draftData && typeof draftData === "object") {
          const details = (draftData.details ?? {}) as Record<string, any>;
          const nextTrade = String(details.tradeCategory ?? "").trim();
          if (nextTrade) setTradeCategory(nextTrade);
          if (String(details.title ?? "")) setTitle(String(details.title));
          if (String(details.description ?? "")) setDescription(String(details.description));
          const isRegional = Boolean(details.isRegional);
          setUrbanOrRegional(isRegional ? "regional" : "urban");

          setAddress(String(details.address ?? ""));
          setCity(String(details.city ?? ""));
          setPostalCode(String(details.postalCode ?? ""));
          setRegion(String(details.stateCode ?? details.region ?? ""));
          setCountry(String(details.countryCode ?? "US").toUpperCase() === "CA" ? "CA" : "US");

          const dLat = Number(details.lat);
          const dLon = Number(details.lon);
          setLat(Number.isFinite(dLat) ? dLat : null);
          setLon(Number.isFinite(dLon) ? dLon : null);

          if (draftData.availability && typeof draftData.availability === "object") {
            setAvailability(draftData.availability as AvailabilityJson);
          }

          const draftImages = Array.isArray(draftData.images) ? draftData.images : [];
          setImages(
            draftImages
              .map((img: any) => ({
                uploadId: String(img?.uploadId ?? "").trim(),
                url: String(img?.url ?? "").trim(),
              }))
              .filter((img: UploadedImage) => img.uploadId && img.url),
          );

          const draftAppraisal = draftData.appraisal as AppraisalResult | undefined;
          if (draftAppraisal?.appraisalToken) {
            setAppraisal(draftAppraisal);
            setAppraisalPrice(Number(draftData?.pricing?.appraisalPriceCents ?? draftAppraisal.median * 100));
          }
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  function updateAvailability(day: string, block: "morning" | "afternoon" | "evening") {
    setAvailability((prev) => ({
      ...prev,
      [day]: {
        ...(prev[day] ?? { morning: false, afternoon: false, evening: false }),
        [block]: !(prev[day]?.[block] ?? false),
      },
    }));
  }

  async function uploadFiles(files: FileList | null) {
    if (!files?.length) return;
    setError(null);
    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        const form = new FormData();
        form.set("file", file);
        const resp = await fetch("/api/web/v4/job/upload", { method: "POST", body: form });
        const json = (await resp.json().catch(() => ({}))) as { uploadId?: string; url?: string; message?: string; error?: string };
        if (!resp.ok || !json.uploadId || !json.url) {
          throw new Error(json.message ?? json.error ?? "Image upload failed.");
        }
        setImages((prev) => [...prev, { uploadId: json.uploadId!, url: json.url! }]);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Image upload failed.");
    } finally {
      setUploading(false);
    }
  }

  function removeImage(uploadId: string) {
    setImages((prev) => prev.filter((img) => img.uploadId !== uploadId));
  }

  async function persistDraft(step: "DETAILS" | "PRICING" | "PAYMENT") {
    const payload = {
      step,
      dataPatch: {
        details: {
          tradeCategory,
          title,
          description,
          isRegional: urbanOrRegional === "regional",
          urbanOrRegional,
          address: activeAddress.address,
          city: activeAddress.city,
          postalCode: activeAddress.postalCode,
          stateCode: activeAddress.region,
          region: activeAddress.region,
          countryCode: activeAddress.country,
          lat: activeAddress.lat,
          lon: activeAddress.lon,
        },
        availability,
        images,
        appraisal,
        pricing: {
          appraisalPriceCents: appraisalPrice,
          selectedPriceCents: appraisalPrice,
          isRegional: urbanOrRegional === "regional",
        },
      },
    };

    const resp = await fetch("/api/job-draft", {
      method: "PATCH",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    const json = await resp.json().catch(() => null);
    if (!resp.ok) throw new Error(String(json?.message ?? "Failed to save job draft."));
  }

  function validateBeforeAppraisal() {
    if (!tradeCategory) return "Trade category is required.";
    if (!title.trim()) return "Title is required.";
    if (!description.trim()) return "Description is required.";
    if (!activeAddress.address.trim()) return "Address is required.";
    if (!Number.isFinite(activeAddress.lat) || !Number.isFinite(activeAddress.lon)) return "Address coordinates are required.";
    return null;
  }

  async function beginAppraisal() {
    setError(null);
    const message = validateBeforeAppraisal();
    if (message) {
      setError(message);
      return;
    }

    setWorking(true);
    try {
      await persistDraft("DETAILS");
      const resp = await fetch("/api/web/v4/job/appraise-preview", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim(),
          tradeCategory: tradeCategory.trim().toUpperCase(),
          provinceState: activeAddress.region.trim().toUpperCase(),
          latitude: Number(activeAddress.lat),
          longitude: Number(activeAddress.lon),
          isRegionalRequested: urbanOrRegional === "regional",
        }),
      });
      const json = (await resp.json().catch(() => ({}))) as AppraisalResult & { error?: string; message?: string };
      if (!resp.ok || !json.appraisalToken) {
        throw new Error(json.message ?? json.error ?? "Failed to appraise job.");
      }
      setAppraisal(json);
      setAppraisalPrice(json.median * 100);
      setPricingPreview(null);
      setPaymentSummary(null);
      setClientSecret(null);
      setPaymentIntentId(null);
      setPaymentConfirmed(false);
      setPaymentCompleteMessage(null);
      await persistDraft("PRICING");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to appraise job.");
    } finally {
      setWorking(false);
    }
  }

  async function refreshPricingPreview() {
    if (appraisalPrice <= 0) return null;
    const resp = await fetch("/api/job-draft/pricing-preview", {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        appraisalSubtotalCents: appraisalPrice,
        isRegional: urbanOrRegional === "regional",
        country: activeAddress.country,
        province: activeAddress.region,
      }),
    });
    const json = (await resp.json().catch(() => ({}))) as PricingPreviewResult;
    if (!resp.ok || !json.success) {
      throw new Error(json.message ?? "Failed to compute server pricing.");
    }
    setPricingPreview(json);
    return json;
  }

  useEffect(() => {
    if (!appraisal?.appraisalToken || appraisalPrice <= 0) {
      setPricingPreview(null);
      return;
    }
    void (async () => {
      try {
        await refreshPricingPreview();
      } catch {
        // Keep last-known preview; payment-intent step will still validate server totals.
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appraisal?.appraisalToken, appraisalPrice, urbanOrRegional, activeAddress.country, activeAddress.region]);

  async function submitJobAfterPayment() {
    setError(null);
    if (!paymentIntentId) {
      setError("Stripe payment intent is required before posting.");
      return;
    }

    setWorking(true);
    try {
      await persistDraft("PAYMENT");
      const resp = await fetch("/api/job-draft/submit", {
        method: "POST",
        credentials: "include",
      });
      const json = (await resp.json().catch(() => ({}))) as { success?: boolean; jobId?: string; message?: string };
      if (!resp.ok || !json.success || !json.jobId) {
        throw new Error(json.message ?? "Failed to post job.");
      }
      setPaymentCompleteMessage("Payment Complete — Job Posted");
      router.push(`/dashboard/job-poster/jobs/${encodeURIComponent(json.jobId)}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to post job.");
    } finally {
      setWorking(false);
    }
  }

  async function preparePaymentIntent() {
    setError(null);
    setPaymentCompleteMessage(null);
    if (paymentConnected === false) {
      setError("Payment method required. Add a payment method in Payment Setup.");
      return;
    }
    if (!appraisal?.appraisalToken) {
      setError("Complete appraisal before payment confirmation.");
      return;
    }
    if (!hasAvailabilitySelection(availability)) {
      setError("Select at least one availability time block.");
      return;
    }

    setWorking(true);
    try {
      await refreshPricingPreview();
      await persistDraft("PAYMENT");
      const resp = await fetch("/api/job-draft/payment-intent", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          selectedPrice: appraisalPrice,
          isRegional: urbanOrRegional === "regional",
        }),
      });
      const json = (await resp.json().catch(() => ({}))) as PaymentIntentResult;
      if (!resp.ok || !json.paymentIntentId) {
        throw new Error(json.message ?? "Failed to prepare Stripe confirmation.");
      }
      setPaymentSummary(json);
      setPaymentIntentId(json.paymentIntentId);
      const paymentStatus = String(json.paymentStatus ?? "").toLowerCase();
      if (paymentStatus === "succeeded") {
        setClientSecret(null);
        setPaymentConfirmed(true);
        await submitJobAfterPayment();
      } else if (json.clientSecret) {
        setClientSecret(json.clientSecret);
        setPaymentConfirmed(false);
      } else {
        throw new Error("Stripe client secret missing for an unpaid payment intent.");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to prepare Stripe confirmation.");
    } finally {
      setWorking(false);
    }
  }

  const sliderMin = appraisal ? appraisal.low * 100 : 0;
  const sliderMax = appraisal ? appraisal.high * 100 : 0;
  const sliderStep = 500;

  const isLower = appraisal ? appraisalPrice < appraisal.median * 100 : false;
  const isHigher = appraisal ? appraisalPrice > appraisal.median * 100 : false;

  const summaryCurrency = pricingPreview?.currency ?? paymentSummary?.currency ?? (activeAddress.country === "CA" ? "CAD" : "USD");
  const summaryAppraisal = pricingPreview?.appraisalSubtotalCents ?? paymentSummary?.appraisalPriceCents ?? 0;
  const summaryRegional = pricingPreview?.regionalFeeCents ?? paymentSummary?.regionalFeeCents ?? 0;
  const summaryTax = pricingPreview?.taxCents ?? paymentSummary?.taxCents ?? 0;
  const summaryTotal = pricingPreview?.totalCents ?? paymentSummary?.totalCents ?? 0;

  if (loading) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-10">
        <p className="text-sm text-gray-600">Loading post-job form...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white">
      <div className="mx-auto max-w-4xl px-4 py-10">
        <h1 className="text-4xl font-semibold text-gray-900">Post a Job</h1>

        <div className="mt-8 space-y-6">
          <section>
            <label className="block text-sm font-medium text-gray-700">Trade Category</label>
            <select
              value={tradeCategory}
              onChange={(e) => setTradeCategory(e.target.value)}
              className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2"
            >
              <option value="">Select...</option>
              {tradeMeta.uiOrder.map((tc) => (
                <option key={tc} value={tc}>
                  {tc}
                </option>
              ))}
            </select>
          </section>

          <section>
            <label className="block text-sm font-medium text-gray-700">Title</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2"
              placeholder="e.g. Fix leaky faucet"
            />
          </section>

          <section>
            <label className="block text-sm font-medium text-gray-700">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={5}
              className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2"
              placeholder="Describe the job..."
            />
          </section>

          <section>
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium text-gray-700">Urban / Regional</label>
              <span
                className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-gray-300 text-xs text-gray-600"
                title="Urban = within 50km. Regional = within 100km (+ $20 charge)."
                aria-label="Urban and Regional pricing info"
              >
                i
              </span>
            </div>
            <select
              value={urbanOrRegional}
              onChange={(e) => setUrbanOrRegional(e.target.value === "regional" ? "regional" : "urban")}
              className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2"
            >
              <option value="urban">Urban</option>
              <option value="regional">Regional</option>
            </select>
          </section>

          <section className="rounded-lg border border-gray-200 p-4">
            <div className="flex items-center justify-between gap-3">
              <label className="text-sm font-medium text-gray-700">Use saved profile address</label>
              <input
                type="checkbox"
                checked={useSavedAddress}
                onChange={(e) => setUseSavedAddress(e.target.checked)}
              />
            </div>

            {useSavedAddress ? (
              <div className="mt-3 text-sm text-gray-700">
                <p>{savedAddress.address || "No saved profile address found."}</p>
                {savedAddress.lat != null && savedAddress.lon != null ? (
                  <p className="text-xs text-gray-500 mt-1">
                    {savedAddress.lat.toFixed(5)}, {savedAddress.lon.toFixed(5)}
                  </p>
                ) : (
                  <p className="text-xs text-red-600 mt-1">Saved profile address is missing coordinates. Uncheck to enter manually.</p>
                )}
              </div>
            ) : (
              <div className="mt-4 space-y-4">
                <GoogleAddressAutocomplete
                  label="Map Search"
                  value={mapQuery}
                  onChange={setMapQuery}
                  onPick={(result) => {
                    setMapQuery(result.displayName);
                    setAddress(result.formattedAddress);
                    setCity(result.city || city);
                    setPostalCode(result.postalCode || postalCode);
                    setRegion(result.regionCode || region);
                    setCountry(result.countryCode === "CA" ? "CA" : "US");
                    setLat(result.latitude);
                    setLon(result.longitude);
                  }}
                  helperText="Search and select an address to save coordinates."
                />

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Address</label>
                    <input value={address} onChange={(e) => setAddress(e.target.value)} className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">City</label>
                    <input value={city} onChange={(e) => setCity(e.target.value)} className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Postal Code</label>
                    <input value={postalCode} onChange={(e) => setPostalCode(e.target.value)} className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Region</label>
                    <input value={region} onChange={(e) => setRegion(e.target.value.toUpperCase())} className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Country</label>
                    <select value={country} onChange={(e) => setCountry(e.target.value === "CA" ? "CA" : "US")} className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2">
                      <option value="US">United States</option>
                      <option value="CA">Canada</option>
                    </select>
                  </div>
                </div>

                <p className="text-xs text-gray-500">
                  Coordinates: {lat != null && lon != null ? `${lat.toFixed(5)}, ${lon.toFixed(5)}` : "Not set"}
                </p>
              </div>
            )}
          </section>

          <section className="rounded-lg border border-gray-200 p-4">
            <h2 className="text-sm font-medium text-gray-700">Availability</h2>
            <div className="mt-3 overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="text-left text-gray-600">
                    <th className="py-2 pr-4">Day</th>
                    <th className="py-2 pr-4">Morning (7am-11am)</th>
                    <th className="py-2 pr-4">Afternoon (12pm-4pm)</th>
                    <th className="py-2">Evening (5pm-9pm)</th>
                  </tr>
                </thead>
                <tbody>
                  {DAYS.map((day) => (
                    <tr key={day} className="border-t border-gray-100">
                      <td className="py-2 pr-4 capitalize">{day}</td>
                      <td className="py-2 pr-4">
                        <input type="checkbox" checked={Boolean(availability[day]?.morning)} onChange={() => updateAvailability(day, "morning")} />
                      </td>
                      <td className="py-2 pr-4">
                        <input type="checkbox" checked={Boolean(availability[day]?.afternoon)} onChange={() => updateAvailability(day, "afternoon")} />
                      </td>
                      <td className="py-2">
                        <input type="checkbox" checked={Boolean(availability[day]?.evening)} onChange={() => updateAvailability(day, "evening")} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="rounded-lg border border-gray-200 p-4">
            <h2 className="text-sm font-medium text-gray-700">Image Upload</h2>
            <input className="mt-2" type="file" accept="image/*" multiple onChange={(e) => void uploadFiles(e.target.files)} />
            {uploading ? <p className="mt-2 text-xs text-gray-600">Uploading images...</p> : null}
            {images.length > 0 ? (
              <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
                {images.map((img) => (
                  <div key={img.uploadId} className="rounded-md border border-gray-200 p-2">
                    <div className="h-28 w-full overflow-hidden rounded bg-gray-50">
                      <img src={img.url} alt="Uploaded job photo" className="h-full w-full object-contain" />
                    </div>
                    <button type="button" onClick={() => removeImage(img.uploadId)} className="mt-2 text-xs font-medium text-red-600 hover:underline">
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            ) : null}
          </section>

          <section className="rounded-lg border border-gray-200 p-6 text-center">
            <h2 className="text-xl font-semibold text-gray-900">Job Appraisal</h2>
            <button type="button" onClick={() => void beginAppraisal()} disabled={working} className="mt-4 rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700 disabled:opacity-60">
              {working ? "Running Appraisal..." : "Begin Appraisal"}
            </button>

            {appraisal ? (
              <div className="mt-6">
                <input
                  type="range"
                  min={sliderMin}
                  max={sliderMax}
                  step={sliderStep}
                  value={appraisalPrice}
                  onChange={(e) => setAppraisalPrice(Number(e.target.value))}
                  className="w-full"
                />
                <p className="mt-2 text-sm font-medium text-gray-800">
                  Selected Price: {formatMoney(appraisalPrice, activeAddress.country === "CA" ? "CAD" : "USD")}
                </p>
                {isLower ? <p className="mt-2 text-sm text-amber-700">Lower pricing may delay contractor acceptance.</p> : null}
                {isHigher ? <p className="mt-2 text-sm text-green-700">Higher pricing can help expedite routing.</p> : null}
              </div>
            ) : null}

            <p className="mt-4 text-sm text-gray-600">Your job appraisal will appear here.</p>
          </section>

          <section className="rounded-lg border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-900">Stripe Confirmation</h2>
            <p className="mt-2 text-sm text-gray-600">Payment Status</p>

            <div className="mt-4 space-y-2 text-sm">
              <div className="flex justify-between">
                <span>Appraisal Price</span>
                <span>{formatMoney(summaryAppraisal, summaryCurrency)}</span>
              </div>
              <div className="flex justify-between">
                <span>Regional Fee</span>
                <span>{formatMoney(summaryRegional, summaryCurrency)}</span>
              </div>
              <div className="flex justify-between">
                <span>Applicable Tax (Canada only)</span>
                <span>{formatMoney(summaryTax, summaryCurrency)}</span>
              </div>
              <div className="border-t border-gray-200 pt-2 flex justify-between font-semibold">
                <span>Total Charge</span>
                <span>{formatMoney(summaryTotal, summaryCurrency)}</span>
              </div>
              <div className="border-t border-gray-200 pt-2 flex justify-between">
                <span>Payment Status</span>
                <span>{paymentConfirmed ? "Paid" : "Not paid"}</span>
              </div>
            </div>

            {!clientSecret && !paymentConfirmed ? (
              <button
                type="button"
                onClick={() => void preparePaymentIntent()}
                disabled={working || appraisalPrice <= 0 || !appraisal?.appraisalToken}
                className="mt-4 rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-500 disabled:opacity-60"
              >
                {working ? "Preparing..." : "Confirm Total"}
              </button>
            ) : clientSecret && stripePromise ? (
              <div className="mt-4">
                <Elements stripe={stripePromise} options={{ clientSecret }}>
                  <PaymentConfirm
                    onConfirmed={() => {
                      setPaymentConfirmed(true);
                      void submitJobAfterPayment();
                    }}
                    onError={(message) => setError(message)}
                  />
                </Elements>
                {paymentConfirmed && paymentIntentId ? (
                  <p className="mt-3 text-sm text-green-700">Paid: {paymentIntentId}</p>
                ) : null}
              </div>
            ) : paymentConfirmed && paymentIntentId ? (
              <p className="mt-4 text-sm text-green-700">Paid: {paymentIntentId}</p>
            ) : (
              <p className="mt-4 text-sm text-red-700">Stripe publishable key is missing.</p>
            )}
          </section>
          {paymentCompleteMessage ? (
            <div className="rounded-md border border-green-200 bg-green-50 p-3 text-sm text-green-700">{paymentCompleteMessage}</div>
          ) : null}

          {paymentConnected === false ? (
            <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              Payment method required. Add a payment method in <a className="underline" href="/dashboard/job-poster/payment">Payment Setup</a>.
            </div>
          ) : null}

          {error ? <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div> : null}
        </div>
      </div>
    </div>
  );
}
