"use client";

import React from "react";
import { formatMoney, formatStateProvince } from "@8fold/shared";
import { useRouter, useSearchParams } from "next/navigation";
import { createPortal } from "react-dom";
import { ErrorDisplay } from "@/components/ErrorDisplay";
import { LoadingSpinner } from "@/components/LoadingSpinner";
import { TermsCheckbox } from "@/components/TermsCheckbox";
import { PriceSlider, type PayoutBreakdown as UiBreakdown } from "@/components/PriceSlider";
import { JunkHaulingForm, type JunkItem } from "@/components/JunkHaulingForm";
import { PhotoUpload } from "@/components/PhotoUpload";
import { ProgressSteps } from "@/components/ProgressSteps";
import { AvailabilityGrid, normalizeAvailability, type Availability } from "@/components/AvailabilityGrid";
import { loadStripe } from "@stripe/stripe-js";
import { Elements, PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";
import {
  TradeCategorySchema,
  TradeCategoryLabel,
  calculatePayoutBreakdown,
  calculateRepeatContractorDiscountBreakdown,
} from "@8fold/shared";

// NOTE: Type-compat shim for React/Stripe types during `next build`.
const ElementsProvider = Elements as unknown as React.ComponentType<any>;
const PaymentElementProvider = PaymentElement as unknown as React.ComponentType<any>;

type Profile = {
  name: string;
  email: string;
  phone: string | null;
  address: string | null;
  city: string;
  stateProvince: string;
  country: "US" | "CA";
  lat: number | null;
  lng: number | null;
};

type DraftResponse = {
  job: {
    id: string;
    status: string;
    aiSuggestedTotal: number; // dollars
    aiPriceRange: { low: number; high: number }; // dollars
    aiConfidence: "low" | "medium" | "high";
    aiReasoning: string;
    aiAppraisedAt: string;
    breakdown: UiBreakdown;
  };
};

type PaymentIntentResponse = {
  ok: true;
  clientSecret: string;
};

type RepeatEligibleResponse =
  | { eligible: false; request: any | null }
  | {
      eligible: true;
      tradeCategory: string;
      priorJob: { id: string; priorJobDate: string; region: string };
      contractor: { id: string; businessName: string; trade: string; regionCode: string };
      request: any | null;
    };

type RepeatStatusResponse = { request: any | null; repeatContractorDiscountCents: number };

type WizardStep = 0 | 1 | 2 | 3 | 4;

function hasFullProfileAddress(p: Profile | null): boolean {
  if (!p) return false;
  return Boolean(
    (p.address ?? "").trim() &&
      (p.city ?? "").trim() &&
      (p.stateProvince ?? "").trim() &&
      (p.country ?? "").trim()
  );
}

type FieldKey =
  | "title"
  | "tradeCategory"
  | "jobType"
  | "address"
  | "scope"
  | "junkHaulingItems";

type FieldErrors = Partial<Record<FieldKey, string>>;

function truncateWords(input: string, maxWords: number): string {
  const s = String(input ?? "").trim();
  if (!s) return "";
  const words = s.split(/\s+/).filter(Boolean);
  if (words.length <= maxWords) return s;
  return `${words.slice(0, maxWords).join(" ")}…`;
}

function FixedReadOnlyTextArea({ value, rows = 4 }: { value: string; rows?: number }) {
  return (
    <textarea
      readOnly
      rows={rows}
      value={value}
      className="mt-2 w-full text-sm text-gray-600 bg-transparent resize-none border border-gray-100 rounded-lg px-3 py-2 leading-5 overflow-y-auto"
    />
  );
}


export default function JobPosterPostAJobPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const resumeJobId = String(searchParams.get("resumeJobId") ?? "").trim();
  const resumeMode = Boolean(resumeJobId);

  const stripePromise = React.useMemo(() => {
    const pk = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
    return pk ? loadStripe(pk) : null;
  }, []);

  const [step, setStep] = React.useState<WizardStep>(0);
  const [error, setError] = React.useState("");
  const [loading, setLoading] = React.useState(false);

  const [profile, setProfile] = React.useState<Profile | null>(null);
  const [profileForm, setProfileForm] = React.useState({
    name: "",
    email: "",
    phone: "",
    address: "",
    city: "",
    stateProvince: "",
    country: "US" as "US" | "CA",
  });

  const [details, setDetails] = React.useState({
    title: "",
    scope: "",
    tradeCategory: "HANDYMAN",
    jobType: "urban" as "urban" | "regional",
    timeWindow: "",
    postalCode: "",
    addressChoice: "profile" as "profile" | "different",
    manualStreet: "",
    manualCity: "",
  });
  const [junkItems, setJunkItems] = React.useState<JunkItem[]>([]);
  const [photoUrls, setPhotoUrls] = React.useState<string[]>([]);
  const [photoUploading, setPhotoUploading] = React.useState(false);

  const [jobId, setJobId] = React.useState<string | null>(null);
  const [aiSuggestedTotalCents, setAiSuggestedTotalCents] = React.useState<number>(0);
  const [aiRangeLowCents, setAiRangeLowCents] = React.useState<number>(0);
  const [aiRangeHighCents, setAiRangeHighCents] = React.useState<number>(0);
  const [aiConfidence, setAiConfidence] = React.useState<"low" | "medium" | "high">("medium");
  const [selectedPriceCents, setSelectedPriceCents] = React.useState<number>(0);
  const [aiReasoning, setAiReasoning] = React.useState<string>("");
  const [appraising, setAppraising] = React.useState(false);
  const [availability, setAvailability] = React.useState<Availability>({});

  const [repeatEligible, setRepeatEligible] = React.useState<RepeatEligibleResponse | null>(null);
  const [repeatChoice, setRepeatChoice] = React.useState<"UNKNOWN" | "YES" | "NO">("UNKNOWN");
  const [repeatStatus, setRepeatStatus] = React.useState<RepeatStatusResponse | null>(null);

  const [tosOk, setTosOk] = React.useState(false);
  const [clientSecret, setClientSecret] = React.useState<string | null>(null);
  const [awaitingFunding, setAwaitingFunding] = React.useState(false);

  const [submitAttempted, setSubmitAttempted] = React.useState(false);
  const [touched, setTouched] = React.useState<Partial<Record<FieldKey, boolean>>>({});
  const [fieldErrors, setFieldErrors] = React.useState<FieldErrors>({});
  const [jobTypeExplicitlySelected, setJobTypeExplicitlySelected] = React.useState(false);

  // "Different address" mode is manual-entry only (structured geocoding happens server-side).
  const appraisalAbortRef = React.useRef<AbortController | null>(null);

  const repeatEnabled = Boolean(repeatEligible && "eligible" in repeatEligible && repeatEligible.eligible);
  const repeatAccepted = repeatStatus?.request?.status === "ACCEPTED";
  const repeatRequested = repeatStatus?.request?.status === "REQUESTED";

  const computedBreakdown = React.useMemo(() => {
    const materials = 0;
    if (repeatAccepted) {
      const b = calculateRepeatContractorDiscountBreakdown(selectedPriceCents, materials);
      return {
        payout: {
          laborTotalCents: b.laborTotalCents,
          materialsTotalCents: b.materialsTotalCents,
          transactionFeeCents: b.transactionFeeCents,
          contractorPayoutCents: b.contractorPayoutCents,
          routerEarningsCents: b.routerEarningsCents,
          platformFeeCents: b.platformFeeCents,
          totalJobPosterPaysCents: b.totalJobPosterPaysAfterDiscountCents,
        } satisfies UiBreakdown,
        discountCents: b.repeatContractorDiscountCents,
      };
    }
    const b = calculatePayoutBreakdown(selectedPriceCents, materials);
    return { payout: b as UiBreakdown, discountCents: 0 };
  }, [repeatAccepted, selectedPriceCents]);

  function validateDetails(): { ok: boolean; errors: FieldErrors; junkRowErrors: Array<{ category?: string; item?: string; quantity?: string }> } {
    const errors: FieldErrors = {};
    const title = details.title.trim();
    if (title.length < 5) errors.title = "Please enter at least 5 characters";

    if (!String(details.tradeCategory ?? "").trim()) errors.tradeCategory = "Trade category is required";
    if (details.jobType !== "urban" && details.jobType !== "regional") errors.jobType = "Job type is required";

    const scope = details.scope.trim();
    if (scope.length < 20) errors.scope = "Please enter at least 20 characters";

    // Address: profile OR manual entry (different address flow).
    if (details.addressChoice === "different") {
      if (!details.manualStreet.trim() || !details.manualCity.trim()) {
        errors.address = "Enter a street address and city";
      }
    } else {
      // profile address required by gating, but still validate for confidence.
      const hasCoords = profile && Number.isFinite(profile.lat as any) && Number.isFinite(profile.lng as any);
      if (!profile?.address?.trim() || !profile?.city?.trim() || !hasCoords) {
        errors.address = "Select an address or enter one manually";
      }
    }

    const junkRowErrors =
      details.tradeCategory === "JUNK_REMOVAL"
        ? (junkItems ?? []).map((it) => {
            const row: { category?: string; item?: string; quantity?: string } = {};
            if (!String((it as any).category ?? "").trim()) row.category = "Category is required";
            if (!String((it as any).item ?? "").trim()) row.item = "Please enter an item";
            const q = Number((it as any).quantity);
            if (!Number.isInteger(q) || q < 1) row.quantity = "Quantity must be at least 1";
            return row;
          })
        : [];

    if (details.tradeCategory === "JUNK_REMOVAL") {
      if (!junkItems || junkItems.length < 1) {
        errors.junkHaulingItems = "Please add at least 1 item";
      } else {
        const anyRowBad = junkRowErrors.some((r) => r.category || r.item || r.quantity);
        if (anyRowBad) errors.junkHaulingItems = "Please fix the highlighted item rows";
      }
    }

    return { ok: Object.keys(errors).length === 0, errors, junkRowErrors };
  }

  function showStatus(key: FieldKey): boolean {
    return Boolean(submitAttempted || touched[key]);
  }

  function statusFor(key: FieldKey): "neutral" | "valid" | "invalid" {
    if (!showStatus(key)) return "neutral";
    if (fieldErrors[key]) return "invalid";
    return "valid";
  }

  function touch(key: FieldKey) {
    setTouched((t) => ({ ...t, [key]: true }));
  }

  async function loadProfileAndGate() {
    setError("");
    const resp = await fetch("/api/app/job-poster/profile", { cache: "no-store" });
    const json = await resp.json().catch(() => null);
    if (!resp.ok) throw new Error(json?.error ?? "Failed to load profile");
    const p = (json?.profile ?? null) as Profile | null;
    setProfile(p);
    if (p) {
      setProfileForm({
        name: p.name ?? "",
        email: p.email ?? "",
        phone: p.phone ?? "",
        address: p.address ?? "",
        city: p.city ?? "",
        stateProvince: p.stateProvince ?? "",
        country: (p.country ?? "US") as any,
      });
    }
    setStep(hasFullProfileAddress(p) ? 1 : 0);
  }

  React.useEffect(() => {
    let alive = true;
    (async () => {
      try {
        setLoading(true);
        await loadProfileAndGate();
      } catch (e) {
        if (!alive) return;
        setError(e instanceof Error ? e.message : "Failed");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  React.useEffect(() => {
    let alive = true;
    if (!resumeMode) return;
    if (!profile) return;
    void (async () => {
      try {
        setLoading(true);
        setError("");
        const resp = await fetch(`/api/app/job-poster/drafts/${encodeURIComponent(resumeJobId)}`, {
          cache: "no-store",
        });
        const json = (await resp.json().catch(() => ({}))) as any;
        if (!resp.ok) throw new Error(json?.error ?? "Failed to load draft");
        if (!alive) return;
        const d = json?.draft ?? null;
        if (!d?.id) throw new Error("Draft not found");
        setJobId(String(d.id));

        const data = (d.data ?? null) as any;
        const addr = data?.address ?? null;
        const savedJobTitle = String(data?.jobTitle ?? "").trim();
        const savedScope = String(data?.scope ?? "").trim();
        const savedTrade = String(data?.tradeCategory ?? "").trim();
        const savedJobType = data?.jobType === "regional" ? "regional" : "urban";

        setDetails((s) => ({
          ...s,
          title: savedJobTitle || s.title,
          scope: savedScope || s.scope,
          tradeCategory: (savedTrade || s.tradeCategory) as any,
          jobType: savedJobType as any,
          timeWindow: String(data?.timeWindow ?? s.timeWindow ?? ""),
          postalCode: String(addr?.postalCode ?? s.postalCode ?? ""),
          addressChoice: "profile",
          manualStreet: "",
          manualCity: "",
        }));

        const items = Array.isArray(data?.items) ? data.items : [];
        const restoredJunk = items.map((it: any) => ({
          category: String(it?.category ?? "").trim() || "Furniture",
          item: String(it?.description ?? "").trim(),
          quantity: Number(it?.quantity) || 1,
          notes: String(it?.notes ?? "").trim() || undefined,
        }));
        setJunkItems(restoredJunk as any);

        const photoUrlsNext = Array.isArray(d.photoUrls) ? d.photoUrls : [];
        setPhotoUrls(photoUrlsNext);

        const suggestedCents = Math.round((Number(d?.aiSuggestedTotal ?? 0) || 0) * 100);
        const lowCents = Math.round((Number(d?.aiPriceRange?.low ?? 0) || 0) * 100);
        const highCents = Math.round((Number(d?.aiPriceRange?.high ?? 0) || 0) * 100);
        setAiSuggestedTotalCents(suggestedCents);
        setAiRangeLowCents(lowCents);
        setAiRangeHighCents(highCents);
        setAiConfidence((d?.aiConfidence ?? "medium") as any);
        setAiReasoning(truncateWords(String(d?.aiReasoning ?? ""), 150));
        if (suggestedCents > 0) setSelectedPriceCents(suggestedCents);

        const wiz = String(d?.wizardStep ?? "").toUpperCase();
        if (wiz === "PAYMENT") setStep(3);
        else if (wiz === "PRICING" && suggestedCents > 0) setStep(2);
        else setStep(1);
      } catch (e) {
        if (!alive) return;
        setError(e instanceof Error ? e.message : "Failed");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [profile, resumeJobId, resumeMode]);

  async function saveProfile() {
    setLoading(true);
    setError("");
    try {
      const resp = await fetch("/api/app/job-poster/profile", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: profileForm.name,
          email: profileForm.email,
          phone: profileForm.phone || undefined,
          address: profileForm.address,
          city: profileForm.city,
          stateProvince: profileForm.stateProvince,
          country: profileForm.country,
        }),
      });
      const json = await resp.json().catch(() => null);
      if (!resp.ok) throw new Error(json?.error ?? "Failed to save profile");
      await loadProfileAndGate();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setLoading(false);
    }
  }

  async function createDraftFromDetails() {
    if (!profile) throw new Error("Missing profile");
    if (loading || appraising) return;
    if (appraisalAbortRef.current) return;
    if (photoUploading) {
      setError("Please wait for photo upload to finish before saving.");
      return;
    }
    setSubmitAttempted(true);
    const v = validateDetails();
    setFieldErrors(v.errors);
    if (!v.ok) return;

    const stateProvince = profile.stateProvince;
    const addrMode = details.addressChoice;

    let city = "";
    let address = "";
    let postalCode = details.postalCode || "";
    let lat: number | null = null;
    let lng: number | null = null;
    let addressMode: "PROFILE" | "AUTO" | "MANUAL" = "PROFILE";

    if (addrMode === "profile") {
      city = String(profile.city ?? "").trim();
      address = String(profile.address ?? "").trim();
      lat = typeof profile.lat === "number" ? profile.lat : null;
      lng = typeof profile.lng === "number" ? profile.lng : null;
      addressMode = "PROFILE";
    } else {
      address = details.manualStreet.trim();
      city = details.manualCity.trim();
      addressMode = "MANUAL";
    }

    const itemsFromRows = (junkItems ?? [])
      .map((it: any) => ({
        category: String(it?.category ?? "").trim(),
        description: String(it?.item ?? "").trim(),
        quantity: Number(it?.quantity),
        ...(String(it?.notes ?? "").trim() ? { notes: String(it?.notes ?? "").trim() } : {}),
      }))
      .filter((it: any) => it.category && it.description && Number.isInteger(it.quantity) && it.quantity >= 1);
    const items =
      details.tradeCategory === "JUNK_REMOVAL" || details.tradeCategory === "FURNITURE_ASSEMBLY"
        ? (itemsFromRows.length
            ? itemsFromRows
            : [
                {
                  category: details.tradeCategory === "FURNITURE_ASSEMBLY" ? "Furniture" : "General",
                  description: details.scope.trim(),
                  quantity: 1,
                },
              ])
        : [
            {
              category: "General",
              description: details.scope.trim(),
              quantity: 1,
            },
          ];

    setLoading(true);
    setError("");
    try {
      // 1) Persist draft immediately (non-abortable).
      const saveResp = await fetch("/api/app/job-poster/drafts/save", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          readyForAppraisal: true,
          jobId: jobId ?? undefined,
          jobTitle: details.title.trim(),
          scope: details.scope.trim(),
          tradeCategory: details.tradeCategory,
          jobType: details.jobType,
          ...(details.timeWindow.trim() ? { timeWindow: details.timeWindow.trim() } : {}),
          address: {
            street: address.trim(),
            city: city.trim(),
            provinceOrState: stateProvince.trim(),
            country: (profile.country ?? "US") as any,
            ...(String(postalCode || "").trim() ? { postalCode: String(postalCode || "").trim() } : {}),
          },
          ...(typeof lat === "number" && Number.isFinite(lat) && typeof lng === "number" && Number.isFinite(lng)
            ? { geo: { lat, lng } }
            : {}),
          items,
          ...(photoUrls.length ? { photoUrls: photoUrls.slice(0, 5) } : {}),
        }),
      });
      const saveJson = (await saveResp.json().catch(() => null)) as any;
      if (saveJson && saveJson.ok === false) {
        setError(String(saveJson?.message ?? saveJson?.meta?.message ?? "Failed to save draft"));
        return;
      }
      if (!saveResp.ok) {
        setError(String(saveJson?.error ?? "Failed to save draft"));
        const fe = saveJson?.fieldErrors ?? null;
        if (fe && typeof fe === "object") {
          const next: FieldErrors = {};
          if (typeof fe.jobTitle === "string") next.title = fe.jobTitle;
          if (typeof fe.tradeCategory === "string") next.tradeCategory = fe.tradeCategory;
          if (typeof fe.jobType === "string") next.jobType = fe.jobType;
          if (typeof fe.items === "string") next.scope = fe.items;
          if (typeof fe.address === "string") next.address = fe.address;
          setFieldErrors((prev) => ({ ...prev, ...next }));
          return;
        }
        return;
      }
      const savedId = String(saveJson?.job?.id ?? "").trim();
      if (savedId) setJobId(savedId);

      // Repeat contractor selection lives on Job Details; if chosen and eligible, persist it with this draft.
      void (async () => {
        try {
          if (!savedId) return;
          const eligResp = await fetch(
            `/api/app/job-poster/repeat-contractor/eligible?jobId=${encodeURIComponent(savedId)}`,
            { cache: "no-store" }
          );
          const eligJson = (await eligResp.json().catch(() => null)) as RepeatEligibleResponse | { error?: string } | null;
          if (!eligResp.ok) return;
          setRepeatEligible(eligJson as RepeatEligibleResponse);
          if ((eligJson as any)?.eligible && repeatChoice === "YES") {
            const rr = eligJson as any;
            await fetch("/api/app/job-poster/repeat-contractor/request", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({
                jobId: savedId,
                contractorId: rr.contractor?.id,
                priorJobId: rr.priorJob?.id,
              }),
            }).catch(() => null);
          }
        } catch {
          // non-blocking
        }
      })();

      // 2) Start appraisal (abortable).
      if (!savedId) return;
      setAppraising(true);
      const controller = new AbortController();
      appraisalAbortRef.current = controller;
      const apprResp = await fetch(`/api/app/job-poster/drafts/${encodeURIComponent(savedId)}/start-appraisal`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        signal: controller.signal,
      });
      const apprJson = (await apprResp.json().catch(() => null)) as any;
      if (!apprResp.ok) {
        if (apprResp.status === 202) {
          setError(
            "Sorry, our automated appraisal system is temporarily unavailable.\nWe’ve sent your job to our Admin team for a quick manual appraisal.\nYou’ll receive a message shortly with a secure link to continue."
          );
          setTimeout(() => router.push("/app/job-poster"), 900);
          return;
        }
        throw new Error(String(apprJson?.error ?? "Appraisal failed"));
      }

      const j = (apprJson as DraftResponse).job ?? (apprJson?.job ?? null);
      const suggestedCents = Math.round((Number(j?.aiSuggestedTotal ?? 0) || 0) * 100);
      const lowCents = Math.round((Number(j?.aiPriceRange?.low ?? 0) || 0) * 100);
      const highCents = Math.round((Number(j?.aiPriceRange?.high ?? 0) || 0) * 100);
      setAiSuggestedTotalCents(suggestedCents);
      setAiRangeLowCents(lowCents);
      setAiRangeHighCents(highCents);
      setAiConfidence((j?.aiConfidence ?? "medium") as any);
      setSelectedPriceCents(suggestedCents);
      setAiReasoning(truncateWords(String(j?.aiReasoning ?? ""), 150));
      setStep(2);
    } finally {
      appraisalAbortRef.current = null;
      setAppraising(false);
      setLoading(false);
    }
  }

  async function refreshRepeatStatus() {
    if (!jobId) return;
    const resp = await fetch(`/api/app/job-poster/repeat-contractor/status?jobId=${encodeURIComponent(jobId)}`, {
      cache: "no-store",
    });
    const json = (await resp.json().catch(() => null)) as RepeatStatusResponse | { error?: string } | null;
    if (!resp.ok) throw new Error((json as any)?.error ?? "Failed to load repeat contractor status");
    setRepeatStatus(json as RepeatStatusResponse);
  }

  async function requestRepeatContractor() {
    if (!jobId) return;
    if (!repeatEligible || !("eligible" in repeatEligible) || !repeatEligible.eligible) return;
    setLoading(true);
    setError("");
    try {
      const resp = await fetch("/api/app/job-poster/repeat-contractor/request", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          jobId,
          contractorId: repeatEligible.contractor.id,
          priorJobId: repeatEligible.priorJob.id,
        }),
      });
      const json = await resp.json().catch(() => null);
      if (!resp.ok) throw new Error(json?.error ?? "Failed to create request");
      await refreshRepeatStatus();
    } finally {
      setLoading(false);
    }
  }

  async function cancelRepeatContractor() {
    if (!jobId) return;
    setLoading(true);
    setError("");
    try {
      const resp = await fetch("/api/app/job-poster/repeat-contractor/cancel", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jobId }),
      });
      const json = await resp.json().catch(() => null);
      if (!resp.ok) throw new Error(json?.error ?? "Failed to cancel");
      await refreshRepeatStatus();
    } finally {
      setLoading(false);
    }
  }

  async function createPaymentIntent() {
    if (!jobId) return;
    if (!tosOk) {
      setError("You must agree to the Terms & Conditions before payment.");
      return;
    }
    if (repeatChoice === "YES" && repeatRequested && !repeatAccepted) {
      setError("Waiting for the repeat contractor to accept. Refresh status or continue normally.");
      return;
    }

    setError("");
    setLoading(true);
    try {
      const resp = await fetch(`/api/app/job-poster/jobs/${jobId}/create-payment-intent`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ selectedPriceCents, availability: normalizeAvailability(availability) }),
      });
      const json = (await resp.json().catch(() => null)) as PaymentIntentResponse | { error?: string } | null;
      if (!resp.ok) throw new Error((json as any)?.error ?? "Failed to create payment intent");

      setClientSecret((json as PaymentIntentResponse).clientSecret);
    } finally {
      setLoading(false);
    }
  }

  async function pollUntilFunded(nextJobId: string) {
    const started = Date.now();
    const timeoutMs = 90_000;
    while (Date.now() - started < timeoutMs) {
      const resp = await fetch(`/api/app/job-poster/jobs/${encodeURIComponent(nextJobId)}/payment-status`, {
        cache: "no-store",
      });
      const json = (await resp.json().catch(() => null)) as any;
      if (!resp.ok) throw new Error(json?.error ?? "Failed to load payment status");
      const ps = String(json?.job?.paymentStatus ?? "");
      if (ps === "FUNDED") return;
      if (ps === "FAILED") throw new Error("Payment failed. Please try again.");
      if (ps === "REFUNDED") throw new Error("Payment was refunded.");
      await new Promise((r) => setTimeout(r, 2000));
    }
    throw new Error("Payment is still processing. Please refresh in a moment.");
  }

  const steps = [
    { label: "Profile" },
    { label: "Job Details" },
    { label: "Pricing & Availability" },
    { label: "Payment" },
    { label: "Confirmed" },
  ] as const;

  return (
    <>
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
      <h2 className="text-lg font-bold text-gray-900">Post a Job</h2>
      <p className="text-gray-600 mt-2">
            A structured flow that keeps pricing and routing predictable. You can only post jobs in your profile’s
            state/province.
          </p>
        </div>
        <ProgressSteps currentIdx={step} steps={steps} />
      </div>

      <ErrorDisplay message={error} />

      {appraising ? (
        <div className="fixed inset-0 z-[1000] bg-black/40 flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl border border-gray-200 p-6 text-center">
            <div className="flex justify-center">
              <LoadingSpinner label="" />
            </div>
            <div className="mt-4 text-base font-bold text-gray-900">Analyzing your job and generating pricing…</div>
            <div className="mt-2 text-sm text-gray-600">This usually takes a few seconds.</div>
            <div className="mt-5 flex justify-center">
              <button
                type="button"
                onClick={() => {
                  try {
                    appraisalAbortRef.current?.abort();
                  } catch {}
                  appraisalAbortRef.current = null;
                  setAppraising(false);
                  setLoading(false);
                }}
                className="border border-gray-300 text-gray-700 hover:bg-gray-50 font-semibold px-5 py-2.5 rounded-lg"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {step === 0 ? (
        <div className="mt-6 border border-gray-200 rounded-xl p-5">
          <div className="text-lg font-bold text-gray-900">Profile</div>
          <div className="text-gray-600 mt-1">
            Before posting a job, your profile must include your full address (street, city, state/province, country).
          </div>

          <div className="mt-5 grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="Full name" value={profileForm.name} onChange={(v) => setProfileForm((s) => ({ ...s, name: v }))} />
            <Field label="Email" value={profileForm.email} onChange={(v) => setProfileForm((s) => ({ ...s, email: v }))} />
            <Field label="Phone" value={profileForm.phone} onChange={(v) => setProfileForm((s) => ({ ...s, phone: v }))} />
            <Field label="Street address" value={profileForm.address} onChange={(v) => setProfileForm((s) => ({ ...s, address: v }))} />
            <Field label="City" value={profileForm.city} onChange={(v) => setProfileForm((s) => ({ ...s, city: v }))} />
            <Field
              label="State / Province"
              value={profileForm.stateProvince}
              onChange={(v) => setProfileForm((s) => ({ ...s, stateProvince: v }))}
            />
          </div>

          <div className="mt-6">
            <button
              onClick={() => void saveProfile()}
              className="bg-8fold-green text-white hover:bg-8fold-green-dark font-semibold px-5 py-2.5 rounded-lg"
            >
              Save & continue
            </button>
          </div>
        </div>
      ) : null}

      {step === 1 ? (
      <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
          {submitAttempted && Object.keys(fieldErrors).length ? (
            <div className="md:col-span-2 border border-red-200 bg-red-50 text-red-800 rounded-xl p-4 text-sm font-semibold">
              Please fix the highlighted fields below to continue.
            </div>
          ) : null}

          <div className="md:col-span-2 border border-gray-200 rounded-xl p-4 bg-gray-50">
            <div className="text-sm font-semibold text-gray-700">Job Location (State / Province)</div>
            <div className="mt-1 text-sm font-mono text-gray-900">{formatStateProvince(profile?.stateProvince)}</div>
          </div>

          <Field
            label="Job Title"
            value={details.title}
            onChange={(v) => setDetails((s) => ({ ...s, title: v }))}
            onBlur={() => {
              touch("title");
              setFieldErrors(validateDetails().errors);
            }}
            status={statusFor("title")}
            helperText={fieldErrors.title}
          />
          <Select
            label="Trade Category"
            value={details.tradeCategory}
            onChange={(v) => setDetails((s) => ({ ...s, tradeCategory: v }))}
            onBlur={() => {
              touch("tradeCategory");
              setFieldErrors(validateDetails().errors);
            }}
            status={statusFor("tradeCategory")}
            helperText={fieldErrors.tradeCategory}
            options={TradeCategorySchema.options.map((k) => ({ value: k, label: TradeCategoryLabel[k] }))}
          />

          <JobTypeSelect
            value={details.jobType}
            country={(profile?.country ?? profileForm.country ?? "US") as any}
            onChange={(v) => {
              setJobTypeExplicitlySelected(true);
              touch("jobType");
              setDetails((s) => ({ ...s, jobType: v }));
            }}
            onBlur={() => {
              setFieldErrors(validateDetails().errors);
            }}
            status={statusFor("jobType")}
            showCheckmark={jobTypeExplicitlySelected}
            helperText={fieldErrors.jobType}
          />

          <div className="md:col-span-2 border border-gray-200 rounded-xl p-4">
            <div className="text-sm font-semibold text-gray-900">Repeat Contractor (optional)</div>
            <div className="text-sm text-gray-600 mt-1">Select only if you want to request the same contractor (if available) for this trade.</div>
            <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-2 text-sm">
              <label className="flex items-start gap-2">
                <input
                  type="radio"
                  checked={repeatChoice === "UNKNOWN"}
                  onChange={() => setRepeatChoice("UNKNOWN")}
                  className="mt-1 h-4 w-4"
                />
                <span className="font-semibold text-gray-900">No preference</span>
              </label>
              <label className="flex items-start gap-2">
                <input
                  type="radio"
                  checked={repeatChoice === "YES"}
                  onChange={() => setRepeatChoice("YES")}
                  className="mt-1 h-4 w-4"
                />
                <span className="font-semibold text-gray-900">Request same contractor</span>
              </label>
              <label className="flex items-start gap-2">
                <input
                  type="radio"
                  checked={repeatChoice === "NO"}
                  onChange={() => setRepeatChoice("NO")}
                  className="mt-1 h-4 w-4"
                />
                <span className="font-semibold text-gray-900">Do not request</span>
              </label>
            </div>
          </div>

          <Field
            label="Time Window (optional)"
            value={details.timeWindow}
            onChange={(v) => setDetails((s) => ({ ...s, timeWindow: v }))}
          />

          <div className="md:col-span-2 border border-gray-200 rounded-xl p-4">
            <div className="text-sm font-semibold text-gray-900 flex items-center justify-between">
              <span>Address</span>
              {showStatus("address") ? (
                fieldErrors.address ? (
                  <span className="text-red-600 font-bold">✕</span>
                ) : (
                  <span className="text-green-600 font-bold">✓</span>
                )
              ) : null}
            </div>
            <div className="text-sm text-gray-600 mt-1">
              Choose your job address. State/Province is always your profile state/province.
            </div>

            <div className="mt-3 space-y-2">
              <label className="flex items-start gap-3">
                <input
                  type="radio"
                  checked={details.addressChoice === "profile"}
                  onChange={() => {
                    setDetails((s) => ({ ...s, addressChoice: "profile" }));
                    touch("address");
                    setFieldErrors(validateDetails().errors);
                  }}
                  className="mt-1 h-4 w-4"
                />
                <div>
                  <div className="font-semibold text-gray-900">Use my profile address</div>
                  <div className="text-sm text-gray-600">
                    {(profile?.address ?? "").trim()
                      ? `${profile?.address}, ${profile?.city}, ${profile?.stateProvince}`
                      : "Complete your profile to use this option."}
                  </div>
                </div>
              </label>

              <label className="flex items-start gap-3">
                <input
                  type="radio"
                  checked={details.addressChoice === "different"}
                  onChange={() =>
                    setDetails((s) => ({
                      ...s,
                      addressChoice: "different",
                    }))
                  }
                  className="mt-1 h-4 w-4"
                />
                <div className="flex-1">
                  <div className="font-semibold text-gray-900">Use a different address</div>
                  <div className="text-sm text-gray-600">
                    Enter a street address and city (US/Canada). We geocode it server-side.
                  </div>

                  {details.addressChoice === "different" ? (
                    <div className="mt-2">
                      <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
                        <Field
                          label="Street address"
                          value={details.manualStreet}
                          onChange={(v) => setDetails((s) => ({ ...s, manualStreet: v }))}
                          onBlur={() => {
                            touch("address");
                            setFieldErrors(validateDetails().errors);
                          }}
                          status={statusFor("address")}
                          helperText={fieldErrors.address}
                        />
                        <Field
                          label="City"
                          value={details.manualCity}
                          onChange={(v) => setDetails((s) => ({ ...s, manualCity: v }))}
                          onBlur={() => {
                            touch("address");
                            setFieldErrors(validateDetails().errors);
                          }}
                          status={statusFor("address")}
                          helperText={fieldErrors.address}
                        />
                      </div>
                    </div>
                  ) : null}
                </div>
              </label>
            </div>
          </div>

          <TextArea
            label="Scope / Details"
            value={details.scope}
            onChange={(v) => setDetails((s) => ({ ...s, scope: v }))}
            onBlur={() => {
              touch("scope");
              setFieldErrors(validateDetails().errors);
            }}
            status={statusFor("scope")}
            helperText={fieldErrors.scope}
            className="md:col-span-2"
          />

          <div className="md:col-span-2">
            <PhotoUpload urls={photoUrls} onChange={setPhotoUrls} onUploadingChange={setPhotoUploading} />
          </div>

          {details.tradeCategory === "JUNK_REMOVAL" || details.tradeCategory === "FURNITURE_ASSEMBLY" ? (
            <div className="md:col-span-2">
              {(() => {
                const v = validateDetails();
                return (
                  <>
                    <JunkHaulingForm
                      items={junkItems as any}
                      onChange={(next) => {
                        touch("junkHaulingItems");
                        setJunkItems(next as any);
                        if (submitAttempted || touched.junkHaulingItems) {
                          setFieldErrors(validateDetails().errors);
                        }
                      }}
                      showValidation={showStatus("junkHaulingItems")}
                      forceShowAll={submitAttempted}
                      rowErrors={v.junkRowErrors}
                      title={
                        details.tradeCategory === "FURNITURE_ASSEMBLY" ? "Items to assemble (recommended)" : "Junk hauling items"
                      }
                      helper={
                        details.tradeCategory === "FURNITURE_ASSEMBLY"
                          ? "Add the furniture items you need assembled. This helps the AI price assembly time and complexity."
                          : "Add items and quantities. This helps the AI generate an accurate median price."
                      }
                      defaultCategory="Furniture"
                      itemPlaceholder={
                        details.tradeCategory === "FURNITURE_ASSEMBLY"
                          ? 'e.g., "IKEA bed frame", "office desk", "bookshelf"'
                          : 'e.g., "coffee table", "lawnmower", "flattened boxes"'
                      }
                    />
                    {showStatus("junkHaulingItems") && fieldErrors.junkHaulingItems ? (
                      <div className="mt-2 text-xs text-red-600">{fieldErrors.junkHaulingItems}</div>
                    ) : null}
                  </>
                );
              })()}
            </div>
          ) : null}

          <div className="md:col-span-2">
            <button
              onClick={() => void createDraftFromDetails().catch((e) => setError(e instanceof Error ? e.message : "Failed"))}
              disabled={loading || appraising || photoUploading || !validateDetails().ok}
              className="bg-8fold-green text-white hover:bg-8fold-green-dark disabled:bg-gray-200 disabled:text-gray-500 font-semibold px-5 py-2.5 rounded-lg"
            >
              {photoUploading ? "Uploading photos…" : appraising ? "Analyzing your job…" : "Start Pricing Appraisal for Your Job"}
            </button>
          </div>
        </div>
      ) : null}

      {step === 2 ? (
        <div className="mt-6">
          <h3 className="text-lg font-bold text-gray-900">Pricing & Availability</h3>
          <p className="text-gray-600 mt-1">Confirm pricing, then optionally add availability to guide scheduling.</p>

          <div className="border border-gray-200 rounded-xl p-4 mb-4 bg-gray-50">
            <div className="text-sm font-semibold text-gray-900">AI Suggested Total (locked baseline)</div>
            <div className="mt-1 text-2xl font-extrabold text-gray-900">
              {formatMoney(aiSuggestedTotalCents, ((profile?.country ?? "US") === "CA" ? "CAD" : "USD") as any)}
            </div>
            <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm text-gray-700">
              <div>
                <div className="text-xs font-semibold text-gray-500">Confidence</div>
                <div className="font-semibold">
                  {aiConfidence === "high" ? "90%" : aiConfidence === "medium" ? "75%" : "60%"}
                </div>
              </div>
              <div>
                <div className="text-xs font-semibold text-gray-500">Price range</div>
                <div className="font-semibold">
                  {formatMoney(aiRangeLowCents, ((profile?.country ?? "US") === "CA" ? "CAD" : "USD") as any)} –{" "}
                  {formatMoney(aiRangeHighCents, ((profile?.country ?? "US") === "CA" ? "CAD" : "USD") as any)}
                </div>
              </div>
            </div>
          </div>

          <div className="border border-gray-200 rounded-xl p-4 mb-4">
            <div className="text-sm font-semibold text-gray-900">Pricing rationale</div>
            <FixedReadOnlyTextArea value={truncateWords(aiReasoning || "", 150) || "—"} rows={4} />
          </div>

          {repeatChoice === "YES" ? (
            <div className="border border-gray-200 rounded-xl p-4 mb-4 bg-gray-50">
              <div className="text-sm font-semibold text-gray-900">Repeat Contractor Discount (Router Fee)</div>
              <div className="text-sm text-gray-600 mt-1">
                {repeatAccepted
                  ? "Accepted — discount will be applied at payment."
                  : repeatRequested
                    ? "Pending acceptance — payment will be blocked until accepted or you continue normally."
                    : "Not applied."}
              </div>
              <div className="mt-3 flex gap-2 flex-wrap">
                <button onClick={() => void refreshRepeatStatus().catch((e) => setError(e instanceof Error ? e.message : "Failed"))} className="border border-gray-300 text-gray-700 hover:bg-gray-50 font-semibold px-4 py-2 rounded-lg">
                  Refresh status
                </button>
                {repeatRequested && !repeatAccepted ? (
                  <button onClick={() => void cancelRepeatContractor().catch((e) => setError(e instanceof Error ? e.message : "Failed"))} className="border border-gray-300 text-gray-700 hover:bg-gray-50 font-semibold px-4 py-2 rounded-lg">
                    Continue normally
                  </button>
                ) : null}
              </div>
            </div>
          ) : null}

          <PriceSlider
            aiSuggestedTotalCents={aiSuggestedTotalCents}
            minCents={aiRangeLowCents || undefined}
            maxCents={aiRangeHighCents || undefined}
            selectedPriceCents={selectedPriceCents}
            onChangeSelectedPriceCents={setSelectedPriceCents}
            breakdown={computedBreakdown.payout}
            currency={((profile?.country ?? "US") === "CA" ? "CAD" : "USD") as any}
          />

          <AvailabilityGrid value={availability} onChange={setAvailability} />

          {repeatAccepted && computedBreakdown.discountCents > 0 ? (
            <div className="mt-4 border border-green-200 bg-green-50 text-green-800 rounded-xl p-4 text-sm">
              <div className="font-semibold">
                Repeat Contractor Discount (Router Fee): -{formatMoney(computedBreakdown.discountCents, ((profile?.country ?? "US") === "CA" ? "CAD" : "USD") as any)}
              </div>
              <div className="mt-1">This discount applies only because the repeat contractor accepted before payment.</div>
            </div>
          ) : null}

          <div className="mt-5 flex gap-3">
            {!resumeMode ? (
              <button onClick={() => setStep(1)} className="border border-gray-300 text-gray-700 hover:bg-gray-50 font-semibold px-5 py-2.5 rounded-lg">
                Back
              </button>
            ) : null}
            <button
              onClick={() => {
                if (jobId) {
                  void fetch(`/api/app/job-poster/drafts/${encodeURIComponent(jobId)}/wizard-step`, {
                    method: "POST",
                    headers: { "content-type": "application/json" },
                    body: JSON.stringify({ step: "PAYMENT" }),
                  }).catch(() => null);
                }
                setStep(3);
              }}
              className="bg-8fold-green text-white hover:bg-8fold-green-dark font-semibold px-5 py-2.5 rounded-lg"
            >
              Continue to payment
            </button>
          </div>
        </div>
      ) : null}

      {step === 3 ? (
        <div className="mt-6">
          {repeatChoice === "YES" && repeatRequested && !repeatAccepted ? (
            <div className="border border-amber-200 bg-amber-50 text-amber-900 rounded-xl p-5">
              <div className="font-bold">Waiting for contractor acceptance</div>
              <div className="mt-1 text-sm">
                Discount is applied only after the contractor accepts. Refresh status, or continue normally with standard
                routing.
              </div>
              <div className="mt-4 flex gap-2 flex-wrap">
                <button onClick={() => void refreshRepeatStatus().catch((e) => setError(e instanceof Error ? e.message : "Failed"))} className="bg-white border border-amber-300 text-amber-900 hover:bg-amber-100 font-semibold px-4 py-2 rounded-lg">
                  Refresh status
                </button>
                <button onClick={() => void cancelRepeatContractor().catch((e) => setError(e instanceof Error ? e.message : "Failed"))} className="bg-white border border-amber-300 text-amber-900 hover:bg-amber-100 font-semibold px-4 py-2 rounded-lg">
                  Continue normally
                </button>
              </div>
            </div>
          ) : null}

          <div className="mt-4">
            <TermsCheckbox checked={tosOk} onChange={setTosOk} />
      </div>

          <div className="mt-6">
            <button
              onClick={() => void createPaymentIntent().catch((e) => setError(e instanceof Error ? e.message : "Failed"))}
              disabled={loading}
              className="bg-8fold-green text-white hover:bg-8fold-green-dark disabled:bg-gray-200 disabled:text-gray-500 font-semibold px-5 py-2.5 rounded-lg"
            >
              Create payment intent
            </button>
      <button
              onClick={() => {
                if (jobId) {
                  void fetch(`/api/app/job-poster/drafts/${encodeURIComponent(jobId)}/wizard-step`, {
                    method: "POST",
                    headers: { "content-type": "application/json" },
                    body: JSON.stringify({ step: "PRICING" }),
                  }).catch(() => null);
                }
                setStep(2);
              }}
              className="ml-3 border border-gray-300 text-gray-700 hover:bg-gray-50 font-semibold px-5 py-2.5 rounded-lg"
      >
              Back
      </button>
          </div>

          {clientSecret && jobId ? (
            <div className="mt-6">
              {!stripePromise ? (
                <div className="border border-gray-200 rounded-xl p-5">
                  <div className="text-sm text-gray-700">
                    Stripe publishable key is not configured for this local environment.
                  </div>
                  <div className="mt-2 text-xs text-gray-500">
                    Set <span className="font-mono">NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY</span> in{" "}
                    <span className="font-mono">apps/web/.env.local</span>.
                  </div>
                </div>
              ) : (
                <ElementsProvider stripe={stripePromise} options={{ clientSecret }}>
                  <StripePaymentForm
                    jobId={jobId}
                    onProcessingStart={() => setAwaitingFunding(true)}
                    onProcessingEnd={() => setAwaitingFunding(false)}
                    onFunded={async () => {
                      await pollUntilFunded(jobId);
                      setStep(4);
                      setTimeout(() => router.push("/app/job-poster"), 400);
                    }}
                    onError={(m) => setError(m)}
                  />
                </ElementsProvider>
              )}
              {awaitingFunding ? (
                <div className="mt-4 text-sm text-gray-700">
                  Processing… payment confirmed. Waiting for the webhook to mark this job as <b>FUNDED</b>.
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}

      {step === 4 ? (
        <div className="mt-8 border border-gray-200 rounded-xl p-5">
          <div className="text-lg font-bold text-gray-900">Confirmed</div>
          <div className="text-gray-600 mt-1">
            Your job is confirmed. Next: contractor acceptance (repeat) or routing (standard). Reminder: the 7-day
            contact guarantee is voided if you contact contractors directly before the system asks you to.
          </div>
          <div className="mt-4 text-sm text-gray-700">Redirecting you to your Job Poster dashboard…</div>
        </div>
      ) : null}
    </>
  );
}

function Field({
  label,
  value,
  onChange,
  onBlur,
  status = "neutral",
  helperText,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  onBlur?: () => void;
  status?: "neutral" | "valid" | "invalid";
  helperText?: string;
}) {
  return (
    <label className="block border border-gray-200 rounded-xl p-4">
      <div className="text-sm font-semibold text-gray-900 flex items-center justify-between gap-3">
        <span>{label}</span>
        {status === "valid" ? <span className="text-green-600 font-bold">✓</span> : null}
        {status === "invalid" ? <span className="text-red-600 font-bold">✕</span> : null}
      </div>
      <input
        className={[
          "mt-2 w-full border rounded-lg px-3 py-2",
          status === "invalid" ? "border-red-400" : "border-gray-300",
        ].join(" ")}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onInput={(e) => onChange((e.target as HTMLInputElement).value)}
        onBlur={onBlur}
      />
      {status === "invalid" && helperText ? (
        <div className="mt-2 text-xs text-red-600">{helperText}</div>
      ) : null}
    </label>
  );
}

function TextArea({
  label,
  value,
  onChange,
  className,
  onBlur,
  status = "neutral",
  helperText,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  className?: string;
  onBlur?: () => void;
  status?: "neutral" | "valid" | "invalid";
  helperText?: string;
}) {
  return (
    <label className={["block border border-gray-200 rounded-xl p-4", className ?? ""].join(" ")}>
      <div className="text-sm font-semibold text-gray-900 flex items-center justify-between gap-3">
        <span>{label}</span>
        {status === "valid" ? <span className="text-green-600 font-bold">✓</span> : null}
        {status === "invalid" ? <span className="text-red-600 font-bold">✕</span> : null}
      </div>
      <textarea
        className={[
          "mt-2 w-full border rounded-lg px-3 py-2 min-h-[120px]",
          status === "invalid" ? "border-red-400" : "border-gray-300",
        ].join(" ")}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onInput={(e) => onChange((e.target as HTMLTextAreaElement).value)}
        onBlur={onBlur}
      />
      {status === "invalid" && helperText ? (
        <div className="mt-2 text-xs text-red-600">{helperText}</div>
      ) : null}
    </label>
  );
}

function Select({
  label,
  value,
  onChange,
  options,
  onBlur,
  status = "neutral",
  helperText,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: Array<{ value: string; label: string }>;
  onBlur?: () => void;
  status?: "neutral" | "valid" | "invalid";
  helperText?: string;
}) {
  return (
    <label className="block border border-gray-200 rounded-xl p-4">
      <div className="text-sm font-semibold text-gray-900 flex items-center justify-between gap-3">
        <span>{label}</span>
        {status === "valid" ? <span className="text-green-600 font-bold">✓</span> : null}
        {status === "invalid" ? <span className="text-red-600 font-bold">✕</span> : null}
      </div>
      <select
        className={[
          "mt-2 w-full border rounded-lg px-3 py-2",
          status === "invalid" ? "border-red-400" : "border-gray-300",
        ].join(" ")}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onInput={(e) => onChange((e.target as HTMLSelectElement).value)}
        onBlur={onBlur}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      {status === "invalid" && helperText ? (
        <div className="mt-2 text-xs text-red-600">{helperText}</div>
      ) : null}
    </label>
  );
}

function JobTypeSelect({
  value,
  country,
  onChange,
  onBlur,
  status = "neutral",
  showCheckmark,
  helperText,
}: {
  value: "urban" | "regional";
  country: "US" | "CA";
  onChange: (v: "urban" | "regional") => void;
  onBlur?: () => void;
  status?: "neutral" | "valid" | "invalid";
  showCheckmark?: boolean;
  helperText?: string;
}) {
  const urbanRange = country === "CA" ? "up to 50 km" : "up to 30 miles";
  const distancePremiumCurrency = country === "CA" ? "CAD" : "USD";
  const showDistancePremiumNotice = value === "regional";
  return (
    <div className="border border-gray-200 rounded-xl p-4">
      <div className="flex items-center gap-2">
        <div className="text-sm font-semibold text-gray-900">Job Type</div>
        <JobTypeHelp />
        <div style={{ marginLeft: "auto" }}>
          {showCheckmark && status !== "invalid" ? <span className="text-green-600 font-bold">✓</span> : null}
          {status === "invalid" ? <span className="text-red-600 font-bold">✕</span> : null}
        </div>
      </div>
      <select
        className={[
          "mt-2 w-full border rounded-lg px-3 py-2",
          status === "invalid" ? "border-red-400" : "border-gray-300",
        ].join(" ")}
        value={value}
        onChange={(e) => onChange(e.target.value === "regional" ? "regional" : "urban")}
        onBlur={onBlur}
      >
        <option value="urban">Urban ({urbanRange})</option>
        <option value="regional">Regional</option>
      </select>
      {showDistancePremiumNotice ? (
        <div className="mt-2 text-xs text-gray-700">
          Includes a $20 {distancePremiumCurrency} distance premium paid fully to the contractor.
        </div>
      ) : null}
      {status === "invalid" && helperText ? (
        <div className="mt-2 text-xs text-red-600">{helperText}</div>
      ) : null}
    </div>
  );
}

function JobTypeHelp() {
  const [open, setOpen] = React.useState(false);
  const btnRef = React.useRef<HTMLButtonElement | null>(null);
  const [pos, setPos] = React.useState<{ top: number; left: number; width: number } | null>(null);

  React.useEffect(() => {
    if (!open) return;
    function update() {
      const el = btnRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      setPos({ top: r.bottom + 8, left: r.left, width: Math.max(260, Math.min(360, window.innerWidth - 24)) });
    }
    update();
    window.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
    };
  }, [open]);

  React.useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    if (!open) return;
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open]);

  const content = open && pos ? (
    <div
      role="tooltip"
      style={{
        position: "fixed",
        top: pos.top,
        left: Math.min(pos.left, window.innerWidth - pos.width - 12),
        width: pos.width,
        zIndex: 1000,
      }}
      className="bg-white text-gray-900 border border-gray-200 shadow-xl rounded-xl p-3"
    >
      <div className="text-sm text-gray-700">Urban: up to 50 km (Canada) / up to 30 miles (US)</div>
      <div className="text-sm text-gray-700 mt-2">Regional: only select if job location is beyond Urban range.</div>
      <div className="text-sm text-gray-700 mt-2">Regional includes the $20 distance premium (paid on completion).</div>
    </div>
  ) : null;

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        aria-label="Job type help"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        className="inline-flex items-center justify-center w-6 h-6 rounded-full border border-gray-300 text-gray-700 text-xs font-bold"
      >
        ?
      </button>
      {content ? createPortal(content, document.body) : null}
    </>
  );
}

function StripePaymentForm({
  jobId,
  onFunded,
  onProcessingStart,
  onProcessingEnd,
  onError,
}: {
  jobId: string;
  onFunded: () => Promise<void>;
  onProcessingStart: () => void;
  onProcessingEnd: () => void;
  onError: (m: string) => void;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [submitting, setSubmitting] = React.useState(false);

  async function confirm() {
    if (!stripe || !elements) return;
    setSubmitting(true);
    onError("");
    try {
      const result = await stripe.confirmPayment({ elements, redirect: "if_required" });
      if (result.error) throw new Error(result.error.message || "Payment failed");
      onProcessingStart();
      await onFunded();
    } catch (e) {
      onError(e instanceof Error ? e.message : "Payment failed");
    } finally {
      onProcessingEnd();
      setSubmitting(false);
    }
  }

  return (
    <div className="border border-gray-200 rounded-xl p-5">
      <div className="text-lg font-bold text-gray-900">Payment</div>
      <div className="text-gray-600 mt-1">Complete payment to fund escrow and lock the job.</div>

      <div className="mt-4">
        <PaymentElementProvider />
      </div>

      <div className="mt-5">
        <button
          disabled={submitting || !stripe || !elements}
          onClick={() => void confirm()}
          className="bg-8fold-green text-white hover:bg-8fold-green-dark disabled:bg-gray-200 disabled:text-gray-500 font-semibold px-5 py-2.5 rounded-lg"
        >
          {submitting ? "Processing…" : "Pay"}
        </button>
      </div>
    </div>
  );
}

