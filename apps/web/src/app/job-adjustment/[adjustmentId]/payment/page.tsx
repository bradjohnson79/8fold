"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { loadStripe } from "@stripe/stripe-js";
import { Elements, PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";

function getApiOrigin() {
  const explicit = String(process.env.NEXT_PUBLIC_API_ORIGIN ?? "").trim();
  if (explicit) return explicit.replace(/\/+$/, "");
  if (typeof window !== "undefined" && window.location.hostname === "localhost") {
    return "http://localhost:3003";
  }
  return "https://api.8fold.app";
}

function formatMoney(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

function PaymentForm({
  adjustmentId,
  paymentIntentId,
  differenceCents,
  apiOrigin,
}: {
  adjustmentId: string;
  paymentIntentId: string;
  differenceCents: number;
  apiOrigin: string;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [paying, setPaying] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!stripe || !elements) return;

    setPaying(true);
    setError("");

    try {
      const { error: stripeError } = await stripe.confirmPayment({
        elements,
        redirect: "if_required",
      });

      if (stripeError) {
        setError(stripeError.message ?? "Payment failed");
        setPaying(false);
        return;
      }

      const resp = await fetch(
        `${apiOrigin}/api/web/v4/job-adjustment/${encodeURIComponent(adjustmentId)}/confirm-payment`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ paymentIntentId }),
        },
      );
      const json = await resp.json().catch(() => ({} as any));
      if (!resp.ok) throw new Error(json?.error ?? "Failed to confirm payment");

      setSuccess(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Payment failed");
    } finally {
      setPaying(false);
    }
  }

  if (success) {
    return (
      <div className="text-center">
        <h2 className="text-lg font-semibold text-emerald-700">Payment Complete</h2>
        <p className="mt-2 text-sm text-slate-600">
          The job price has been updated successfully. You can close this page.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={(e) => void handleSubmit(e)}>
      <p className="mb-4 text-sm text-slate-700">
        Additional amount: <span className="font-bold">{formatMoney(differenceCents)}</span>
      </p>
      <PaymentElement />
      {error && (
        <p className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>
      )}
      <button
        type="submit"
        disabled={paying || !stripe || !elements}
        className="mt-4 w-full rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:bg-slate-300"
      >
        {paying ? "Processing..." : `Pay ${formatMoney(differenceCents)}`}
      </button>
    </form>
  );
}

export default function AdjustmentPaymentPage() {
  const params = useParams<{ adjustmentId: string }>();
  const searchParams = useSearchParams();
  const adjustmentId = params.adjustmentId;
  const token = searchParams.get("token") ?? "";

  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [paymentIntentId, setPaymentIntentId] = useState<string | null>(null);
  const [differenceCents, setDifferenceCents] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const apiOrigin = useMemo(() => getApiOrigin(), []);

  const stripePromise = useMemo(() => {
    const pk = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
    return pk ? loadStripe(pk) : null;
  }, []);

  const initPayment = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const adjResp = await fetch(
        `${apiOrigin}/api/web/v4/job-adjustment/${encodeURIComponent(adjustmentId)}?token=${encodeURIComponent(token)}`,
        { credentials: "include" },
      );
      const adjJson = await adjResp.json().catch(() => ({} as any));
      if (!adjResp.ok) throw new Error(adjJson?.error ?? "Failed to load adjustment");
      setDifferenceCents(adjJson.adjustment?.differenceCents ?? 0);

      const resp = await fetch(
        `${apiOrigin}/api/web/v4/job-adjustment/${encodeURIComponent(adjustmentId)}/accept`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ token }),
        },
      );
      const json = await resp.json().catch(() => ({} as any));
      if (!resp.ok) throw new Error(json?.error ?? "Failed to initiate payment");

      setClientSecret(json.clientSecret);
      setPaymentIntentId(json.paymentIntentId);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to initiate payment");
    } finally {
      setLoading(false);
    }
  }, [apiOrigin, adjustmentId, token]);

  useEffect(() => {
    void initPayment();
  }, [initPayment]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <p className="text-slate-600">Preparing payment...</p>
      </div>
    );
  }

  if (error || !clientSecret || !paymentIntentId) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
        <div className="w-full max-w-md rounded-xl bg-white p-6 shadow text-center">
          <h1 className="text-lg font-semibold text-rose-700">Unable to Process Payment</h1>
          <p className="mt-2 text-sm text-slate-600">{error || "Payment could not be initialized."}</p>
        </div>
      </div>
    );
  }

  if (!stripePromise) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
        <div className="w-full max-w-md rounded-xl bg-white p-6 shadow text-center">
          <h1 className="text-lg font-semibold text-rose-700">Stripe Not Configured</h1>
          <p className="mt-2 text-sm text-slate-600">Payment processing is temporarily unavailable.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-8">
      <div className="w-full max-w-lg rounded-xl bg-white p-6 shadow">
        <h1 className="text-xl font-bold text-slate-900">Complete Payment</h1>
        <p className="mt-1 text-sm text-slate-600">
          Pay the additional amount to finalize the price adjustment.
        </p>
        <div className="mt-4">
          <Elements stripe={stripePromise} options={{ clientSecret }}>
            <PaymentForm
              adjustmentId={adjustmentId}
              paymentIntentId={paymentIntentId}
              differenceCents={differenceCents}
              apiOrigin={apiOrigin}
            />
          </Elements>
        </div>
      </div>
    </div>
  );
}
