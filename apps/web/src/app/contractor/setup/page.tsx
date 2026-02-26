"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useUser } from "@clerk/nextjs";

const CONTRACTOR_TOS_VERSION = "v1.0";

type GeoResult = {
  latitude: number;
  longitude: number;
  provinceState: string;
  formattedAddress: string;
  city?: string;
  postalCode?: string;
  countryCode?: string;
};

function hasMinimumThreeYearsExperience(year: number, month: number) {
  const startedAt = new Date(Date.UTC(year, month - 1, 1));
  const now = new Date();
  const minDate = new Date(Date.UTC(now.getUTCFullYear() - 3, now.getUTCMonth(), 1));
  return startedAt <= minDate;
}

function normalizeGeoResult(result: GeoResult) {
  const parts = result.formattedAddress.split(",").map((part) => part.trim()).filter(Boolean);
  const streetAddress = parts[0] ?? result.formattedAddress;
  const fallbackCity = parts.length >= 3 ? parts[parts.length - 3] : "";
  const fallbackPostal = parts.length >= 2 ? parts[parts.length - 2].split(" ").slice(-2).join(" ").trim() : "";
  const fallbackCountry = parts.length >= 1 ? (parts[parts.length - 1].length === 2 ? parts[parts.length - 1].toUpperCase() : "") : "";

  return {
    ...result,
    streetAddress,
    city: String(result.city ?? fallbackCity).trim(),
    postalCode: String(result.postalCode ?? fallbackPostal).trim(),
    countryCode: String(result.countryCode ?? fallbackCountry).trim().toUpperCase(),
  };
}

