"use client";

import React, { useEffect, useState } from "react";

type StripeStatusResponse = {
  ok: true;
  state: "CONNECTED" | "PENDING_VERIFICATION" | "NOT_CONNECTED" | "CURRENCY_MISMATCH";
  stripeAccountId: string | null;
  payoutCurrency: "CAD" | "USD";
  expectedCountry: "CA" | "US";
  accountCountry?: string | null;
  countryMismatch: boolean;
  currencyMismatch: boolean;
  onboardingComplete: boolean;
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
};

export default function ContractorPaymentSetupPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<StripeStatusResponse | null>(null);

  async function loadStatus() {
    setLoading(true);
    setError(null);
    try {
      const resp = await fetch("/api/app/stripe/connect/create-account", {
        cache: "no-store",
        credentials: "include",
      });
      const data = (await resp.json().catch(() => null)) as
        | StripeStatusResponse
        | { error?: { message?: string } }
        | null;
      if (!resp.ok || !data || (data as any).ok !== true) {
        throw new Error((data as any)?.error?.message ?? "Failed to load Stripe payout status");
      }
      setStatus(data as StripeStatusResponse);
    } catch (e) {
      setStatus(null);
      setError(e instanceof Error ? e.message : "Failed to load Stripe payout status");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadStatus();
  }, []);

  async function handleOnboard() {
    setSaving(true);
    setError(null);
    try {
      const resp = await fetch("/api/app/stripe/connect/create-account", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
        credentials: "include",
      });
      const data = (await resp.json().catch(() => null)) as { url?: string; error?: { message?: string } } | null;
      if (!resp.ok || !data?.url) {
        throw new Error(data?.error?.message ?? "Failed to start Stripe onboarding");
      }
      window.location.href = data.url;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to start Stripe onboarding");
      setSaving(false);
    }
  }

  const badge = status?.state ?? "NOT_CONNECTED";

  return (
    <div className="p-6 bg-slate-50 min-h-[calc(100vh-120px)]">
      <div className="max-w-4xl space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Contractor Payment Setup</h1>
          <p className="mt-1 text-slate-600">
            Connect Stripe to receive payouts. Invite acceptance is blocked until verification is complete.
          </p>
        </div>

        {error ? (
          <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
        ) : null}

        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-xl font-semibold text-slate-900">Payment Status</h2>
              <p className="mt-1 text-sm text-slate-600">Securely powered by Stripe</p>
            </div>
            <span
              className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${
                badge === "CONNECTED"
                  ? "bg-green-100 text-green-700"
                : badge === "PENDING_VERIFICATION"
                  ? "bg-amber-100 text-amber-800"
                    : "bg-red-100 text-red-700"
              }`}
            >
              {badge === "CONNECTED"
                ? "VERIFIED"
                : badge === "PENDING_VERIFICATION"
                  ? "PENDING VERIFICATION"
                  : badge === "CURRENCY_MISMATCH"
                    ? "CURRENCY MISMATCH"
                    : "NOT CONNECTED"}
            </span>
          </div>

          {loading ? <p className="mt-4 text-sm text-slate-600">Loading status…</p> : null}

          {!loading && status?.state === "CONNECTED" ? (
            <p className="mt-4 text-sm text-slate-700">Your payout account is verified. You can accept routed jobs.</p>
          ) : null}

          {!loading && status?.state === "PENDING_VERIFICATION" ? (
            <p className="mt-4 text-sm text-amber-800">Your Stripe account requires additional verification.</p>
          ) : null}

          {!loading && status?.state === "NOT_CONNECTED" ? (
            <p className="mt-4 text-sm text-red-700">You must connect a payout account before accepting jobs.</p>
          ) : null}

          {!loading && status?.state === "CURRENCY_MISMATCH" ? (
            <p className="mt-4 text-sm text-red-700">
              Your Stripe account country/currency does not match your profile. Contact support to reset payment setup.
            </p>
          ) : null}
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-xl font-semibold text-slate-900">Stripe Onboarding</h2>
          <p className="mt-1 text-sm text-slate-600">
            8Fold does not store your bank account details. Stripe handles secure payout verification and banking data.
          </p>
          <button
            type="button"
            onClick={() => void handleOnboard()}
            disabled={saving || loading}
            className="mt-4 rounded-lg bg-[#635BFF] px-4 py-2 text-sm font-semibold text-white hover:bg-[#5349e8] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving
              ? "Redirecting…"
              : status?.state === "PENDING_VERIFICATION"
                ? "Continue Verification"
                : status?.state === "CONNECTED"
                  ? "Manage Stripe Account"
                  : "Connect Stripe Account"}
          </button>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-xl font-semibold text-slate-900">Verification Details</h2>
          {loading ? <p className="mt-2 text-sm text-slate-600">Loading verification details…</p> : null}
          {!loading && status?.state !== "PENDING_VERIFICATION" ? (
            <p className="mt-2 text-sm text-slate-600">No additional verification items are currently required.</p>
          ) : null}
          {!loading && status?.state === "PENDING_VERIFICATION" ? (
            <p className="mt-2 text-sm text-slate-700">
              Stripe still requires account verification details. Click <span className="font-medium">Continue Verification</span>{" "}
              to finish onboarding.
            </p>
          ) : null}
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-xl font-semibold text-slate-900">FAQ</h2>
          <div className="mt-3 space-y-3 text-sm text-slate-700">
            <div>
              <p className="font-semibold text-slate-900">What is Stripe?</p>
              <p>Stripe is the secure payment infrastructure that verifies your payout profile and processes deposits.</p>
            </div>
            <div>
              <p className="font-semibold text-slate-900">How do I get paid?</p>
              <p>Complete Stripe onboarding, then payouts are released based on completed and approved routed jobs.</p>
            </div>
            <div>
              <p className="font-semibold text-slate-900">When are payouts processed?</p>
              <p>Payouts follow 8Fold payout release schedules once Stripe verification is fully enabled.</p>
            </div>
            <div>
              <p className="font-semibold text-slate-900">Does 8Fold store my bank info?</p>
              <p>No. Sensitive banking details are submitted directly to Stripe and are not stored on 8Fold servers.</p>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
