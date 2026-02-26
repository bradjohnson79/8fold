"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useAuth } from "@clerk/nextjs";
import { loadStripe } from "@stripe/stripe-js";
import { Elements, PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";

type PaymentStatus = {
  connected: boolean;
  stripeStatus: "CONNECTED" | "NOT_CONNECTED";
  currency: "cad" | "usd";
  lastFour?: string;
  stripeUpdatedAt?: string | null;
};

type SetupIntentPayload = {
  clientSecret: string;
  currency: "cad" | "usd";
};

function SetupIntentForm(props: {
  onSuccess: () => Promise<void> | void;
  onError: (message: string) => void;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [submitting, setSubmitting] = useState(false);

  return (
    <div className="mt-4 space-y-3">
      <PaymentElement />
      <button
        type="button"
        disabled={!stripe || !elements || submitting}
        onClick={() => {
          void (async () => {
            setSubmitting(true);
            try {
              const result = await stripe!.confirmSetup({
                elements: elements!,
                confirmParams: {
                  return_url: `${window.location.origin}/dashboard/job-poster/payment?success=1`,
                },
                redirect: "if_required",
              });
              if (result.error) {
                throw new Error(result.error.message || "Payment method confirmation failed.");
              }
              const intentStatus = result.setupIntent?.status ?? null;
              if (intentStatus !== "succeeded" && intentStatus !== "processing") {
                throw new Error("Payment method setup did not complete. Please try again.");
              }
              await props.onSuccess();
            } catch (e) {
              props.onError(e instanceof Error ? e.message : "Payment method confirmation failed.");
            } finally {
              setSubmitting(false);
            }
          })();
        }}
        className="px-4 py-2 rounded-md bg-gray-900 text-white hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {submitting ? "Saving..." : "Save Payment Method"}
      </button>
    </div>
  );
}

export default function JobPosterPaymentPage() {
  const { getToken } = useAuth();
  const [status, setStatus] = useState<PaymentStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [canceled, setCanceled] = useState(false);
  const stripePromise = useMemo(() => {
    const publishableKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
    return publishableKey ? loadStripe(publishableKey) : null;
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(typeof window !== "undefined" ? window.location.search : "");
    setSuccess(params.get("success") === "1");
    setCanceled(params.get("canceled") === "1");
  }, []);

  const fetchStatus = async (opts?: { silent?: boolean }) => {
    const silent = Boolean(opts?.silent);
    if (!silent) setLoading(true);
    setError(null);
    try {
      const resp = await fetch("/api/v4/job-poster/payment/status", { cache: "no-store", credentials: "include" });
      if (!resp.ok) {
        const data = await resp.json().catch(() => ({}));
        throw new Error(data?.error?.message ?? `Status failed: ${resp.status}`);
      }
      const data = await resp.json();
      setStatus(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load payment status");
      setStatus(null);
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    void fetchStatus();
  }, []);

  const handlePrepareSetupIntent = async () => {
    setActionLoading(true);
    setError(null);
    setNotice(null);
    try {
      const token = await getToken();
      if (!token) throw new Error("Authentication token unavailable. Please refresh and try again.");
      const resp = await fetch("/api/v4/job-poster/payment/setup-intent", {
        method: "POST",
        credentials: "include",
        headers: {
          authorization: `Bearer ${token}`,
        },
      });
      if (!resp.ok) {
        const data = await resp.json().catch(() => ({}));
        throw new Error(data?.error?.message ?? "Failed to prepare payment setup");
      }
      const data = (await resp.json()) as SetupIntentPayload;
      if (!data.clientSecret) throw new Error("Setup intent is missing client secret.");
      setClientSecret(data.clientSecret);
      if (status && data.currency && status.currency !== data.currency) {
        setStatus({ ...status, currency: data.currency });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to prepare payment setup");
    } finally {
      setActionLoading(false);
    }
  };

  const refreshUntilConnected = async () => {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await fetchStatus({ silent: true });
      if (attempt < 4) {
        await new Promise((resolve) => setTimeout(resolve, 1200));
      }
    }
  };

  if (loading && !status && !clientSecret) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-bold">Payment Setup</h1>
        <p className="mt-2 text-gray-600">Loading…</p>
      </div>
    );
  }

  const lastUpdated = status?.stripeUpdatedAt
    ? new Date(status.stripeUpdatedAt).toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
      })
    : null;
  const currency = status?.currency ? status.currency.toUpperCase() : null;

  return (
    <div className="p-6 max-w-xl">
      <h1 className="text-2xl font-bold">Payment Method & Billing</h1>
      <p className="mt-1 text-gray-600">Add or update your payment method for job activation.</p>

      {error && (
        <div className="mt-4 p-4 rounded-lg bg-red-50 border border-red-200 text-red-800" role="alert">
          {error}
        </div>
      )}
      {notice && (
        <div className="mt-4 p-4 rounded-lg bg-blue-50 border border-blue-200 text-blue-800" role="status">
          {notice}
        </div>
      )}

      {success && (
        <div className="mt-4 p-4 rounded-lg bg-green-50 border border-green-200 text-green-800">
          Payment method connected successfully.
        </div>
      )}

      {canceled && (
        <div className="mt-4 p-4 rounded-lg bg-amber-50 border border-amber-200 text-amber-800">
          Setup was canceled. You can try again when ready.
        </div>
      )}

      <div className="mt-6 p-6 rounded-lg border border-gray-200 bg-white">
        {status?.connected ? (
          <>
            <p className="font-medium text-gray-900">Status: Connected</p>
            {currency && <p className="mt-1 text-gray-600">Currency: {currency}</p>}
            {status.lastFour && (
              <p className="mt-1 text-gray-600">Card: •••• {status.lastFour}</p>
            )}
            {lastUpdated && (
              <p className="mt-1 text-gray-600">Last Updated: {lastUpdated}</p>
            )}
            <button
              type="button"
              onClick={() => {
                void handlePrepareSetupIntent();
              }}
              disabled={actionLoading}
              className="mt-4 px-4 py-2 rounded-md bg-gray-900 text-white hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {actionLoading ? "Preparing…" : "Update Payment Method"}
            </button>
          </>
        ) : (
          <>
            <p className="font-medium text-gray-900">Status: Not Connected</p>
            {currency && <p className="mt-1 text-gray-600">Currency: {currency}</p>}
            <p className="mt-1 text-gray-600">Add a payment method to activate jobs.</p>
            <button
              type="button"
              onClick={() => {
                void handlePrepareSetupIntent();
              }}
              disabled={actionLoading}
              className="mt-4 px-4 py-2 rounded-md bg-gray-900 text-white hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {actionLoading ? "Preparing…" : "Connect Payment Method"}
            </button>
          </>
        )}

        {clientSecret ? (
          stripePromise ? (
            <Elements stripe={stripePromise} options={{ clientSecret }}>
              <SetupIntentForm
                onSuccess={async () => {
                  setClientSecret(null);
                  setError(null);
                  setNotice("Payment method saved. Finalizing status…");
                  await refreshUntilConnected();
                  setNotice(null);
                  setSuccess(true);
                }}
                onError={(message) => {
                  setError(message);
                }}
              />
            </Elements>
          ) : (
            <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-red-700">
              Stripe publishable key is not configured.
            </div>
          )
        ) : null}
      </div>

      <p className="mt-4 text-sm text-gray-500">
        Payment is required before activating a job.{" "}
        <Link href="/post-job" className="text-blue-600 hover:underline">
          Post a Job
        </Link>
      </p>
    </div>
  );
}
