"use client";

import React, { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

type StripeConnectStatus = {
  ok: true;
  state: "NOT_CONNECTED" | "PENDING_VERIFICATION" | "CONNECTED" | "CURRENCY_MISMATCH";
  stripeAccountId: string | null;
  payoutCurrency: "CAD" | "USD";
  expectedCountry: "CA" | "US";
  accountCountry?: string | null;
  countryMismatch: boolean;
  currencyMismatch: boolean;
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  onboardingComplete: boolean;
  simulationEnabled?: boolean;
  simulatedApproved?: boolean;
};

type RouterSummary = {
  earnings: {
    weekCents: number;
    monthCents: number;
    lifetimeCents: number;
    pendingReleaseCents: number;
  };
};

const money = (cents: number) => `$${(cents / 100).toFixed(2)}`;

export default function RouterPaymentSetupPage() {
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [accountType, setAccountType] = useState<"AUTO" | "INDIVIDUAL" | "COMPANY">("AUTO");
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<StripeConnectStatus | null>(null);
  const [summary, setSummary] = useState<RouterSummary | null>(null);

  async function loadStatus() {
    const resp = await fetch("/api/app/stripe/connect/create-account", {
      cache: "no-store",
      credentials: "include",
    });
    const data = (await resp.json().catch(() => null)) as StripeConnectStatus | { error?: string } | null;
    if (!resp.ok || !data || (data as any).ok !== true) {
      throw new Error(String((data as any)?.error ?? "Failed to load Stripe payout status"));
    }
    setStatus(data as StripeConnectStatus);
  }

  async function loadSummary() {
    const resp = await fetch("/api/v4/router/dashboard/summary", {
      cache: "no-store",
      credentials: "include",
    });
    const data = (await resp.json().catch(() => null)) as RouterSummary | { error?: string } | null;
    if (!resp.ok || !data || !(data as any)?.earnings) {
      throw new Error(String((data as any)?.error ?? "Failed to load commission earnings"));
    }
    setSummary(data as RouterSummary);
  }

  async function loadAll() {
    setLoading(true);
    setError(null);
    try {
      await Promise.all([loadStatus(), loadSummary()]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load router payment setup");
      setStatus(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadAll();
  }, []);

  async function handleOnboard() {
    setSaving(true);
    setError(null);
    try {
      const resp = await fetch("/api/app/stripe/connect/create-account", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          accountType:
            accountType === "INDIVIDUAL" ? "individual" : accountType === "COMPANY" ? "company" : "auto",
        }),
        credentials: "include",
      });
      const data = (await resp.json().catch(() => null)) as { url?: string; error?: string } | null;
      if (!resp.ok || !data?.url) {
        throw new Error(String(data?.error ?? "Failed to start Stripe onboarding"));
      }
      window.location.href = data.url;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to start Stripe onboarding");
      setSaving(false);
    }
  }

  async function handleSimulateApproval() {
    setSaving(true);
    setError(null);
    try {
      const resp = await fetch("/api/app/stripe/connect/create-account", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ simulateApproved: true }),
        credentials: "include",
      });
      const data = (await resp.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
      if (!resp.ok || data?.ok !== true) {
        throw new Error(String(data?.error ?? "Failed to simulate Stripe approval"));
      }
      await loadAll();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to simulate Stripe approval");
    } finally {
      setSaving(false);
    }
  }

  const badge = status?.state ?? "NOT_CONNECTED";
  const returnedFromStripe = searchParams?.get("stripe") === "return";
  const isVerified = badge === "CONNECTED";
  const isPending = badge === "PENDING_VERIFICATION";
  const notConnected = badge === "NOT_CONNECTED";
  const mismatch = badge === "CURRENCY_MISMATCH";

  return (
    <div className="p-6 bg-slate-50 min-h-[calc(100vh-120px)]">
      <div className="max-w-4xl space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Router Payment Setup</h1>
          <p className="mt-1 text-slate-600">Connect Stripe to receive routing commission payouts.</p>
        </div>

        {error ? (
          <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
        ) : null}
        {!error && returnedFromStripe && !loading ? (
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
            {isVerified
              ? "Stripe setup is active."
              : "Returned from Stripe. If setup is incomplete, continue onboarding below."}
          </div>
        ) : null}

        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-xl font-semibold text-slate-900">Payment Status</h2>
              <p className="mt-1 text-sm text-slate-600">Securely powered by Stripe</p>
            </div>
            <span
              className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${
                isVerified
                  ? "bg-green-100 text-green-700"
                  : isPending
                    ? "bg-amber-100 text-amber-800"
                    : "bg-red-100 text-red-700"
              }`}
            >
              {isVerified ? "VERIFIED" : isPending ? "PENDING VERIFICATION" : mismatch ? "CURRENCY MISMATCH" : "NOT CONNECTED"}
            </span>
          </div>

          {loading ? <p className="mt-4 text-sm text-slate-600">Loading status…</p> : null}

          {!loading && isVerified ? (
            <p className="mt-4 text-sm text-slate-700">
              Your payout account is verified. Commission payouts will be processed automatically.
            </p>
          ) : null}

          {!loading && isPending ? (
            <p className="mt-4 text-sm text-amber-800">Your Stripe account requires additional verification.</p>
          ) : null}

          {!loading && notConnected ? (
            <p className="mt-4 text-sm text-red-700">You must connect a payout account to receive routing commissions.</p>
          ) : null}

          {!loading && mismatch ? (
            <p className="mt-4 text-sm text-red-700">
              Your Stripe account country/currency does not match your profile. Contact support.
            </p>
          ) : null}
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-xl font-semibold text-slate-900">Stripe Onboarding</h2>
          <p className="mt-1 text-sm text-slate-600">
            8Fold does not store your bank details. Stripe handles secure onboarding, tax details, and payout rails.
          </p>
          {notConnected ? (
            <div className="mt-3 max-w-sm">
              <label className="mb-1 block text-sm text-slate-700">Account type</label>
              <select
                value={accountType}
                onChange={(e) => setAccountType(e.target.value as "AUTO" | "INDIVIDUAL" | "COMPANY")}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800"
              >
                <option value="AUTO">Let Stripe decide during onboarding</option>
                <option value="INDIVIDUAL">Personal (Individual)</option>
                <option value="COMPANY">Business (Company)</option>
              </select>
            </div>
          ) : null}
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void handleOnboard()}
              disabled={saving || loading}
              className="rounded-lg bg-[#635BFF] px-4 py-2 text-sm font-semibold text-white hover:bg-[#5349e8] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {saving
                ? "Redirecting…"
                : isPending
                  ? "Continue Verification"
                  : isVerified
                    ? "Manage Stripe Account"
                    : "Connect Stripe Account"}
            </button>
            {status?.simulationEnabled ? (
              <button
                type="button"
                onClick={() => void handleSimulateApproval()}
                disabled={saving || loading}
                className="rounded-lg bg-purple-600 px-4 py-2 text-sm font-semibold text-white hover:bg-purple-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {saving ? "Simulating…" : "Stripe Simulation Success"}
              </button>
            ) : null}
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-xl font-semibold text-slate-900">Commission Earnings</h2>
          {loading || !summary ? (
            <p className="mt-2 text-sm text-slate-600">Loading earnings…</p>
          ) : (
            <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
              <div className="rounded-lg border border-slate-100 bg-slate-50 p-3">
                <div className="text-slate-500">This Week</div>
                <div className="text-xl font-semibold text-slate-900">{money(summary.earnings.weekCents)}</div>
              </div>
              <div className="rounded-lg border border-slate-100 bg-slate-50 p-3">
                <div className="text-slate-500">This Month</div>
                <div className="text-xl font-semibold text-slate-900">{money(summary.earnings.monthCents)}</div>
              </div>
              <div className="rounded-lg border border-slate-100 bg-slate-50 p-3">
                <div className="text-slate-500">Lifetime</div>
                <div className="text-xl font-semibold text-slate-900">{money(summary.earnings.lifetimeCents)}</div>
              </div>
              <div className="rounded-lg border border-slate-100 bg-slate-50 p-3">
                <div className="text-slate-500">Pending Release</div>
                <div className="text-xl font-semibold text-slate-900">{money(summary.earnings.pendingReleaseCents)}</div>
              </div>
            </div>
          )}
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-xl font-semibold text-slate-900">Verification Details</h2>
          {loading || !status ? (
            <p className="mt-2 text-sm text-slate-600">Loading verification details…</p>
          ) : (
            <div className="mt-2 space-y-1 text-sm text-slate-700">
              <p>Stripe Account ID: {status.stripeAccountId ?? "Not connected"}</p>
              <p>Payout Currency: {status.payoutCurrency}</p>
              <p>Charges Enabled: {status.chargesEnabled ? "Yes" : "No"}</p>
              <p>Payouts Enabled: {status.payoutsEnabled ? "Yes" : "No"}</p>
            </div>
          )}
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-xl font-semibold text-slate-900">FAQ</h2>
          <div className="mt-3 space-y-3 text-sm text-slate-700">
            <div>
              <p className="font-semibold text-slate-900">How are routing commissions calculated?</p>
              <p>Routing commissions are calculated from completed routed jobs according to current 8Fold commission policy.</p>
            </div>
            <div>
              <p className="font-semibold text-slate-900">When are payouts processed?</p>
              <p>Payouts are processed according to the platform payout cycle once commissions are eligible for release.</p>
            </div>
            <div>
              <p className="font-semibold text-slate-900">Does 8Fold store my bank details?</p>
              <p>No. Sensitive bank data is entered directly with Stripe and is not stored on 8Fold servers.</p>
            </div>
            <div>
              <p className="font-semibold text-slate-900">Why Stripe?</p>
              <p>Stripe provides secure identity verification, compliance controls, and trusted payout infrastructure.</p>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
