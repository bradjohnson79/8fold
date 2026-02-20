"use client";

import React from "react";
import { PayoutDisclosures } from "./PayoutDisclosures";

type Currency = "USD" | "CAD";

type PayoutMethod = {
  id: string;
  provider: "STRIPE";
  currency: Currency;
  isActive: boolean;
  details: any;
  createdAt: string;
};

const STRIPE_PROVIDER = "STRIPE";

function parseExpectedCurrency(msg: string): Currency | null {
  const m = msg.match(/expected\\s+(CAD|USD)/i);
  if (!m) return null;
  const c = String(m[1]).toUpperCase();
  return c === "CAD" ? "CAD" : c === "USD" ? "USD" : null;
}

export function PayoutMethodSetup(props: { title?: string; subtitle?: string; includeRefundNote?: boolean }) {
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState("");
  const [notice, setNotice] = React.useState("");

  const [active, setActive] = React.useState<PayoutMethod | null>(null);

  async function load() {
    setLoading(true);
    setError("");
    try {
      const resp = await fetch("/api/app/payout-methods", { cache: "no-store" });
      const json = await resp.json().catch(() => null);
      if (!resp.ok) throw new Error(json?.error ?? "Failed to load payout methods");
      const list = (json?.payoutMethods ?? []) as PayoutMethod[];
      const a = list.find((m) => m.isActive && String(m.provider).toUpperCase() === STRIPE_PROVIDER) ?? null;
      setActive(a);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }

  React.useEffect(() => {
    void load();
  }, []);

  async function save() {
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const details = { connectOnboarding: "stripe_hosted" };

      // Try USD first; API enforces currency by user country and returns a clear 409 if mismatched.
      const attempt = async (currency: Currency) => {
        const resp = await fetch("/api/app/payout-methods", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ currency, provider: STRIPE_PROVIDER, details })
        });
        const json = await resp.json().catch(() => null);
        return { resp, json };
      };

      let { resp, json } = await attempt("USD");
      if (resp.status === 409) {
        const expected = parseExpectedCurrency(String(json?.error ?? ""));
        if (expected && expected !== "USD") {
          ({ resp, json } = await attempt(expected));
        }
      }

      if (!resp.ok) throw new Error(json?.error ?? "Failed to save payout method");

      const onboardingUrl =
        typeof json?.onboardingUrl === "string" && json.onboardingUrl.trim()
          ? String(json.onboardingUrl).trim()
          : null;

      if (onboardingUrl) {
        // Stripe Connect: redirect to hosted onboarding.
        window.location.href = onboardingUrl;
        return;
      }

      setNotice("Saved payout method.");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mt-6 space-y-4">
      <div>
        <div className="text-lg font-bold text-gray-900">{props.title ?? "Payout setup"}</div>
        <div className="text-sm text-gray-600 mt-1">
          {props.subtitle ??
            "8Fold uses Stripe for secure escrow and payouts. Banking setup is handled by Stripe-hosted onboarding."}
        </div>
      </div>

      {error ? <div className="text-sm text-red-600">{error}</div> : null}
      {notice ? <div className="text-sm text-8fold-green font-semibold">{notice}</div> : null}

      {loading ? (
        <div className="text-sm text-gray-600">Loading payout methods…</div>
      ) : (
        <div className="border border-gray-200 rounded-2xl p-5">
          <div className="text-sm font-semibold text-gray-700">Payments Powered by Stripe</div>
          <div className="mt-3 rounded-xl border border-8fold-green/30 bg-8fold-green/5 px-4 py-3">
            <div className="font-semibold text-gray-900">Stripe (Direct Bank Deposit)</div>
            <div className="text-sm text-gray-600 mt-0.5">Immediate / Next Business Day</div>
            <div className="text-xs text-gray-500 mt-1">
              Onboarding is completed via Stripe-hosted setup. No banking details are collected by 8Fold.
            </div>
            {active?.isActive ? (
              <span className="mt-2 inline-flex text-xs font-semibold px-2 py-1 rounded-full bg-green-50 border border-green-200 text-green-700">
                Active
              </span>
            ) : null}
          </div>

          <div className="mt-4">
            <PayoutDisclosures includeRefundNote={props.includeRefundNote} />
          </div>

          <div className="mt-4">
            <button
              disabled={saving}
              onClick={() => void save()}
              className={
                "font-semibold px-4 py-2 rounded-lg " +
                (saving ? "bg-gray-200 text-gray-600" : "bg-8fold-green text-white hover:bg-8fold-green-dark")
              }
            >
              {saving ? "Saving…" : "Save payout method"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

