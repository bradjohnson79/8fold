"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { loadStripe } from "@stripe/stripe-js";
import { Elements, PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";

// ─── Types ────────────────────────────────────────────────────────────────────

type AdjustmentData = {
  id: string;
  jobId: string;
  jobTitle: string;
  jobDescription: string;
  originalPriceCents: number | null;
  requestedPriceCents: number;
  differenceCents: number;
  contractorScopeDetails: string;
  additionalScopeDetails: string;
  status: string;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}

function getApiOrigin() {
  const explicit = String(process.env.NEXT_PUBLIC_API_ORIGIN ?? "").trim();
  if (explicit) return explicit.replace(/\/+$/, "");
  if (typeof window !== "undefined" && window.location.hostname === "localhost") {
    return "http://localhost:3003";
  }
  return "https://api.8fold.app";
}

// ─── Inline Payment Form (rendered inside <Elements>) ─────────────────────────

function InlinePaymentForm({
  adjustmentId,
  paymentIntentId,
  differenceCents,
  apiOrigin,
  onSuccess,
  onError,
}: {
  adjustmentId: string;
  paymentIntentId: string;
  differenceCents: number;
  apiOrigin: string;
  onSuccess: () => void;
  onError: (msg: string) => void;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [paying, setPaying] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!stripe || !elements) return;
    setPaying(true);

    try {
      const { error: stripeErr } = await stripe.confirmPayment({
        elements,
        redirect: "if_required",
      });

      if (stripeErr) {
        onError(stripeErr.message ?? "Payment failed");
        return;
      }

      // Confirm on our backend so the job price is updated.
      const resp = await fetch(
        `${apiOrigin}/api/web/v4/job-adjustment/${encodeURIComponent(adjustmentId)}/confirm-payment`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ paymentIntentId }),
        },
      );
      const json = await resp.json().catch(() => ({} as any));
      if (!resp.ok) throw new Error(json?.error ?? "Failed to confirm payment");

      onSuccess();
    } catch (err) {
      onError(err instanceof Error ? err.message : "Payment failed");
    } finally {
      setPaying(false);
    }
  }

  return (
    <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
      <PaymentElement />
      <button
        type="submit"
        disabled={paying || !stripe || !elements}
        className="w-full rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:bg-slate-300 disabled:cursor-not-allowed transition-colors"
      >
        {paying ? "Processing…" : `Pay ${fmt(differenceCents)}`}
      </button>
    </form>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function JobAdjustmentPage() {
  const params = useParams<{ adjustmentId: string }>();
  const searchParams = useSearchParams();
  const adjustmentId = params.adjustmentId;
  const token = searchParams.get("token") ?? "";

  const apiOrigin = useMemo(() => getApiOrigin(), []);

  const stripePromise = useMemo(() => {
    const pk = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
    return pk ? loadStripe(pk) : null;
  }, []);

  // ── Adjustment data ──────────────────────────────────────────────────────────
  const [adjustment, setAdjustment] = useState<AdjustmentData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [expired, setExpired] = useState(false);

  // ── Decline ──────────────────────────────────────────────────────────────────
  const [declining, setDeclining] = useState(false);
  const [declined, setDeclined] = useState(false);

  // ── Accept / payment accordion ───────────────────────────────────────────────
  const [accepting, setAccepting] = useState(false);       // spinner on "Accept" button
  const [showPayment, setShowPayment] = useState(false);   // payment accordion visible
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [paymentIntentId, setPaymentIntentId] = useState<string | null>(null);
  const [paymentError, setPaymentError] = useState("");
  const [paid, setPaid] = useState(false);

  const accordionRef = useRef<HTMLDivElement>(null);

  // ── Load adjustment ──────────────────────────────────────────────────────────
  const loadAdjustment = useCallback(async () => {
    setLoading(true);
    setError("");
    setExpired(false);
    try {
      const resp = await fetch(
        `${apiOrigin}/api/web/v4/job-adjustment/${encodeURIComponent(adjustmentId)}?token=${encodeURIComponent(token)}`,
      );
      const json = await resp.json().catch(() => ({} as any));
      if (resp.status === 403) {
        const msg = String(json?.error ?? "");
        if (msg.toLowerCase().includes("expired")) {
          setExpired(true);
          return;
        }
      }
      if (!resp.ok) throw new Error(json?.error ?? "Failed to load adjustment details");
      setAdjustment(json.adjustment as AdjustmentData);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to load this page.");
    } finally {
      setLoading(false);
    }
  }, [apiOrigin, adjustmentId, token]);

  useEffect(() => {
    void loadAdjustment();
  }, [loadAdjustment]);

  // ── Decline ──────────────────────────────────────────────────────────────────
  async function handleDecline() {
    if (!window.confirm("Are you sure you want to decline this re-appraisal request?")) return;
    setDeclining(true);
    setError("");
    try {
      const resp = await fetch(
        `${apiOrigin}/api/web/v4/job-adjustment/${encodeURIComponent(adjustmentId)}/decline`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token }),
        },
      );
      const json = await resp.json().catch(() => ({} as any));
      if (!resp.ok) throw new Error(json?.error ?? "Failed to decline");
      setDeclined(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to decline");
    } finally {
      setDeclining(false);
    }
  }

  // ── Accept → open payment accordion ─────────────────────────────────────────
  async function handleAccept() {
    setAccepting(true);
    setPaymentError("");
    try {
      const resp = await fetch(
        `${apiOrigin}/api/web/v4/job-adjustment/${encodeURIComponent(adjustmentId)}/accept`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token }),
        },
      );
      const json = await resp.json().catch(() => ({} as any));
      if (!resp.ok) throw new Error(json?.error ?? "Failed to initiate payment");
      setClientSecret(json.clientSecret);
      setPaymentIntentId(json.paymentIntentId);
      setShowPayment(true);
      // Scroll accordion into view once it renders.
      setTimeout(() => accordionRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }), 80);
    } catch (e) {
      setPaymentError(e instanceof Error ? e.message : "Unable to initiate payment");
    } finally {
      setAccepting(false);
    }
  }

  // ─── Screens ─────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <p className="text-slate-500 animate-pulse">Loading…</p>
      </div>
    );
  }

  if (expired) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
        <div className="w-full max-w-md rounded-xl bg-white p-6 shadow text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-amber-100">
            <svg className="h-6 w-6 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h1 className="text-lg font-semibold text-slate-900">Link Expired</h1>
          <p className="mt-2 text-sm text-slate-600">
            This consent link has expired. Please contact your contractor to request a new link.
          </p>
        </div>
      </div>
    );
  }

  if (error && !adjustment) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
        <div className="w-full max-w-md rounded-xl bg-white p-6 shadow text-center">
          <h1 className="text-lg font-semibold text-rose-700">Unable to Load</h1>
          <p className="mt-2 text-sm text-slate-600">{error}</p>
        </div>
      </div>
    );
  }

  if (declined) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
        <div className="w-full max-w-md rounded-xl bg-white p-6 shadow text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-slate-100">
            <svg className="h-6 w-6 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </div>
          <h1 className="text-lg font-semibold text-slate-900">Revision Declined</h1>
          <p className="mt-2 text-sm text-slate-600">
            You have declined the contractor&apos;s re-appraisal request. The job will proceed under the original agreed price.
          </p>
        </div>
      </div>
    );
  }

  if (paid) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
        <div className="w-full max-w-md rounded-xl bg-white p-6 shadow text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100">
            <svg className="h-6 w-6 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h1 className="text-lg font-semibold text-emerald-700">Payment Successful</h1>
          <p className="mt-2 text-sm text-slate-600">
            Your job price has been updated to{" "}
            <span className="font-semibold">{fmt(adjustment?.requestedPriceCents ?? 0)}</span>.
            The contractor has been notified.
          </p>
        </div>
      </div>
    );
  }

  if (!adjustment) return null;

  const originalCents = adjustment.originalPriceCents ?? 0;
  const differenceCents = adjustment.differenceCents;

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-8">
      <div className="w-full max-w-lg rounded-xl bg-white shadow overflow-hidden">

        {/* ── Header ─────────────────────────────────────────────────────── */}
        <div className="px-6 pt-6 pb-4 border-b border-slate-100">
          <h1 className="text-xl font-bold text-slate-900">Job Price Revision Request</h1>
          <p className="mt-1 text-sm text-slate-500">
            Your contractor has requested a price revision for this job.
          </p>
        </div>

        <div className="px-6 py-5 space-y-5">

          {/* ── Job info ─────────────────────────────────────────────────── */}
          <div className="rounded-lg bg-slate-50 px-4 py-3 text-sm space-y-1">
            <p className="font-semibold text-slate-800">{adjustment.jobTitle}</p>
            {adjustment.jobDescription && (
              <p className="text-slate-500 text-xs">{adjustment.jobDescription}</p>
            )}
          </div>

          {/* ── Price breakdown ─────────────────────────────────────────── */}
          <div className="grid grid-cols-3 gap-3 text-center">
            <div className="rounded-lg bg-slate-100 p-3">
              <p className="text-xs text-slate-500">Original Price</p>
              <p className="mt-1 text-base font-bold text-slate-900">{fmt(originalCents)}</p>
            </div>
            <div className="rounded-lg bg-emerald-50 p-3">
              <p className="text-xs text-emerald-600">Revised Price</p>
              <p className="mt-1 text-base font-bold text-emerald-700">{fmt(adjustment.requestedPriceCents)}</p>
            </div>
            <div className="rounded-lg bg-amber-50 p-3">
              <p className="text-xs text-amber-600">You Owe</p>
              <p className="mt-1 text-base font-bold text-amber-700">{fmt(differenceCents)}</p>
            </div>
          </div>

          {/* ── Scope details ────────────────────────────────────────────── */}
          <div className="space-y-3 text-sm text-slate-700">
            {adjustment.contractorScopeDetails && (
              <div>
                <p className="font-semibold">Work included at current price:</p>
                <p className="mt-1 whitespace-pre-wrap text-slate-500">{adjustment.contractorScopeDetails}</p>
              </div>
            )}
            {adjustment.additionalScopeDetails && (
              <div>
                <p className="font-semibold">Additional work required:</p>
                <p className="mt-1 whitespace-pre-wrap text-slate-500">{adjustment.additionalScopeDetails}</p>
              </div>
            )}
          </div>

          {/* ── Action error ─────────────────────────────────────────────── */}
          {error && (
            <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>
          )}

          {/* ── Primary action buttons (hidden once payment accordion opens) */}
          {!showPayment && (
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => void handleDecline()}
                disabled={declining || accepting}
                className="flex-1 rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50 transition-colors"
              >
                {declining ? "Declining…" : "Decline Revision"}
              </button>
              <button
                type="button"
                onClick={() => void handleAccept()}
                disabled={accepting || declining}
                className="flex-1 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:bg-emerald-300 transition-colors"
              >
                {accepting ? "Preparing…" : "Accept Revision"}
              </button>
            </div>
          )}

          {/* ── Payment accordion ─────────────────────────────────────────── */}
          {showPayment && clientSecret && (
            <div ref={accordionRef} className="rounded-lg border border-emerald-200 bg-emerald-50 overflow-hidden">
              <div className="flex items-center gap-2 px-4 py-3 border-b border-emerald-200 bg-emerald-100">
                <svg className="h-4 w-4 text-emerald-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
                </svg>
                <p className="text-sm font-semibold text-emerald-800">
                  Payment Required — {fmt(differenceCents)}
                </p>
              </div>
              <div className="p-4">
                {paymentError && (
                  <p className="mb-3 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{paymentError}</p>
                )}
                {stripePromise ? (
                  <Elements stripe={stripePromise} options={{ clientSecret, appearance: { theme: "stripe" } }}>
                    <InlinePaymentForm
                      adjustmentId={adjustmentId}
                      paymentIntentId={paymentIntentId!}
                      differenceCents={differenceCents}
                      apiOrigin={apiOrigin}
                      onSuccess={() => setPaid(true)}
                      onError={(msg) => setPaymentError(msg)}
                    />
                  </Elements>
                ) : (
                  <p className="text-sm text-rose-700">Stripe is not configured. Payment unavailable.</p>
                )}
              </div>
            </div>
          )}

          {/* Spinner shown while /accept call is in-flight before accordion renders */}
          {accepting && (
            <p className="text-center text-sm text-slate-500 animate-pulse">Preparing payment…</p>
          )}

        </div>
      </div>
    </div>
  );
}
