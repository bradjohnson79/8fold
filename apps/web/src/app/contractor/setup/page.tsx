"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { TradeCategoryLabel, TradeCategorySchema } from "@8fold/shared";

const TRADE_OPTIONS = TradeCategorySchema.options;
const INSURANCE_OPTIONS = ["None", "Liability", "Full Coverage"] as const;
const LEAD_TIME_OPTIONS = ["Same Day", "1-2 Days", "3-5 Days", "1 Week+"] as const;

function experienceYears(startYear: number, startMonth: number, now = new Date()): number {
  const startMonths = startYear * 12 + (startMonth - 1);
  const curMonths = now.getUTCFullYear() * 12 + now.getUTCMonth();
  return Math.max(0, Math.floor((curMonths - startMonths) / 12));
}

type ProfileResponse = {
  profile: {
    email?: string | null;
    phone?: string | null;
    contactName?: string | null;
    businessName?: string | null;
    tradeCategory?: string | null;
    serviceRadiusKm?: number | null;
    tradeStartYear?: number | null;
    tradeStartMonth?: number | null;
    stripeAccountId?: string | null;
    v2Extras?: {
      secondaryTrades?: string[];
      offersRegionalJobs?: boolean;
      licensed?: boolean;
      insuranceStatus?: string;
      acceptsAsapJobs?: boolean;
      typicalLeadTime?: string;
    } | null;
  } | null;
};

