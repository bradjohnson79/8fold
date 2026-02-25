"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useUser } from "@clerk/nextjs";

type GeoResult = {
  latitude: number;
  longitude: number;
  provinceState: string;
  formattedAddress: string;
};

export default function ContractorSetupPage() {
  const { user } = useUser();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const [contactName, setContactName] = useState("");
  const [phone, setPhone] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [email, setEmail] = useState("");
  const [tradeOptions, setTradeOptions] = useState<string[]>([]);
  const [tradeCategories, setTradeCategories] = useState<string[]>([]);
  const [serviceRadiusKm, setServiceRadiusKm] = useState(25);
  const [stripeConnected, setStripeConnected] = useState(false);
  const [geoQuery, setGeoQuery] = useState("");
  const [geoResults, setGeoResults] = useState<GeoResult[]>([]);
  const [selectedGeo, setSelectedGeo] = useState<GeoResult | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [metaResp, profileResp] = await Promise.all([
          fetch("/api/v4/meta/trade-categories", { cache: "no-store" }),
          fetch("/api/v4/contractor/profile", { cache: "no-store", credentials: "include" }),
        ]);
        const meta = (await metaResp.json().catch(() => ({}))) as { uiOrder?: string[] };
        const json = (await profileResp.json().catch(() => null)) as any;
        if (!alive) return;
        if (profileResp.status === 401) {
          window.location.href = "/login?next=/contractor/setup";
          return;
        }
        if (profileResp.status === 403) {
          setError("Access denied. Contractors only.");
          setLoading(false);
          return;
        }
        setTradeOptions(Array.isArray(meta.uiOrder) ? meta.uiOrder : []);
        const p = json?.profile;
        if (p) {
          const name =
            [p.firstName, p.lastName].filter(Boolean).join(" ").trim() ||
            String(p.contactName ?? "").trim();
          setContactName(name || "");
          setPhone(String(p.phone ?? "").trim());
          setBusinessName(String(p.businessName ?? "").trim());
          setEmail(String(p.email ?? "").trim());
          setTradeCategories(Array.isArray(p.tradeCategories) ? p.tradeCategories : []);
          setServiceRadiusKm(Number(p.serviceRadiusKm) || 25);
          setStripeConnected(Boolean(p.stripeConnected));
          if (typeof p.homeLatitude === "number" && typeof p.homeLongitude === "number") {
            setSelectedGeo({
              latitude: p.homeLatitude,
              longitude: p.homeLongitude,
              provinceState: "NA",
              formattedAddress: "Saved location",
            });
          }
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

  useEffect(() => {
    if (!geoQuery.trim()) return;
    const t = setTimeout(async () => {
      const resp = await fetch("/api/v4/geo/geocode", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: geoQuery.trim() }),
      });
      const data = (await resp.json().catch(() => ({}))) as { results?: GeoResult[] };
      setGeoResults(Array.isArray(data.results) ? data.results : []);
    }, 350);
    return () => clearTimeout(t);
  }, [geoQuery]);

  function toggleTrade(tc: string) {
    setTradeCategories((prev) => (prev.includes(tc) ? prev.filter((v) => v !== tc) : [...prev, tc]));
  }

  async function handleSave() {
    setError(null);
    setSuccess(false);
    if (!businessName.trim()) {
      setError("Business Name is required.");
      return;
    }
    const displayName =
      contactName.trim() ||
      [user?.firstName, user?.lastName].filter(Boolean).join(" ").trim();
    if (!displayName) {
      setError("Name is required.");
      return;
    }
    if (!phone.trim()) {
      setError("Phone Number is required.");
      return;
    }
    if (tradeCategories.length === 0) {
      setError("Select at least one trade category.");
      return;
    }
    if (serviceRadiusKm <= 0) {
      setError("Service Radius must be greater than 0.");
      return;
    }
    if (!selectedGeo) {
      setError("Select home location from map search.");
      return;
    }

    setSaving(true);
    try {
      const resp = await fetch("/api/v4/contractor/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          contactName: displayName,
          phone: phone.trim(),
          businessName: businessName.trim(),
          tradeCategories,
          serviceRadiusKm,
          stripeConnected,
          homeLatitude: selectedGeo.latitude,
          homeLongitude: selectedGeo.longitude,
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
                <span className="text-sm font-medium text-gray-700">Name</span>
                <input
                  type="text"
                  value={
                    contactName ||
                    [user?.firstName, user?.lastName].filter(Boolean).join(" ").trim()
                  }
                  readOnly
                  className="mt-1 block w-full rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-gray-600"
                />
                <span className="text-xs text-gray-500">Managed by your account</span>
              </label>
              <label className="block">
                <span className="text-sm font-medium text-gray-700">Email</span>
                <input
                  type="text"
                  value={email || (user?.primaryEmailAddress?.emailAddress ?? "")}
                  readOnly
                  className="mt-1 block w-full rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-gray-600"
                />
                <span className="text-xs text-gray-500">Managed by your account</span>
              </label>
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
                <span className="text-sm font-medium text-gray-700">Phone Number *</span>
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2"
                  placeholder="+1 555 123 4567"
                />
              </label>
            </div>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900">Service Details</h2>
            <div className="mt-4 space-y-4">
              <label className="block">
                <span className="text-sm font-medium text-gray-700">Trade Categories *</span>
                <div className="mt-2 flex flex-wrap gap-2">
                  {tradeOptions.map((tc) => (
                    <button
                      key={tc}
                      type="button"
                      onClick={() => toggleTrade(tc)}
                      className={`rounded-full px-3 py-1 text-sm ${
                        tradeCategories.includes(tc)
                          ? "bg-green-600 text-white"
                          : "border border-gray-300 bg-white text-gray-700 hover:bg-gray-50"
                      }`}
                    >
                      {tc}
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
            </div>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900">Home Location</h2>
            <div className="mt-4 space-y-4">
              <label className="block">
                <span className="text-sm font-medium text-gray-700">Search Address *</span>
                <input
                  type="text"
                  value={geoQuery}
                  onChange={(e) => {
                    setGeoQuery(e.target.value);
                    setSelectedGeo(null);
                  }}
                  className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2"
                  placeholder="Start typing address..."
                />
              </label>
              <div className="max-h-40 overflow-auto rounded border border-gray-200">
                {geoResults.map((r, idx) => (
                  <button
                    key={`${r.formattedAddress}-${idx}`}
                    type="button"
                    onClick={() => setSelectedGeo(r)}
                    className="block w-full border-b px-3 py-2 text-left text-sm hover:bg-gray-50"
                  >
                    {r.formattedAddress}
                  </button>
                ))}
              </div>
              {selectedGeo && (
                <iframe
                  title="OSM preview"
                  className="h-64 w-full rounded border"
                  src={`https://www.openstreetmap.org/export/embed.html?bbox=${selectedGeo.longitude - 0.01}%2C${selectedGeo.latitude - 0.01}%2C${selectedGeo.longitude + 0.01}%2C${selectedGeo.latitude + 0.01}&layer=mapnik&marker=${selectedGeo.latitude}%2C${selectedGeo.longitude}`}
                />
              )}
            </div>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900">Payout</h2>
            <div className="mt-4 space-y-4">
              <label className="flex items-center gap-3">
                <input
                  type="checkbox"
                  checked={stripeConnected}
                  onChange={(e) => setStripeConnected(e.target.checked)}
                  className="h-4 w-4 rounded border-gray-300"
                />
                <span className="text-sm font-medium text-gray-700">Stripe Connected</span>
              </label>
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
