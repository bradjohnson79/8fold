"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@clerk/nextjs";
import { loadStripe } from "@stripe/stripe-js";
import { Elements, PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";
import { GoogleAddressAutocomplete } from "@/components/GoogleAddressAutocomplete";

type TradeMeta = {
  canonical: string[];
  uiOrder: string[];
};

type AppraisalResult = {
  low: number;
  median: number;
  high: number;
  confidence: "LOW" | "MEDIUM" | "HIGH";
  taxRate: number;
  currency: "USD" | "CAD";
  appraisalToken: string;
  modelUsed: string;
  usedFallback: boolean;
};

type PaymentIntentResult = {
  success: boolean;
  clientSecret: string;
  paymentIntentId: string;
  appraisalPriceCents: number;
  regionalFeeCents: number;
  taxCents: number;
  totalCents: number;
  currency: "USD" | "CAD";
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

function getApiErrorMessage(payload: unknown, fallback: string): string {
  const obj = payload && typeof payload === "object" ? (payload as Record<string, unknown>) : {};
  const topMessage = typeof obj.message === "string" ? obj.message : "";
  const topError = obj.error;
  if (topMessage) return topMessage;
  if (typeof topError === "string") return topError;
  if (topError && typeof topError === "object") {
    const nested = topError as Record<string, unknown>;
    if (typeof nested.message === "string" && nested.message.trim()) return nested.message;
    if (typeof nested.code === "string" && nested.code.trim()) return nested.code;
    return JSON.stringify(topError);
  }
  return fallback;
}

function getErrorMessage(err: unknown, fallback: string): string {
  if (err instanceof Error && err.message.trim()) return err.message;
  if (typeof err === "string" && err.trim()) return err;
  if (err && typeof err === "object") return getApiErrorMessage(err, fallback);
  return fallback;
}

function HoldConfirm(props: {
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
              if (result.paymentIntent?.status !== "requires_capture") {
                throw new Error("Payment hold not secured. Status is not requires_capture.");
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
  const { getToken } = useAuth();

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
  const [baseMedianCents, setBaseMedianCents] = useState(0);
  const [sliderOffsetDollars, setSliderOffsetDollars] = useState(0);

  const [paymentConnected, setPaymentConnected] = useState<boolean | null>(null);
  const [paymentSummary, setPaymentSummary] = useState<PaymentIntentResult | null>(null);
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [paymentIntentId, setPaymentIntentId] = useState<string | null>(null);
  const [paymentConfirmed, setPaymentConfirmed] = useState(false);

  const [working, setWorking] = useState(false);
  const [isAppraising, setIsAppraising] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const stripePromise = useMemo(() => {
    const pk = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
    return pk ? loadStripe(pk) : null;
  }, []);

  const apiOrigin = useMemo(() => {
    const explicit = String(process.env.NEXT_PUBLIC_API_ORIGIN ?? "").trim();
    if (explicit) return explicit.replace(/\/+$/, "");
    if (typeof window !== "undefined" && window.location.hostname === "localhost") {
      return "http://localhost:3003";
    }
    return "https://api.8fold.app";
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

  const minOffsetDollars = appraisal ? appraisal.low - appraisal.median : 0;
  const maxOffsetDollars = appraisal ? appraisal.high - appraisal.median : 0;
  const appraisalPriceCents = Math.max(0, baseMedianCents + sliderOffsetDollars * 100);

  const regionalFeeCents = urbanOrRegional === "regional" ? 2000 : 0;
  const summaryCurrency: "USD" | "CAD" = activeAddress.country === "CA" ? "CAD" : "USD";
  const taxRate = appraisal ? Number(appraisal.taxRate ?? 0) : 0;
  const summaryTaxCents = summaryCurrency === "CAD" ? Math.max(0, Math.round((appraisalPriceCents + regionalFeeCents) * taxRate)) : 0;
  const summaryTotalCents = appraisalPriceCents + regionalFeeCents + summaryTaxCents;

  const isLower = appraisal ? appraisalPriceCents < baseMedianCents : false;
  const isHigher = appraisal ? appraisalPriceCents > baseMedianCents : false;

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

          const draftAppraisal = draftData.appraisal as Partial<AppraisalResult> | undefined;
          const pricing = (draftData.pricing ?? {}) as Record<string, unknown>;
          if (
            draftAppraisal &&
            Number.isFinite(Number(draftAppraisal.low)) &&
            Number.isFinite(Number(draftAppraisal.median)) &&
            Number.isFinite(Number(draftAppraisal.high))
          ) {
            const normalized: AppraisalResult = {
              low: Number(draftAppraisal.low),
              median: Number(draftAppraisal.median),
              high: Number(draftAppraisal.high),
              confidence: String(draftAppraisal.confidence ?? "LOW").toUpperCase() === "HIGH"
                ? "HIGH"
                : String(draftAppraisal.confidence ?? "LOW").toUpperCase() === "MEDIUM"
                  ? "MEDIUM"
                  : "LOW",
              taxRate: Number(draftAppraisal.taxRate ?? 0),
              currency: String(draftAppraisal.currency ?? "USD").toUpperCase() === "CAD" ? "CAD" : "USD",
              appraisalToken: String(draftAppraisal.appraisalToken ?? ""),
              modelUsed: String(draftAppraisal.modelUsed ?? "gpt-5-nano"),
              usedFallback: Boolean(draftAppraisal.usedFallback),
            };
            setAppraisal(normalized);
            const medianCents = normalized.median * 100;
            const selected = Number(pricing.appraisalPriceCents ?? pricing.selectedPriceCents ?? medianCents);
            const offset = Math.round((selected - medianCents) / 100);
            setBaseMedianCents(medianCents);
            setSliderOffsetDollars(Math.max(normalized.low - normalized.median, Math.min(normalized.high - normalized.median, offset)));
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

  function resetPaymentConfirmationState() {
    setPaymentSummary(null);
    setClientSecret(null);
    setPaymentIntentId(null);
    setPaymentConfirmed(false);
  }

  function apiUrl(path: string): string {
    return `${apiOrigin}${path.startsWith("/") ? "" : "/"}${path}`;
  }

  async function getApiAuthHeader(): Promise<Record<string, string>> {
    const token = await getToken();
    if (!token) {
      throw new Error("Unauthorized. Please sign in again.");
    }
    return { authorization: `Bearer ${token}` };
  }

  async function uploadFiles(files: FileList | null) {
    if (!files?.length) return;
    setError(null);
    setUploading(true);
    try {
      const authHeader = await getApiAuthHeader();
      for (const file of Array.from(files)) {
        const form = new FormData();
        form.set("file", file);
        const resp = await fetch(apiUrl("/api/job/upload"), {
          method: "POST",
          headers: authHeader,
          body: form,
        });
        const json = (await resp.json().catch(() => ({}))) as { uploadId?: string; url?: string; message?: string; error?: string };
        if (!resp.ok || !json.uploadId || !json.url) {
          throw new Error(getApiErrorMessage(json, "Image upload failed."));
        }
        setImages((prev) => [...prev, { uploadId: json.uploadId!, url: json.url! }]);
      }
    } catch (e) {
      setError(getErrorMessage(e, "Image upload failed."));
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
          appraisalPriceCents,
          selectedPriceCents: appraisalPriceCents,
          appraisalAnchorCents: baseMedianCents,
          sliderOffsetDollars,
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
    if (!resp.ok) throw new Error(getApiErrorMessage(json, "Failed to save job draft."));
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

    setIsAppraising(true);
    try {
      const authHeader = await getApiAuthHeader();
      const resp = await fetch(apiUrl("/api/job-draft/pricing-preview"), {
        method: "POST",
        headers: {
          ...authHeader,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          country: activeAddress.country,
          province: activeAddress.region.trim().toUpperCase(),
          tradeCategory: tradeCategory.trim().toUpperCase(),
          title: title.trim(),
          description: description.trim(),
        }),
      });
      const json = (await resp.json().catch(() => ({}))) as Partial<AppraisalResult> & { error?: string; message?: string };

      if (!resp.ok || !Number.isFinite(Number(json.low)) || !Number.isFinite(Number(json.median)) || !Number.isFinite(Number(json.high))) {
        throw new Error(getApiErrorMessage(json, "Failed to appraise job."));
      }

      const next: AppraisalResult = {
        low: Number(json.low),
        median: Number(json.median),
        high: Number(json.high),
        confidence: String(json.confidence ?? "LOW").toUpperCase() === "HIGH"
          ? "HIGH"
          : String(json.confidence ?? "LOW").toUpperCase() === "MEDIUM"
            ? "MEDIUM"
            : "LOW",
        taxRate: Number(json.taxRate ?? 0),
        currency: String(json.currency ?? "USD").toUpperCase() === "CAD" ? "CAD" : "USD",
        appraisalToken: String(json.appraisalToken ?? ""),
        modelUsed: String(json.modelUsed ?? "gpt-5-nano"),
        usedFallback: Boolean(json.usedFallback),
      };

      setAppraisal(next);
      setBaseMedianCents(next.median * 100);
      setSliderOffsetDollars(0);
      resetPaymentConfirmationState();
      // Pricing draft persistence should not block appraisal UX.
      void persistDraft("PRICING").catch(() => {});
    } catch (e) {
      setError(getErrorMessage(e, "Failed to appraise job."));
    } finally {
      setIsAppraising(false);
    }
  }

  async function preparePaymentIntent() {
    setError(null);
    if (paymentConnected === false) {
      setError("Payment method required. Add a payment method in Payment Setup.");
      return;
    }
    if (!appraisal) {
      setError("Complete appraisal before payment confirmation.");
      return;
    }
    if (!hasAvailabilitySelection(availability)) {
      setError("Select at least one availability time block.");
      return;
    }

    setWorking(true);
    try {
      await persistDraft("PAYMENT");
      const resp = await fetch("/api/job-draft/payment-intent", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          selectedPrice: appraisalPriceCents,
          isRegional: urbanOrRegional === "regional",
        }),
      });
      const json = (await resp.json().catch(() => ({}))) as PaymentIntentResult;
      if (!resp.ok || !json.clientSecret || !json.paymentIntentId) {
        throw new Error(getApiErrorMessage(json, "Failed to prepare Stripe confirmation."));
      }
      setPaymentSummary(json);
      setClientSecret(json.clientSecret);
      setPaymentIntentId(json.paymentIntentId);
      setPaymentConfirmed(false);
    } catch (e) {
      setError(getErrorMessage(e, "Failed to prepare Stripe confirmation."));
    } finally {
      setWorking(false);
    }
  }

  async function submitJob() {
    setError(null);
    if (!paymentConfirmed) {
      setError("Stripe payment confirmation is required before submitting.");
      return;
    }

    setWorking(true);
    try {
      await persistDraft("PAYMENT");
      const authHeader = await getApiAuthHeader();
      const resp = await fetch(apiUrl("/api/job-draft/submit"), {
        method: "POST",
        headers: authHeader,
      });
      const json = (await resp.json().catch(() => ({}))) as { success?: boolean; jobId?: string; message?: string };
      if (!resp.ok || !json.success || !json.jobId) {
        throw new Error(getApiErrorMessage(json, "Failed to submit job."));
      }
      router.push(`/dashboard/job-poster/jobs/${encodeURIComponent(json.jobId)}`);
    } catch (e) {
      setError(getErrorMessage(e, "Failed to submit job."));
    } finally {
      setWorking(false);
    }
  }

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
              onChange={(e) => {
                setUrbanOrRegional(e.target.value === "regional" ? "regional" : "urban");
                resetPaymentConfirmationState();
              }}
              className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2"
            >
              <option value="urban">Urban</option>
              <option value="regional">Regional — $20 Extra Charge</option>
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
                  <p className="mt-1 text-xs text-gray-500">
                    {savedAddress.lat.toFixed(5)}, {savedAddress.lon.toFixed(5)}
                  </p>
                ) : (
                  <p className="mt-1 text-xs text-red-600">Saved profile address is missing coordinates. Uncheck to enter manually.</p>
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
              <div className="mt-4 space-y-4">
                {images.map((img) => (
                  <div key={img.uploadId} className="rounded-md border border-gray-200 p-3">
                    <img src={img.url} alt="Uploaded job photo" className="h-auto max-h-[28rem] w-full rounded object-contain" />
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
            <button type="button" onClick={() => void beginAppraisal()} disabled={isAppraising} className="mt-4 rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700 disabled:opacity-60">
              {isAppraising ? "Analyzing..." : "Begin Appraisal"}
            </button>

            {appraisal ? (
              <div className="mt-6 space-y-4 text-left">
                <div className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-3">
                  <div className="rounded border border-gray-200 p-3">Low Estimate: <span className="font-semibold">{formatMoney(appraisal.low * 100, summaryCurrency)}</span></div>
                  <div className="rounded border border-gray-200 p-3">Suggested Median: <span className="font-semibold">{formatMoney(baseMedianCents, summaryCurrency)}</span></div>
                  <div className="rounded border border-gray-200 p-3">High Estimate: <span className="font-semibold">{formatMoney(appraisal.high * 100, summaryCurrency)}</span></div>
                </div>

                <input
                  type="range"
                  min={minOffsetDollars}
                  max={maxOffsetDollars}
                  step={5}
                  value={sliderOffsetDollars}
                  onChange={(e) => {
                    setSliderOffsetDollars(Number(e.target.value));
                    resetPaymentConfirmationState();
                  }}
                  className="w-full"
                />
                <div className="flex justify-between text-xs text-gray-500">
                  <span>{minOffsetDollars}</span>
                  <span>0</span>
                  <span>{maxOffsetDollars > 0 ? `+${maxOffsetDollars}` : maxOffsetDollars}</span>
                </div>

                <p className="text-sm font-medium text-gray-800">Selected Price: {formatMoney(appraisalPriceCents, summaryCurrency)}</p>
                {isLower ? <p className="text-sm text-amber-700">Lower pricing may delay contractor acceptance.</p> : null}
                {isHigher ? <p className="text-sm text-green-700">Increased pricing may speed up contractor routing.</p> : null}
                <p className="text-xs text-gray-500">Confidence: {appraisal.confidence}</p>
              </div>
            ) : null}

            <p className="mt-4 text-sm text-gray-600">Your job appraisal will appear here.</p>
          </section>

          <section className="rounded-lg border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-900">Stripe Confirmation</h2>
            <p className="mt-2 text-sm text-gray-600">Stripe Integration Summary</p>

            <div className="mt-4 space-y-2 text-sm">
              <div className="flex justify-between">
                <span>Appraisal Price</span>
                <span>{formatMoney(appraisalPriceCents, summaryCurrency)}</span>
              </div>
              <div className="flex justify-between">
                <span>Regional Fee</span>
                <span>{formatMoney(regionalFeeCents, summaryCurrency)}</span>
              </div>
              <div className="flex justify-between">
                <span>Applicable Tax (Canada only)</span>
                <span>{formatMoney(summaryTaxCents, summaryCurrency)}</span>
              </div>
              <div className="flex justify-between border-t border-gray-200 pt-2 font-semibold">
                <span>Total Charge</span>
                <span>{formatMoney(summaryTotalCents, summaryCurrency)}</span>
              </div>
            </div>

            {!clientSecret ? (
              <button
                type="button"
                onClick={() => void preparePaymentIntent()}
                disabled={working || appraisalPriceCents <= 0 || !appraisal}
                className="mt-4 rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-500 disabled:opacity-60"
              >
                {working ? "Preparing..." : "Confirm Total"}
              </button>
            ) : stripePromise ? (
              <div className="mt-4">
                <Elements stripe={stripePromise} options={{ clientSecret }}>
                  <HoldConfirm
                    onConfirmed={() => setPaymentConfirmed(true)}
                    onError={(message) => setError(message)}
                  />
                </Elements>
                {paymentConfirmed && paymentIntentId ? (
                  <p className="mt-3 text-sm text-green-700">Stripe confirmation complete: {paymentIntentId}</p>
                ) : null}
                {paymentSummary ? (
                  <p className="mt-2 text-xs text-gray-500">Server total prepared: {formatMoney(paymentSummary.totalCents, paymentSummary.currency)}</p>
                ) : null}
              </div>
            ) : (
              <p className="mt-4 text-sm text-red-700">Stripe publishable key is missing.</p>
            )}
          </section>

          <div>
            <button
              type="button"
              onClick={() => void submitJob()}
              disabled={working || !paymentConfirmed}
              className="w-full rounded-md bg-slate-900 px-4 py-3 text-sm font-semibold text-white hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {working ? "Submitting Job..." : "Submit Job"}
            </button>
          </div>

          {paymentConnected === false ? (
            <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              Payment method required. Add a payment method in <a className="underline" href="/dashboard/job-poster/payment">Payment Setup</a>.
            </div>
          ) : null}

          {error ? <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div> : null}
        </div>
      </div>

      {isAppraising ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" aria-modal="true" role="dialog">
          <div className="w-full max-w-sm rounded-lg bg-white p-6 text-center shadow-xl">
            <h3 className="text-lg font-semibold text-gray-900">Analyzing Your Job...</h3>
            <div className="mx-auto mt-4 h-10 w-10 animate-spin rounded-full border-4 border-gray-200 border-t-blue-600" aria-hidden />
            <p className="mt-4 text-sm text-gray-600">GPT-5 Nano is evaluating your job details...</p>
          </div>
        </div>
      ) : null}
    </div>
  );
}