export default function ContractorSetupPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const [businessName, setBusinessName] = useState("");
  const [contactName, setContactName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [primaryTradeCategory, setPrimaryTradeCategory] = useState("");
  const [secondaryTrades, setSecondaryTrades] = useState<string[]>([]);
  const [serviceRadiusKm, setServiceRadiusKm] = useState(25);
  const [offersRegionalJobs, setOffersRegionalJobs] = useState(false);
  const [yearsInTrade, setYearsInTrade] = useState(0);
  const [licensed, setLicensed] = useState(false);
  const [insuranceStatus, setInsuranceStatus] = useState<string>("None");
  const [acceptsAsapJobs, setAcceptsAsapJobs] = useState(false);
  const [typicalLeadTime, setTypicalLeadTime] = useState("1-2 Days");
  const [stripeAccountId, setStripeAccountId] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const resp = await fetch("/api/app/contractor/profile-v2", { cache: "no-store", credentials: "include" });
        const json = (await resp.json().catch(() => null)) as ProfileResponse;
        if (!alive) return;
        if (resp.status === 401) {
          window.location.href = "/login?next=/contractor/setup";
          return;
        }
        if (resp.status === 403) {
          setError("Access denied. Contractors only.");
          setLoading(false);
          return;
        }
        const p = json?.profile;
        if (p) {
          setBusinessName(String(p.businessName ?? "").trim());
          setContactName(String(p.contactName ?? "").trim());
          setPhone(String(p.phone ?? "").trim());
          setEmail(String(p.email ?? "").trim());
          setPrimaryTradeCategory(String(p.tradeCategory ?? "").trim());
          setSecondaryTrades(Array.isArray(p.v2Extras?.secondaryTrades) ? p.v2Extras.secondaryTrades : []);
          setServiceRadiusKm(Number(p.serviceRadiusKm) || 25);
          setOffersRegionalJobs(Boolean(p.v2Extras?.offersRegionalJobs));
          const y = p.tradeStartYear != null && p.tradeStartMonth != null
            ? experienceYears(p.tradeStartYear, p.tradeStartMonth)
            : 0;
          setYearsInTrade(Math.max(0, y));
          setLicensed(Boolean(p.v2Extras?.licensed));
          setInsuranceStatus(String(p.v2Extras?.insuranceStatus ?? "None"));
          setAcceptsAsapJobs(Boolean(p.v2Extras?.acceptsAsapJobs));
          setTypicalLeadTime(String(p.v2Extras?.typicalLeadTime ?? "1-2 Days"));
          setStripeAccountId(p.stripeAccountId ?? null);
        }
      } catch {
        setError("Failed to load profile.");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  function toggleSecondaryTrade(tc: string) {
    setSecondaryTrades((prev) =>
      prev.includes(tc) ? prev.filter((t) => t !== tc) : prev.length < 10 ? [...prev, tc] : prev
    );
  }

  async function handleSave() {
    setError(null);
    setSuccess(false);
    if (!businessName.trim()) {
      setError("Business Name is required.");
      return;
    }
    if (!contactName.trim()) {
      setError("Contact Name is required.");
      return;
    }
    if (!phone.trim()) {
      setError("Phone Number is required.");
      return;
    }
    if (!primaryTradeCategory) {
      setError("Primary Trade Category is required.");
      return;
    }
    if (serviceRadiusKm <= 0) {
      setError("Service Radius must be greater than 0.");
      return;
    }
    if (yearsInTrade < 0) {
      setError("Years in Trade must be 0 or greater.");
      return;
    }

    setSaving(true);
    try {
      const resp = await fetch("/api/app/contractor/profile-v2", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          businessName: businessName.trim(),
          contactName: contactName.trim(),
          phone: phone.trim(),
          primaryTradeCategory,
          secondaryTrades,
          serviceRadiusKm,
          offersRegionalJobs,
          yearsInTrade,
          licensed,
          insuranceStatus,
          acceptsAsapJobs,
          typicalLeadTime,
        }),
      });
      const json = (await resp.json().catch(() => null)) as { ok?: boolean; error?: string };
      if (!resp.ok) {
        setError(json?.error ?? "Save failed.");
        return;
      }
      setSuccess(true);
      setTimeout(() => {
        window.location.href = "/app/contractor";
      }, 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-white">
        <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <p className="text-gray-600">Loading…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <h1 className="text-4xl font-bold text-gray-900">Contractor Setup</h1>
        <p className="text-gray-600 mt-3">Complete your contractor profile.</p>

        {error && (
          <div className="mt-6 rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800">
            {error}
          </div>
        )}
        {success && (
          <div className="mt-6 rounded-lg border border-green-300 bg-green-50 px-4 py-3 text-sm text-green-800">
            Profile saved successfully.
          </div>
        )}

        <div className="mt-8 space-y-6">
          <section>
            <h2 className="text-lg font-semibold text-gray-900">Basic Info</h2>
            <div className="mt-4 space-y-4">
              <label className="block">
                <span className="text-sm font-medium text-gray-700">Business Name *</span>
                <input
                  type="text"
                  value={businessName}
                  onChange={(e) => setBusinessName(e.target.value)}
                  className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2"
                  placeholder="ABC Contracting"
                />
              </label>
              <label className="block">
                <span className="text-sm font-medium text-gray-700">Contact Name *</span>
                <input
                  type="text"
                  value={contactName}
                  onChange={(e) => setContactName(e.target.value)}
                  className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2"
                  placeholder="John Smith"
                />
              </label>
              <label className="block">
                <span className="text-sm font-medium text-gray-700">Phone Number *</span>
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2"
                  placeholder="+1 555 123 4567"
                />
              </label>
              <label className="block">
                <span className="text-sm font-medium text-gray-700">Email</span>
                <input
                  type="email"
                  value={email}
                  readOnly
                  disabled
                  className="mt-1 block w-full rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-gray-600"
                />
              </label>
            </div>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900">Service Details</h2>
            <div className="mt-4 space-y-4">
              <label className="block">
                <span className="text-sm font-medium text-gray-700">Primary Trade Category *</span>
                <select
                  value={primaryTradeCategory}
                  onChange={(e) => setPrimaryTradeCategory(e.target.value)}
                  className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2"
                >
                  <option value="">Select…</option>
                  {TRADE_OPTIONS.map((tc) => (
                    <option key={tc} value={tc}>
                      {TradeCategoryLabel[tc as keyof typeof TradeCategoryLabel] ?? tc}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="text-sm font-medium text-gray-700">Secondary Trades (optional)</span>
                <div className="mt-2 flex flex-wrap gap-2">
                  {TRADE_OPTIONS.filter((tc) => tc !== primaryTradeCategory).map((tc) => (
                    <button
                      key={tc}
                      type="button"
                      onClick={() => toggleSecondaryTrade(tc)}
                      className={`rounded-full px-3 py-1 text-sm ${
                        secondaryTrades.includes(tc)
                          ? "bg-green-600 text-white"
                          : "border border-gray-300 bg-white text-gray-700 hover:bg-gray-50"
                      }`}
                    >
                      {TradeCategoryLabel[tc as keyof typeof TradeCategoryLabel] ?? tc}
                    </button>
                  ))}
                </div>
              </label>
              <label className="block">
                <span className="text-sm font-medium text-gray-700">Service Radius (km) *</span>
                <input
                  type="number"
                  min={1}
                  max={500}
                  value={serviceRadiusKm}
                  onChange={(e) => setServiceRadiusKm(Number(e.target.value) || 0)}
                  className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2"
                />
              </label>
              <label className="flex items-center gap-3">
                <input
                  type="checkbox"
                  checked={offersRegionalJobs}
                  onChange={(e) => setOffersRegionalJobs(e.target.checked)}
                  className="h-4 w-4 rounded border-gray-300"
                />
                <span className="text-sm font-medium text-gray-700">Offers Regional Jobs?</span>
              </label>
            </div>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900">Experience</h2>
            <div className="mt-4 space-y-4">
              <label className="block">
                <span className="text-sm font-medium text-gray-700">Years in Trade</span>
                <input
                  type="number"
                  min={0}
                  max={80}
                  value={yearsInTrade}
                  onChange={(e) => setYearsInTrade(Number(e.target.value) || 0)}
                  className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2"
                />
              </label>
              <label className="flex items-center gap-3">
                <input
                  type="checkbox"
                  checked={licensed}
                  onChange={(e) => setLicensed(e.target.checked)}
                  className="h-4 w-4 rounded border-gray-300"
                />
                <span className="text-sm font-medium text-gray-700">Licensed?</span>
              </label>
              <label className="block">
                <span className="text-sm font-medium text-gray-700">Insurance Status</span>
                <select
                  value={insuranceStatus}
                  onChange={(e) => setInsuranceStatus(e.target.value)}
                  className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2"
                >
                  {INSURANCE_OPTIONS.map((opt) => (
                    <option key={opt} value={opt}>
                      {opt}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900">Availability</h2>
            <div className="mt-4 space-y-4">
              <label className="flex items-center gap-3">
                <input
                  type="checkbox"
                  checked={acceptsAsapJobs}
                  onChange={(e) => setAcceptsAsapJobs(e.target.checked)}
                  className="h-4 w-4 rounded border-gray-300"
                />
                <span className="text-sm font-medium text-gray-700">Accepts ASAP Jobs?</span>
              </label>
              <label className="block">
                <span className="text-sm font-medium text-gray-700">Typical Lead Time</span>
                <select
                  value={typicalLeadTime}
                  onChange={(e) => setTypicalLeadTime(e.target.value)}
                  className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2"
                >
                  {LEAD_TIME_OPTIONS.map((opt) => (
                    <option key={opt} value={opt}>
                      {opt}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900">Payout</h2>
            <div className="mt-4 rounded-lg border border-gray-200 bg-gray-50 px-4 py-3">
              {stripeAccountId ? (
                <p className="text-sm text-gray-700">Stripe connected. You can receive payouts.</p>
              ) : (
                <p className="text-sm text-gray-600">
                  Connect Stripe in your dashboard to receive payouts.
                </p>
              )}
            </div>
          </section>

          <div className="flex items-center gap-4 pt-4">
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="rounded-lg bg-green-600 px-4 py-2 font-semibold text-white hover:bg-green-700 disabled:opacity-50"
            >
              {saving ? "Saving…" : "Save Contractor Profile"}
            </button>
            <Link
              href="/app/contractor"
              className="text-sm font-medium text-gray-600 hover:text-gray-900"
            >
              Cancel
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
