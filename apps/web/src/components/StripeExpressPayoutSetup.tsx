"use client";

import React from "react";
import { useSearchParams } from "next/navigation";

type ConnectStatus = {
  ok: true;
  state: "NOT_CONNECTED" | "PENDING_VERIFICATION" | "CONNECTED" | "CURRENCY_MISMATCH";
  stripeAccountId: string | null;
  payoutCurrency: "CAD" | "USD";
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  onboardingComplete: boolean;
  countryMismatch?: boolean;
  currencyMismatch?: boolean;
  message?: string;
};

export function StripeExpressPayoutSetup() {
  const searchParams = useSearchParams();
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [accountType, setAccountType] = React.useState<"AUTO" | "INDIVIDUAL" | "COMPANY">("AUTO");
  const [error, setError] = React.useState("");
  const [status, setStatus] = React.useState<ConnectStatus | null>(null);

  async function load() {
    setLoading(true);
    setError("");
    try {
      const resp = await fetch("/api/app/stripe/connect/create-account", { cache: "no-store", credentials: "include" });
      const json = (await resp.json().catch(() => null)) as ConnectStatus | { error?: string } | null;
      if (!resp.ok || !json || (json as any).ok !== true) {
        throw new Error(String((json as any)?.error ?? "Failed to load Stripe Connect status"));
      }
      setStatus(json as ConnectStatus);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load Stripe Connect status");
      setStatus(null);
    } finally {
      setLoading(false);
    }
  }

  React.useEffect(() => {
    void load();
  }, []);

  async function openStripe() {
    setSaving(true);
    setError("");
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
      const json = (await resp.json().catch(() => null)) as any;
      if (!resp.ok) {
        if (json?.state === "CURRENCY_MISMATCH") {
          setStatus((s) =>
            s
              ? {
                  ...s,
                  state: "CURRENCY_MISMATCH",
                  countryMismatch: Boolean(json?.countryMismatch),
                  currencyMismatch: Boolean(json?.currencyMismatch),
                  message: "Currency mismatch detected. Contact support.",
                }
              : null,
          );
        }
        throw new Error(String(json?.error ?? "Failed to initialize Stripe onboarding"));
      }
      if (typeof json?.url === "string" && json.url.trim()) {
        window.location.href = json.url.trim();
        return;
      }
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to initialize Stripe onboarding");
    } finally {
      setSaving(false);
    }
  }

  const mode = status?.state ?? "NOT_CONNECTED";
  const returnedFromStripe = searchParams?.get("stripe") === "return";

  return (
    <div className="mt-6 border border-gray-200 rounded-2xl p-5">
      <div className="font-bold text-gray-900">Stripe Express Payout Setup</div>
      <div className="text-sm text-gray-600 mt-1">
        Secure payouts are handled through Stripe Connect Express. You will be redirected to Stripe to configure
        banking and tax details.
      </div>

      {error ? <div className="mt-3 text-sm text-red-700">{error}</div> : null}
      {!error && returnedFromStripe && !loading ? (
        <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          {mode === "CONNECTED"
            ? "Stripe setup is active."
            : "Returned from Stripe. If setup is incomplete, continue onboarding below."}
        </div>
      ) : null}

      {loading ? <div className="mt-3 text-sm text-gray-600">Loading Stripe payout status…</div> : null}

      {!loading && mode === "NOT_CONNECTED" ? (
        <div className="mt-4">
          <div className="text-sm text-gray-700 mb-2">Account type</div>
          <select
            value={accountType}
            onChange={(e) => setAccountType(e.target.value as "AUTO" | "INDIVIDUAL" | "COMPANY")}
            className="w-full max-w-sm rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800"
          >
            <option value="AUTO">Let Stripe decide during onboarding</option>
            <option value="INDIVIDUAL">Personal (Individual)</option>
            <option value="COMPANY">Business (Company)</option>
          </select>
          <div className="text-sm text-gray-700">No Stripe account is connected yet.</div>
          <button
            type="button"
            onClick={() => void openStripe()}
            disabled={saving}
            className="mt-3 bg-8fold-green text-white hover:bg-8fold-green-dark disabled:bg-gray-200 disabled:text-gray-500 font-semibold px-4 py-2 rounded-lg"
          >
            {saving ? "Redirecting…" : "Connect with Stripe"}
          </button>
        </div>
      ) : null}

      {!loading && mode === "PENDING_VERIFICATION" ? (
        <div className="mt-4">
          <div className="text-sm text-amber-800">Stripe onboarding incomplete. Finish setup to receive payouts.</div>
          <button
            type="button"
            onClick={() => void openStripe()}
            disabled={saving}
            className="mt-3 bg-amber-600 text-white hover:bg-amber-700 disabled:bg-gray-200 disabled:text-gray-500 font-semibold px-4 py-2 rounded-lg"
          >
            {saving ? "Redirecting…" : "Complete Stripe Setup"}
          </button>
        </div>
      ) : null}

      {!loading && mode === "CONNECTED" && status ? (
        <div className="mt-4">
          <div className="text-sm font-semibold text-green-700">Stripe Connected ✓</div>
          <div className="mt-2 text-sm text-gray-700">Payout currency: {status.payoutCurrency}</div>
          <div className="text-sm text-gray-700">Charges enabled: {String(status.chargesEnabled)}</div>
          <div className="text-sm text-gray-700">Payouts enabled: {String(status.payoutsEnabled)}</div>
          <button
            type="button"
            onClick={() => void openStripe()}
            disabled={saving}
            className="mt-3 bg-8fold-green text-white hover:bg-8fold-green-dark disabled:bg-gray-200 disabled:text-gray-500 font-semibold px-4 py-2 rounded-lg"
          >
            {saving ? "Redirecting…" : "Manage in Stripe"}
          </button>
        </div>
      ) : null}

      {!loading && mode === "CURRENCY_MISMATCH" ? (
        <div className="mt-4 text-sm text-red-700 font-semibold">Currency mismatch detected. Contact support.</div>
      ) : null}
    </div>
  );
}
