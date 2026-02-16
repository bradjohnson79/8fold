"use client";

import React from "react";
import { PayoutDisclosures } from "./PayoutDisclosures";

type Provider = "STRIPE" | "PAYPAL";
type Currency = "USD" | "CAD";

type PayoutMethod = {
  id: string;
  provider: "STRIPE" | "PAYPAL" | "WISE";
  currency: Currency;
  isActive: boolean;
  details: any;
  createdAt: string;
};

function labelForProvider(p: Provider) {
  if (p === "STRIPE") return "Stripe (Direct Bank Deposit – Fastest)";
  return "PayPal (Up to 3+ Business Days)";
}

function timingForProvider(p: Provider) {
  return p === "STRIPE" ? "Immediate / Next Business Day" : "3+ Business Days";
}

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

  const [selected, setSelected] = React.useState<Provider>("STRIPE");
  const [paypalEmail, setPaypalEmail] = React.useState("");

  const [active, setActive] = React.useState<PayoutMethod | null>(null);

  async function load() {
    setLoading(true);
    setError("");
    try {
      const resp = await fetch("/api/app/payout-methods", { cache: "no-store" });
      const json = await resp.json().catch(() => null);
      if (!resp.ok) throw new Error(json?.error ?? "Failed to load payout methods");
      const list = (json?.payoutMethods ?? []) as PayoutMethod[];
      const a = list.find((m) => m.isActive) ?? null;
      setActive(a);
      if (a?.provider === "PAYPAL") {
        setSelected("PAYPAL");
        setPaypalEmail(String(a.details?.paypalEmail ?? ""));
      } else if (a?.provider === "STRIPE") {
        setSelected("STRIPE");
      }
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
      if (selected === "PAYPAL" && !paypalEmail.trim()) {
        throw new Error("PayPal email is required for PayPal payouts.");
      }

      const details =
        selected === "STRIPE"
          ? { connectOnboarding: "stripe_hosted" }
          : { paypalEmail: paypalEmail.trim() };

      // Try USD first; API enforces currency by user country and returns a clear 409 if mismatched.
      const attempt = async (currency: Currency) => {
        const resp = await fetch("/api/app/payout-methods", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ currency, provider: selected, details })
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
            "Choose how you’d like to receive payouts. 8Fold never collects sensitive banking data directly."}
        </div>
      </div>

      {error ? <div className="text-sm text-red-600">{error}</div> : null}
      {notice ? <div className="text-sm text-8fold-green font-semibold">{notice}</div> : null}

      {loading ? (
        <div className="text-sm text-gray-600">Loading payout methods…</div>
      ) : (
        <div className="border border-gray-200 rounded-2xl p-5">
          <div className="text-sm font-semibold text-gray-700">Payout Method Selection</div>
          <div className="mt-3 space-y-3">
            {(["STRIPE", "PAYPAL"] as Provider[]).map((p) => {
              const checked = selected === p;
              return (
                <label
                  key={p}
                  className={
                    "block rounded-xl border px-4 py-3 cursor-pointer " +
                    (checked ? "border-8fold-green bg-8fold-green/5" : "border-gray-200 hover:bg-gray-50")
                  }
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3">
                      <input
                        type="radio"
                        name="payout_provider"
                        checked={checked}
                        onChange={() => setSelected(p)}
                        className="mt-1"
                      />
                      <div>
                        <div className="font-semibold text-gray-900">{labelForProvider(p)}</div>
                        <div className="text-sm text-gray-600 mt-0.5">{timingForProvider(p)}</div>
                        {p === "STRIPE" ? (
                          <div className="text-xs text-gray-500 mt-1">
                            Onboarding is completed via Stripe-hosted setup. No banking details are collected by 8Fold.
                          </div>
                        ) : (
                          <div className="text-xs text-gray-500 mt-1">
                            PayPal payouts can be delayed by clearing and may incur PayPal transaction fees.
                          </div>
                        )}
                      </div>
                    </div>

                    {active?.provider === p && active?.isActive ? (
                      <span className="text-xs font-semibold px-2 py-1 rounded-full bg-green-50 border border-green-200 text-green-700">
                        Active
                      </span>
                    ) : null}
                  </div>

                  {p === "PAYPAL" && checked ? (
                    <div className="mt-3">
                      <div className="text-sm font-medium text-gray-700">PayPal Email</div>
                      <input
                        value={paypalEmail}
                        onChange={(e) => setPaypalEmail(e.target.value)}
                        placeholder="name@example.com"
                        className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2"
                      />
                    </div>
                  ) : null}
                </label>
              );
            })}
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

