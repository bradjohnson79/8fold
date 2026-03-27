"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@clerk/nextjs";
import { loadStripe } from "@stripe/stripe-js";
import { Elements, PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";
import { GoogleAddressAutocomplete } from "@/components/GoogleAddressAutocomplete";
import { AccountIncompleteModal } from "@/components/modals/AccountIncompleteModal";
import { parseMissingSteps, type MissingStep } from "@/lib/accountIncomplete";

type TradeMeta = {
  canonical: string[];
  uiOrder: string[];
};

type AppraisalResult = {
  low: number;
  median: number;
  high: number;
  confidence: "LOW" | "MEDIUM" | "HIGH";
  confidenceScore?: number;
  confidenceExplanation?: string;
  rationale: string;
  taxRate: number;
  currency: "USD" | "CAD";
  appraisalToken: string;
  modelUsed: string;
  usedFallback: boolean;
};

type PaymentIntentResult = {
  success: boolean;
  stripeMode?: "test" | "live";
  clientSecret: string;
  paymentIntentId: string;
  modelAJobId?: string;
  appraisalPriceCents: number;
  regionalFeeCents: number;
  baseSplitCents: number;
  subtotalCents: number;
  taxCents: number;
  estimatedProcessingFeeCents: number;
  totalCents: number;
  contractorPayoutCents: number;
  routerFeeCents: number;
  platformFeeCents: number;
  currency: "USD" | "CAD";
  message?: string;
  error?: { code?: string; message?: string; details?: Record<string, unknown> };
};

type StripeConfigResult = {
  ok: boolean;
  stripeMode?: "test" | "live";
  pkMode?: "test" | "live" | "unknown";
  skMode?: "test" | "live" | "unknown";
  publishableKeyPresent?: boolean;
  secretKeyPresent?: boolean;
  error?: { code?: string; message?: string };
};

function hasValidServerTotals(payload: PaymentIntentResult): boolean {
  const required = [
    payload.baseSplitCents,
    payload.contractorPayoutCents,
    payload.routerFeeCents,
    payload.platformFeeCents,
    payload.taxCents,
    payload.estimatedProcessingFeeCents,
    payload.totalCents,
  ];
  if (required.some((value) => !Number.isInteger(value) || value < 0)) return false;
  if (payload.contractorPayoutCents + payload.routerFeeCents + payload.platformFeeCents !== payload.baseSplitCents) return false;
  if (payload.baseSplitCents + payload.taxCents + payload.estimatedProcessingFeeCents !== payload.totalCents) return false;
  return true;
}

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

function formatMoneyMaybe(cents: number | null, currency: "USD" | "CAD") {
  return cents == null ? "—" : formatMoney(cents, currency);
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

function mapStripeConfirmError(input: {
  message: string;
  code?: string | null;
  type?: string | null;
}): { code: "STRIPE_MODE_MISMATCH" | "STRIPE_CONFIRM_FAILED" | "STRIPE_PI_INVALID" | "STRIPE_ACCOUNT_INELIGIBLE"; message: string } {
  const normalized = String(input.message ?? "").toLowerCase();
  const code = String(input.code ?? "").toLowerCase();
  if (code.includes("payment_intent") || normalized.includes("paymentintent")) {
    return { code: "STRIPE_PI_INVALID", message: input.message };
  }
  if (normalized.includes("eligible") || normalized.includes("ineligible")) {
    return { code: "STRIPE_ACCOUNT_INELIGIBLE", message: input.message };
  }
  return { code: "STRIPE_CONFIRM_FAILED", message: input.message };
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
              const status = result.paymentIntent?.status ?? null;
              const nextAction = (result.paymentIntent as any)?.next_action ?? null;
              if (result.error) {
                const mapped = mapStripeConfirmError({
                  message: result.error.message || "Payment confirmation failed.",
                  code: result.error.code,
                  type: result.error.type,
                });
                throw new Error(`${mapped.code}: ${mapped.message}`);
              }
              if (status === "requires_action") {
                throw new Error("Payment requires additional action before it can be confirmed.");
              }
              if (status !== "processing" && status !== "succeeded") {
                throw new Error(`Payment confirmation did not complete. Unexpected status: ${status ?? "unknown"}.`);
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
  const [paymentProviderReady, setPaymentProviderReady] = useState<boolean | null>(null);
  const [stripeConfig, setStripeConfig] = useState<StripeConfigResult | null>(null);
  const [paymentSummary, setPaymentSummary] = useState<PaymentIntentResult | null>(null);
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [paymentIntentId, setPaymentIntentId] = useState<string | null>(null);
  const [draftJobId, setDraftJobId] = useState<string | null>(null);
  const [paymentConfirmed, setPaymentConfirmed] = useState(false);

  const [working, setWorking] = useState(false);
  const [isAppraising, setIsAppraising] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showIncompleteModal, setShowIncompleteModal] = useState(false);
  const [incompleteMissing, setIncompleteMissing] = useState<MissingStep[]>([]);

  const stripePromise = useMemo(() => {
    const pk = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
    return pk ? loadStripe(pk) : null;
  }, []);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  const stripeModeMismatch = stripeConfig?.ok === false && stripeConfig?.error?.code === "STRIPE_MODE_MISMATCH";
  const stripeConfigBlockingError = stripeConfig?.ok === false ? stripeConfig?.error?.message ?? "Stripe configuration is invalid." : null;

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

  const summaryCurrency: "USD" | "CAD" = activeAddress.country === "CA" ? "CAD" : "USD";
  const displaySubtotalCents = paymentSummary?.baseSplitCents ?? null;
  const displayTaxCents = paymentSummary?.taxCents ?? null;
  const displayProcessingFeeCents = paymentSummary?.estimatedProcessingFeeCents ?? null;
  const displayTotalCents = paymentSummary?.totalCents ?? null;
  const displayCurrency: "USD" | "CAD" = paymentSummary?.currency ?? summaryCurrency;

  const isLower = appraisal ? appraisalPriceCents < baseMedianCents : false;
  const isHigher = appraisal ? appraisalPriceCents > baseMedianCents : false;

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const [metaResp, profileResp, paymentResp, stripeConfigResp] = await Promise.all([
          fetch("/api/v4/meta/trade-categories", { cache: "no-store" }),
          fetch("/api/web/v4/job-poster/profile", { cache: "no-store", credentials: "include" }),
          fetch("/api/web/v4/job-poster/payment/status", { cache: "no-store", credentials: "include" }),
          fetch("/api/web/v4/stripe/config", { cache: "no-store", credentials: "include" }),
        ]);

        const metaJson = (await metaResp.json().catch(() => ({}))) as Partial<TradeMeta>;
        const profileJson = (await profileResp.json().catch(() => ({}))) as any;
        const paymentJson = (await paymentResp.json().catch(() => ({}))) as { connected?: boolean; providerReady?: boolean };
        const stripeConfigJson = (await stripeConfigResp.json().catch(() => ({}))) as StripeConfigResult;

        if (cancelled) return;

        setTradeMeta({
          canonical: Array.isArray(metaJson.canonical) ? metaJson.canonical : [],
          uiOrder: Array.isArray(metaJson.uiOrder) ? metaJson.uiOrder : [],
        });
        setPaymentConnected(typeof paymentJson.connected === "boolean" ? paymentJson.connected : null);
        setPaymentProviderReady(typeof paymentJson.providerReady === "boolean" ? paymentJson.providerReady : null);
        setStripeConfig(stripeConfigJson);

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
      const resp = await fetch(apiUrl("/api/web/v4/job/appraise-preview"), {
        method: "POST",
        headers: {
          ...authHeader,
          "content-type": "application/json",
        },
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
        confidenceScore: Number.isFinite(Number((json as { confidenceScore?: unknown }).confidenceScore))
          ? Number((json as { confidenceScore?: unknown }).confidenceScore)
          : undefined,
        confidenceExplanation: typeof (json as { confidenceExplanation?: unknown }).confidenceExplanation === "string"
          ? String((json as { confidenceExplanation?: unknown }).confidenceExplanation)
          : undefined,
        rationale: String(json.rationale ?? "").trim(),
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
    } catch (e) {
      setError(getErrorMessage(e, "Failed to appraise job."));
    } finally {
      setIsAppraising(false);
    }
  }

  async function preparePaymentIntent() {
    setError(null);
    if (!stripeConfig || stripeConfig.ok !== true) {
      const code = stripeConfig?.error?.code ?? "STRIPE_CONFIG_MISSING";
      const message = stripeConfig?.error?.message ?? "Stripe configuration is unavailable.";
      setError(`${code}: ${message}`);
      return;
    }
    if (stripeConfig.pkMode !== stripeConfig.skMode) {
      setError("STRIPE_MODE_MISMATCH: Publishable and secret Stripe keys are configured for different modes.");
      return;
    }
    if (paymentProviderReady === false) {
      setError("Stripe service is currently unavailable. Please try again shortly.");
      return;
    }
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
      const authHeader = await getApiAuthHeader();
      const resp = await fetch(apiUrl("/api/job-draft/payment-intent"), {
        method: "POST",
        headers: {
          ...authHeader,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          selectedPrice: appraisalPriceCents,
          isRegional: urbanOrRegional === "regional",
          details: {
            tradeCategory,
            title,
            description,
            address: activeAddress.address,
            city: activeAddress.city,
            postalCode: activeAddress.postalCode,
            stateCode: activeAddress.region,
            countryCode: activeAddress.country,
            lat: activeAddress.lat,
            lon: activeAddress.lon,
          },
          availability,
          payment: draftJobId ? { modelAJobId: draftJobId } : undefined,
        }),
      });
      const json = (await resp.json().catch(() => ({}))) as PaymentIntentResult;
      if (!resp.ok || !json.clientSecret || !json.paymentIntentId) {
        throw new Error(getApiErrorMessage(json, "Failed to prepare Stripe confirmation."));
      }
      if (json.stripeMode && json.stripeMode !== stripeConfig.stripeMode) {
        throw new Error("STRIPE_MODE_MISMATCH: Payment intent mode does not match Stripe config.");
      }
      if (!hasValidServerTotals(json)) {
        throw new Error("Server returned invalid totals. Please retry.");
      }
      setPaymentSummary(json);
      setClientSecret(json.clientSecret);
      setPaymentIntentId(json.paymentIntentId);
      setDraftJobId(typeof json.modelAJobId === "string" && json.modelAJobId.trim() ? json.modelAJobId : draftJobId);
      setPaymentConfirmed(false);
    } catch (e) {
      setError(getErrorMessage(e, "Failed to prepare Stripe confirmation."));
    } finally {
      setWorking(false);
    }
  }

  async function submitJob() {
    if (working) return;
    setError(null);
    if (!paymentConfirmed) {
      setError("Stripe payment confirmation is required before submitting.");
      return;
    }

    setWorking(true);
    try {
      const authHeader = await getApiAuthHeader();
      const resp = await fetch(apiUrl("/api/web/v4/job-poster/jobs/finalize"), {
        method: "POST",
        headers: {
          ...authHeader,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          details: {
            title: title.trim(),
            description: description.trim(),
            tradeCategory: tradeCategory.trim().toUpperCase(),
            stateCode: activeAddress.region.trim(),
            countryCode: activeAddress.country,
            city: activeAddress.city,
            postalCode: activeAddress.postalCode,
            address: activeAddress.address,
            lat: activeAddress.lat,
            lon: activeAddress.lon,
            isRegional: urbanOrRegional === "regional",
          },
          payment: {
            paymentIntentId,
            modelAJobId: draftJobId ?? paymentSummary?.modelAJobId,
          },
        }),
      });
      const json = (await resp.json().catch(() => ({}))) as {
        success?: boolean;
        jobId?: string;
        message?: string;
        error?: { code?: string; message?: string; details?: { missing?: MissingStep[] } };
      };
      const missing = parseMissingSteps(json);
      if (missing) {
        setIncompleteMissing(missing);
        setShowIncompleteModal(true);
        return;
      }
      if (!resp.ok || !json.success || !json.jobId) {
        throw new Error(getApiErrorMessage(json, "Failed to submit job."));
      }
      // Treat created: false as success (idempotent case)
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
            <div className="mt-2 space-y-1 text-xs text-gray-500">
              <p className="font-medium text-gray-600">
                Tip: Detailed job descriptions get faster responses.
              </p>
              <p>
                Please describe your job in as much detail as possible, including measurements,
                materials, access conditions, and any special requirements.
              </p>
              <p>
                If important details are missing and the contractor discovers additional work after
                reviewing the job, a re-appraisal may be requested to ensure the price accurately
                reflects the scope of work.
              </p>
            </div>
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
            <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
              <h2 className="text-sm font-medium text-gray-700">Availability</h2>
              <p className="text-xs text-gray-500">
                These are just time blocks that show when you&apos;re available and help the contractor book a time with you.
              </p>
            </div>
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
                <div className="space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-700">Rationale</p>
                  <textarea
                    value={appraisal.rationale}
                    readOnly
                    rows={3}
                    className="w-full resize-none rounded border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-700"
                  />
                  <div className="flex items-center gap-2 text-xs text-gray-500">
                    <p>
                      Confidence: {appraisal.confidence}
                      {typeof appraisal.confidenceScore === "number" ? ` (${Math.round(appraisal.confidenceScore * 100)}%)` : ""}
                    </p>
                    <span
                      className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-gray-300 text-[10px] font-semibold text-gray-500"
                      title={appraisal.confidenceExplanation || "Confidence is based on job clarity, category familiarity, and pricing consistency."}
                      aria-label="Confidence is based on job clarity, category familiarity, and pricing consistency."
                    >
                      i
                    </span>
                  </div>
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
              </div>
            ) : null}

            <p className="mt-4 text-sm text-gray-600">Your job appraisal will appear here.</p>
          </section>

          <section className="rounded-lg border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-900">Stripe Confirmation</h2>
            <p className="mt-2 text-sm text-gray-600">Stripe Integration Summary</p>
            {stripeConfig?.stripeMode === "test" && stripeConfig.ok ? (
              <div className="mt-3 rounded-md border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900">
                <p className="font-semibold">Stripe Test Mode Active</p>
                <p className="mt-1">Use test card `4242 4242 4242 4242`, any future expiry, any CVC, and any postal code.</p>
              </div>
            ) : null}
            {stripeConfigBlockingError ? (
              <div className="mt-3 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                {stripeConfig?.error?.code ? `${stripeConfig.error.code}: ` : ""}
                {stripeConfigBlockingError}
              </div>
            ) : null}

            <div className="mt-4 space-y-2 text-sm">
              <div className="flex justify-between">
                <span>Subtotal</span>
                <span>{formatMoneyMaybe(displaySubtotalCents, displayCurrency)}</span>
              </div>
              <div className="flex justify-between">
                <span>Applicable Tax (Canada only)</span>
                <span>{formatMoneyMaybe(displayTaxCents, displayCurrency)}</span>
              </div>
              <div className="flex justify-between">
                <span>Processing Fee (Stripe)</span>
                <span>{formatMoneyMaybe(displayProcessingFeeCents, displayCurrency)}</span>
              </div>
              <div className="flex justify-between border-t border-gray-200 pt-2 font-semibold">
                <span>Total Charge</span>
                <span>{formatMoneyMaybe(displayTotalCents, displayCurrency)}</span>
              </div>
            </div>
            {paymentSummary ? (
              <details className="mt-3 rounded-md border border-gray-200 p-3 text-sm">
                <summary className="cursor-pointer font-medium text-gray-700">Split Breakdown</summary>
                <div className="mt-2 space-y-1 text-gray-700">
                  <div className="flex justify-between">
                    <span>Contractor Payout (80%)</span>
                    <span>{formatMoney(paymentSummary.contractorPayoutCents, paymentSummary.currency)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Router Fee (8%)</span>
                    <span>{formatMoney(paymentSummary.routerFeeCents, paymentSummary.currency)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Platform Fee (12%)</span>
                    <span>{formatMoney(paymentSummary.platformFeeCents, paymentSummary.currency)}</span>
                  </div>
                </div>
              </details>
            ) : null}

            {!clientSecret ? (
              <button
                type="button"
                onClick={() => void preparePaymentIntent()}
                disabled={working || appraisalPriceCents <= 0 || !appraisal || Boolean(stripeConfigBlockingError)}
                className="mt-4 rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-500 disabled:opacity-60"
              >
                {working ? "Preparing..." : "Confirm Total"}
              </button>
            ) : stripePromise && !stripeConfigBlockingError ? (
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
              <p className="mt-4 text-sm text-red-700">
                {stripeConfigBlockingError ? "Stripe checkout is blocked until configuration is corrected." : "Stripe publishable key is missing."}
              </p>
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
            <div className="mt-3 flex items-center justify-between rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm">
              <span className="text-gray-700">Stripe Status</span>
              {paymentConnected === true && paymentProviderReady === true ? (
                <span className="font-medium text-green-700">Online</span>
              ) : paymentConnected === false || paymentProviderReady === false ? (
                <span className="font-medium text-red-700">Offline</span>
              ) : (
                <span className="font-medium text-gray-600">Checking...</span>
              )}
            </div>
            <div className="mt-2 flex items-center justify-between rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm">
              <span className="text-gray-700">Payment</span>
              {paymentConfirmed ? (
                <span className="font-medium text-green-700">Paid</span>
              ) : (
                <span className="font-medium text-gray-600">Pending confirmation</span>
              )}
            </div>
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
      <AccountIncompleteModal
        role="JOB_POSTER"
        missing={incompleteMissing}
        open={showIncompleteModal}
        onClose={() => setShowIncompleteModal(false)}
      />
    </div>
  );
}