export default function ContractorSetupPage() {
  const { user } = useUser();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const [termsAccepted, setTermsAccepted] = useState(false);
  const [contactName, setContactName] = useState("");
  const [phone, setPhone] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [businessNumber, setBusinessNumber] = useState("");
  const [email, setEmail] = useState("");

  const [streetAddress, setStreetAddress] = useState("");
  const [city, setCity] = useState("");
  const [postalCode, setPostalCode] = useState("");
  const [countryCode, setCountryCode] = useState("");

  const [tradeOptions, setTradeOptions] = useState<string[]>([]);
  const [tradeCategories, setTradeCategories] = useState<string[]>([]);
  const [startedTradeYear, setStartedTradeYear] = useState(new Date().getUTCFullYear() - 3);
  const [startedTradeMonth, setStartedTradeMonth] = useState(1);

  const [geoQuery, setGeoQuery] = useState("");
  const [geoResults, setGeoResults] = useState<GeoResult[]>([]);
  const [showGeoSuggestions, setShowGeoSuggestions] = useState(false);
  const [selectedGeo, setSelectedGeo] = useState<(GeoResult & { streetAddress: string }) | null>(null);

  const experienceEligible = useMemo(
    () => hasMinimumThreeYearsExperience(startedTradeYear, startedTradeMonth),
    [startedTradeYear, startedTradeMonth],
  );

  const years = useMemo(() => {
    const current = new Date().getUTCFullYear();
    return Array.from({ length: 65 }, (_, i) => current - i);
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [metaResp, profileResp] = await Promise.all([
          fetch("/api/web/v4/meta/trade-categories", { cache: "no-store" }),
          fetch("/api/web/v4/contractor/profile", { cache: "no-store", credentials: "include" }),
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
          const displayName = [p.firstName, p.lastName].filter(Boolean).join(" ").trim() || String(p.contactName ?? "").trim();
          setContactName(displayName || "");
          setPhone(String(p.phone ?? "").trim());
          setBusinessName(String(p.businessName ?? "").trim());
          setBusinessNumber(String(p.businessNumber ?? "").trim());
          setEmail(String(p.email ?? "").trim());
          setTradeCategories(Array.isArray(p.tradeCategories) ? p.tradeCategories : []);

          if (Number.isInteger(p.startedTradeYear)) setStartedTradeYear(p.startedTradeYear);
          if (Number.isInteger(p.startedTradeMonth)) setStartedTradeMonth(p.startedTradeMonth);
          if (p.acceptedTosAt && p.tosVersion) setTermsAccepted(true);

          const savedStreet = String(p.streetAddress ?? "").trim();
          const savedCity = String(p.city ?? "").trim();
          const savedPostal = String(p.postalCode ?? "").trim();
          const savedCountry = String(p.countryCode ?? "").trim().toUpperCase();
          setStreetAddress(savedStreet);
          setCity(savedCity);
          setPostalCode(savedPostal);
          setCountryCode(savedCountry);

          if (typeof p.homeLatitude === "number" && typeof p.homeLongitude === "number") {
            const savedGeo = {
              latitude: p.homeLatitude,
              longitude: p.homeLongitude,
              provinceState: "NA",
              formattedAddress: String((p.formattedAddress ?? savedStreet) || "Saved location"),
              streetAddress: savedStreet || String(p.formattedAddress ?? ""),
              city: savedCity,
              postalCode: savedPostal,
              countryCode: savedCountry,
            };
            setSelectedGeo(savedGeo);
            setGeoQuery(savedGeo.formattedAddress);
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
    if (!geoQuery.trim()) {
      setGeoResults([]);
      setShowGeoSuggestions(false);
      return;
    }

    const timer = setTimeout(async () => {
      try {
        const resp = await fetch("/api/web/v4/geo/geocode", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query: geoQuery.trim() }),
        });
        const data = (await resp.json().catch(() => ({}))) as { results?: GeoResult[] };
        const results = Array.isArray(data.results) ? data.results : [];
        setGeoResults(results);
        setShowGeoSuggestions(results.length > 0);
      } catch {
        setGeoResults([]);
        setShowGeoSuggestions(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [geoQuery]);

  function toggleTrade(tc: string) {
    setTradeCategories((prev) => (prev.includes(tc) ? prev.filter((v) => v !== tc) : [...prev, tc]));
  }

  function handleSelectAddress(result: GeoResult) {
    const normalized = normalizeGeoResult(result);
    setSelectedGeo(normalized);
    setGeoQuery(normalized.formattedAddress);
    setStreetAddress(normalized.streetAddress);
    setCity(normalized.city);
    setPostalCode(normalized.postalCode);
    setCountryCode(normalized.countryCode);
    setGeoResults([]);
    setShowGeoSuggestions(false);
  }

  const canSave = Boolean(
    termsAccepted &&
      phone.trim() &&
      businessName.trim() &&
      experienceEligible &&
      streetAddress.trim() &&
      city.trim() &&
      postalCode.trim() &&
      selectedGeo &&
      Number.isFinite(selectedGeo.latitude) &&
      Number.isFinite(selectedGeo.longitude),
  );

  async function handleSave() {
    setError(null);
    setSuccess(false);

    const displayName = contactName.trim() || [user?.firstName, user?.lastName].filter(Boolean).join(" ").trim();
    if (!termsAccepted) return setError("You must accept the Contractor Terms & Conditions.");
    if (!displayName) return setError("Name is required.");
    if (!phone.trim()) return setError("Phone Number is required.");
    if (!businessName.trim()) return setError("Business Name is required.");
    if (!experienceEligible) return setError("Minimum 3 years of trade experience required.");
    if (!selectedGeo) return setError("Select a valid address from the search results.");
    if (!streetAddress.trim() || !city.trim() || !postalCode.trim()) {
      return setError("Street Address, City, and Postal Code are required.");
    }

    setSaving(true);
    try {
      const payload = {
        contactName: displayName,
        phone: phone.trim(),
        businessName: businessName.trim(),
        businessNumber: businessNumber.trim() ? businessNumber.trim() : null,
        startedTradeYear,
        startedTradeMonth,
        streetAddress: streetAddress.trim(),
        city: city.trim(),
        postalCode: postalCode.trim(),
        countryCode: countryCode.trim() || "CA",
        formattedAddress: selectedGeo.formattedAddress,
        tradeCategories,
        homeLatitude: selectedGeo.latitude,
        homeLongitude: selectedGeo.longitude,
        acceptedTos: true,
        tosVersion: CONTRACTOR_TOS_VERSION,
      };

      const resp = await fetch("/api/web/v4/contractor/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });

      const json = (await resp.json().catch(() => null)) as { error?: { message?: string } | string } | null;
      if (!resp.ok) {
        const message = typeof json?.error === "string" ? json.error : json?.error?.message;
        setError(message ?? "Save failed.");
        return;
      }

      setSuccess(true);
      setTimeout(() => {
        window.location.href = "/dashboard/contractor";
      }, 1000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-white">
        <div className="mx-auto max-w-4xl px-4 py-12 sm:px-6 lg:px-8">
          <p className="text-gray-600">Loading…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white">
      <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6 lg:px-8">
        <h1 className="text-3xl font-bold text-gray-900">Contractor Setup</h1>
        <p className="mt-2 text-gray-600">Complete your contractor profile to access dashboard features.</p>

        {error ? <div className="mt-6 rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div> : null}
        {success ? (
          <div className="mt-6 rounded-lg border border-green-300 bg-green-50 px-4 py-3 text-sm text-green-800">
            Profile saved successfully.
          </div>
        ) : null}

        <div className="mt-8 space-y-6">
          <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
            <h2 className="text-xl font-semibold text-gray-900">Contractor Terms &amp; Conditions {CONTRACTOR_TOS_VERSION}</h2>
            <div className="mt-4 h-72 overflow-y-auto rounded-md border border-gray-200 bg-gray-50 p-4 text-sm text-gray-700">
              <p className="font-semibold">1. Professional Standards &amp; Conduct</p>
              <ul className="ml-5 list-disc space-y-1">
                <li>Contractor agrees to maintain professional conduct at all times.</li>
                <li>Contractor shall not engage in harassment, discrimination, abusive language, intimidation, threats, or violence.</li>
                <li>Any confirmed act of theft, harassment, physical aggression, or criminal misconduct will result in immediate termination and permanent account ban.</li>
                <li>Terminated accounts remain archived for compliance and record-keeping.</li>
                <li>Contractor must meet a minimum 3-year trade experience requirement to onboard on the platform.</li>
              </ul>

              <p className="mt-3 font-semibold">2. Service Obligations</p>
              <ul className="ml-5 list-disc space-y-1">
                <li>Contractor agrees to complete accepted jobs in good faith.</li>
                <li>Contractor must arrive at scheduled appointments on time.</li>
                <li>Contractor must maintain clear and timely communication with Job Posters.</li>
                <li>Contractor is responsible for scheduling agreed appointment times after accepting a job.</li>
              </ul>

              <p className="mt-3 font-semibold">3. No-Show &amp; Scheduling Policy</p>
              <ul className="ml-5 list-disc space-y-1">
                <li>Failure to appear at a confirmed job may result in suspension for up to 3 months.</li>
                <li>Failure to coordinate and confirm appointment scheduling after accepting a job may result in a reprimand.</li>
                <li>8Fold operates a 3-strike system for scheduling failures.</li>
                <li>Accumulation of 3 strikes may result in a 1-month suspension.</li>
              </ul>

              <p className="mt-3 font-semibold">4. Payout Conditions</p>
              <ul className="ml-5 list-disc space-y-1">
                <li>Contractor payments are processed according to platform payout schedule.</li>
                <li>Contractor is responsible for maintaining valid payout configuration.</li>
                <li>Delays caused by incorrect payout information are the Contractor&apos;s responsibility.</li>
                <li>Fraudulent payout claims may result in permanent termination.</li>
              </ul>

              <p className="mt-3 font-semibold">5. Parts &amp; Materials (P&amp;M)</p>
              <ul className="ml-5 list-disc space-y-1">
                <li>P&amp;M requests must be submitted through platform.</li>
                <li>Receipts must reflect actual purchases.</li>
                <li>Misrepresentation of material costs may result in suspension or termination.</li>
                <li>Platform may audit receipts.</li>
              </ul>

              <p className="mt-3 font-semibold">6. Tax Responsibility</p>
              <ul className="ml-5 list-disc space-y-1">
                <li>Contractor is an independent service provider.</li>
                <li>Contractor is solely responsible for their own income tax obligations.</li>
                <li>8Fold does not withhold income tax on Contractor earnings.</li>
              </ul>

              <p className="mt-3 font-semibold">7. Suspension &amp; Termination</p>
              <p className="mt-1 font-medium">Immediate termination occurs for:</p>
              <ul className="ml-5 list-disc space-y-1">
                <li>Theft</li>
                <li>Harassment</li>
                <li>Violence</li>
                <li>Fraud</li>
                <li>Material misrepresentation</li>
              </ul>
              <p className="mt-2 font-medium">Suspension may occur for:</p>
              <ul className="ml-5 list-disc space-y-1">
                <li>Repeated no-shows</li>
                <li>Strike accumulation</li>
                <li>Policy violations</li>
              </ul>
            </div>
            <label className="mt-4 flex items-center gap-3 text-sm font-medium text-gray-800">
              <input
                type="checkbox"
                checked={termsAccepted}
                onChange={(e) => setTermsAccepted(e.target.checked)}
                className="h-4 w-4 rounded border-gray-300"
              />
              I have read and agree to the Contractor Terms &amp; Conditions.
            </label>
          </section>

          <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
            <h2 className="text-xl font-semibold text-gray-900">Basic Info</h2>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <label className="block">
                <span className="text-sm font-medium text-gray-700">Name</span>
                <input
                  type="text"
                  value={contactName || [user?.firstName, user?.lastName].filter(Boolean).join(" ").trim()}
                  readOnly
                  className="mt-1 block w-full rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-gray-600"
                />
              </label>

              <label className="block">
                <span className="text-sm font-medium text-gray-700">Email</span>
                <input
                  type="text"
                  value={email || (user?.primaryEmailAddress?.emailAddress ?? "")}
                  readOnly
                  className="mt-1 block w-full rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-gray-600"
                />
              </label>

              <label className="block md:col-span-2">
                <span className="text-sm font-medium text-gray-700">Phone Number *</span>
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2"
                  placeholder="+1 555 123 4567"
                />
              </label>

              <label className="block md:col-span-2">
                <span className="text-sm font-medium text-gray-700">Street Address *</span>
                <input
                  type="text"
                  value={geoQuery}
                  onChange={(e) => {
                    setGeoQuery(e.target.value);
                    setStreetAddress(e.target.value);
                    setShowGeoSuggestions(true);
                    setSelectedGeo(null);
                  }}
                  className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2"
                  placeholder="Search and select address"
                />
              </label>

              {showGeoSuggestions && geoResults.length > 0 ? (
                <div className="md:col-span-2 max-h-48 overflow-auto rounded-md border border-gray-200">
                  {geoResults.map((result, idx) => (
                    <button
                      key={`${result.formattedAddress}-${idx}`}
                      type="button"
                      onClick={() => handleSelectAddress(result)}
                      className="block w-full border-b border-gray-100 px-3 py-2 text-left text-sm hover:bg-gray-50"
                    >
                      {result.formattedAddress}
                    </button>
                  ))}
                </div>
              ) : null}

              <label className="block">
                <span className="text-sm font-medium text-gray-700">City *</span>
                <input
                  type="text"
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2"
                />
              </label>

              <label className="block">
                <span className="text-sm font-medium text-gray-700">Postal Code *</span>
                <input
                  type="text"
                  value={postalCode}
                  onChange={(e) => setPostalCode(e.target.value)}
                  className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2"
                />
              </label>

              {selectedGeo ? (
                <div className="md:col-span-2 space-y-3">
                  <div className="rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-700">
                    {selectedGeo.formattedAddress}
                  </div>
                  <iframe
                    title="Address map preview"
                    className="h-72 w-full rounded border"
                    src={`https://www.openstreetmap.org/export/embed.html?bbox=${selectedGeo.longitude - 0.01}%2C${selectedGeo.latitude - 0.01}%2C${selectedGeo.longitude + 0.01}%2C${selectedGeo.latitude + 0.01}&layer=mapnik&marker=${selectedGeo.latitude}%2C${selectedGeo.longitude}`}
                  />
                </div>
              ) : null}
            </div>
          </section>

          <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
            <h2 className="text-xl font-semibold text-gray-900">Contractor Business Information</h2>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <label className="block md:col-span-2">
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
                <span className="text-sm font-medium text-gray-700">Business Number (optional)</span>
                <input
                  type="text"
                  value={businessNumber}
                  onChange={(e) => setBusinessNumber(e.target.value)}
                  className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2"
                  placeholder="123456789"
                />
              </label>

              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="text-sm font-medium text-gray-700">Started Trade Work In: Year *</span>
                  <select
                    value={startedTradeYear}
                    onChange={(e) => setStartedTradeYear(Number(e.target.value))}
                    className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2"
                  >
                    {years.map((year) => (
                      <option key={year} value={year}>
                        {year}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="block">
                  <span className="text-sm font-medium text-gray-700">Month *</span>
                  <select
                    value={startedTradeMonth}
                    onChange={(e) => setStartedTradeMonth(Number(e.target.value))}
                    className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2"
                  >
                    {Array.from({ length: 12 }, (_, i) => i + 1).map((month) => (
                      <option key={month} value={month}>
                        {month}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            </div>
            {!experienceEligible ? (
              <p className="mt-3 text-sm font-medium text-red-600">Minimum 3 years of trade experience required.</p>
            ) : null}
          </section>

          <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
            <h2 className="text-xl font-semibold text-gray-900">Service Details</h2>
            <label className="mt-4 block">
              <span className="text-sm font-medium text-gray-700">Trade Categories *</span>
              <div className="mt-2 flex flex-wrap gap-2">
                {tradeOptions.map((trade) => (
                  <button
                    key={trade}
                    type="button"
                    onClick={() => toggleTrade(trade)}
                    className={`rounded-full px-3 py-1 text-sm ${
                      tradeCategories.includes(trade)
                        ? "bg-green-600 text-white"
                        : "border border-gray-300 bg-white text-gray-700 hover:bg-gray-50"
                    }`}
                  >
                    {trade}
                  </button>
                ))}
              </div>
            </label>
          </section>

          <div className="flex items-center gap-4 pt-4">
            <button
              type="button"
              onClick={handleSave}
              disabled={saving || !canSave}
              className="rounded-lg bg-green-600 px-4 py-2 font-semibold text-white hover:bg-green-700 disabled:opacity-50"
            >
              {saving ? "Saving…" : "Save Contractor Profile"}
            </button>
            <Link href="/dashboard/contractor" className="text-sm font-medium text-gray-600 hover:text-gray-900">
              Cancel
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
