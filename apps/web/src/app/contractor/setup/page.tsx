"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useUser } from "@clerk/nextjs";
import { GeoSearchMap } from "@/components/maps/GeoSearchMap";

const CONTRACTOR_TOS_VERSION = "v1.0";

const MONTH_OPTIONS = [
  { value: 1, label: "January" },
  { value: 2, label: "February" },
  { value: 3, label: "March" },
  { value: 4, label: "April" },
  { value: 5, label: "May" },
  { value: 6, label: "June" },
  { value: 7, label: "July" },
  { value: 8, label: "August" },
  { value: 9, label: "September" },
  { value: 10, label: "October" },
  { value: 11, label: "November" },
  { value: 12, label: "December" },
];

function computeSuspendedUntil(year: number, month: number) {
  return new Date(Date.UTC(year + 3, month - 1, 1));
}

function hasMinimumThreeYearsExperience(year: number, month: number) {
  return computeSuspendedUntil(year, month).getTime() <= Date.now();
}

function formatExperience(startYear: number, startMonth: number) {
  const now = new Date();
  const totalMonths = (now.getUTCFullYear() - startYear) * 12 + (now.getUTCMonth() + 1 - startMonth);
  const safeMonths = Math.max(0, totalMonths);
  const years = Math.floor(safeMonths / 12);
  const months = safeMonths % 12;
  if (years === 0) return `${months} month${months === 1 ? "" : "s"}`;
  if (months === 0) return `${years} year${years === 1 ? "" : "s"}`;
  return `${years} year${years === 1 ? "" : "s"} ${months} month${months === 1 ? "" : "s"}`;
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
  const [countryCode, setCountryCode] = useState("CA");

  const [startedTradeYear, setStartedTradeYear] = useState(new Date().getUTCFullYear() - 3);
  const [startedTradeMonth, setStartedTradeMonth] = useState(1);
  const [showExperienceModal, setShowExperienceModal] = useState(false);
  const [experienceConfirmedFor, setExperienceConfirmedFor] = useState<string | null>(null);

  const [tradeOptions, setTradeOptions] = useState<string[]>([]);
  const [tradeCategories, setTradeCategories] = useState<string[]>([]);

  const [mapQuery, setMapQuery] = useState("");
  const [homeLatitude, setHomeLatitude] = useState<number | null>(null);
  const [homeLongitude, setHomeLongitude] = useState<number | null>(null);
  const [selectedMapAddress, setSelectedMapAddress] = useState("");

  const experienceEligible = useMemo(
    () => hasMinimumThreeYearsExperience(startedTradeYear, startedTradeMonth),
    [startedTradeYear, startedTradeMonth],
  );

  const experienceLabel = useMemo(
    () => formatExperience(startedTradeYear, startedTradeMonth),
    [startedTradeYear, startedTradeMonth],
  );

  const suspensionDate = useMemo(
    () => computeSuspendedUntil(startedTradeYear, startedTradeMonth),
    [startedTradeYear, startedTradeMonth],
  );

  const experienceSelectionKey = `${startedTradeYear}-${startedTradeMonth}`;

  const years = useMemo(() => {
    const current = new Date().getUTCFullYear();
    return Array.from({ length: 65 }, (_, i) => current - i);
  }, []);

  const missingFields = useMemo(() => {
    const missing: string[] = [];
    if (!termsAccepted) missing.push("Terms acceptance");
    if (!phone.trim()) missing.push("Phone Number");
    if (!businessName.trim()) missing.push("Business Name");
    if (!streetAddress.trim()) missing.push("Street Address");
    if (!city.trim()) missing.push("City");
    if (!postalCode.trim()) missing.push("Postal Code");
    if (!tradeCategories.length) missing.push("Trade Categories");
    if (homeLatitude == null || homeLongitude == null) missing.push("Map Location");
    return missing;
  }, [termsAccepted, phone, businessName, streetAddress, city, postalCode, tradeCategories, homeLatitude, homeLongitude]);

  const canSave = missingFields.length === 0;

  useEffect(() => {
    setExperienceConfirmedFor(null);
  }, [startedTradeYear, startedTradeMonth]);

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
          setContactName(displayName);
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
          const savedCountry = String(p.countryCode ?? "CA").trim().toUpperCase();
          const savedFormatted = String(p.formattedAddress ?? "").trim();

          setStreetAddress(savedStreet);
          setCity(savedCity);
          setPostalCode(savedPostal);
          setCountryCode(savedCountry || "CA");

          if (savedFormatted) {
            setMapQuery(savedFormatted);
            setSelectedMapAddress(savedFormatted);
          }

          if (typeof p.homeLatitude === "number" && typeof p.homeLongitude === "number") {
            setHomeLatitude(p.homeLatitude);
            setHomeLongitude(p.homeLongitude);
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

  function toggleTrade(tc: string) {
    setTradeCategories((prev) => (prev.includes(tc) ? prev.filter((v) => v !== tc) : [...prev, tc]));
  }

  async function persistProfile() {
    setSaving(true);
    try {
      const payload = {
        contactName: contactName.trim() || [user?.firstName, user?.lastName].filter(Boolean).join(" ").trim(),
        phone: phone.trim(),
        businessName: businessName.trim(),
        businessNumber: businessNumber.trim() ? businessNumber.trim() : null,
        startedTradeYear,
        startedTradeMonth,
        streetAddress: streetAddress.trim(),
        city: city.trim(),
        postalCode: postalCode.trim(),
        countryCode: (countryCode || "CA").trim().toUpperCase(),
        formattedAddress: selectedMapAddress || mapQuery.trim() || `${streetAddress.trim()}, ${city.trim()}, ${postalCode.trim()}`,
        tradeCategories,
        homeLatitude: homeLatitude as number,
        homeLongitude: homeLongitude as number,
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

  function handleSaveClick() {
    setError(null);
    setSuccess(false);

    if (!canSave) {
      setError(`Complete required fields: ${missingFields.join(", ")}.`);
      return;
    }

    if (experienceConfirmedFor !== experienceSelectionKey) {
      setShowExperienceModal(true);
      return;
    }

    void persistProfile();
  }

  function confirmExperienceAndContinue() {
    setShowExperienceModal(false);
    setExperienceConfirmedFor(experienceSelectionKey);
    void persistProfile();
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
              <p className="font-semibold">Contractor Agreement &amp; Operational Terms ({CONTRACTOR_TOS_VERSION})</p>
              <p className="mt-3 font-semibold">1. Role &amp; Independent Status</p>
              <p className="mt-1">
                As a Contractor on 8Fold, you operate as an independent service provider offering professional trade or service
                work to Job Posters through the platform.
              </p>
              <p className="mt-1">You are not an employee, partner, or agent of 8Fold.</p>
              <p className="mt-1">You are solely responsible for:</p>
              <ul className="ml-5 list-disc space-y-1">
                <li>The quality and execution of your work</li>
                <li>Compliance with local laws and licensing requirements</li>
                <li>Your own insurance (where applicable)</li>
                <li>Your own tax reporting and obligations</li>
              </ul>
              <p className="mt-1">
                8Fold facilitates job matching and payment processing but does not supervise or control your service execution.
              </p>

              <p className="mt-3 font-semibold">2. Professional Standards &amp; Conduct</p>
              <ul className="ml-5 list-disc space-y-1">
                <li>Contractor agrees to maintain professional conduct at all times.</li>
                <li>Prohibited conduct includes harassment, discrimination, abusive language, intimidation, threats, aggression, theft, fraud, and criminal misconduct.</li>
                <li>Any confirmed act of theft, violence, harassment, or fraud may result in immediate termination and permanent account removal.</li>
                <li>Terminated accounts may be retained in archived form for compliance and record-keeping purposes.</li>
              </ul>

              <p className="mt-3 font-semibold">3. Service Acceptance &amp; Completion Obligations</p>
              <ul className="ml-5 list-disc space-y-1">
                <li>Contractor agrees to complete accepted jobs in good faith.</li>
                <li>Contractor must maintain clear and timely communication with Job Posters.</li>
                <li>Contractor is responsible for scheduling agreed appointment times after accepting a job.</li>
                <li>Contractor must arrive at agreed appointment times as scheduled.</li>
              </ul>
              <p className="mt-1">Failure to uphold accepted commitments may result in strike accumulation, suspension, or termination.</p>

              <p className="mt-3 font-semibold">4. Scheduling &amp; No-Show Policy</p>
              <p className="mt-1">Professional reliability is critical to platform integrity.</p>
              <p className="mt-1">The following may result in disciplinary action:</p>
              <ul className="ml-5 list-disc space-y-1">
                <li>Failure to appear at a confirmed appointment (no-show)</li>
                <li>Repeated failure to coordinate scheduling after job acceptance</li>
                <li>Last-minute cancellations without reasonable cause</li>
              </ul>
              <p className="mt-1">8Fold operates a structured compliance system:</p>
              <ul className="ml-5 list-disc space-y-1">
                <li>Strike 1: Warning</li>
                <li>Strike 2: Temporary suspension</li>
                <li>Strike 3: Extended suspension or termination</li>
              </ul>
              <p className="mt-1">Severity of action may vary based on the circumstances and pattern of behavior.</p>

              <p className="mt-3 font-semibold">5. Payment &amp; Payout Conditions</p>
              <ul className="ml-5 list-disc space-y-1">
                <li>Contractor compensation is processed according to platform payout policies.</li>
                <li>Maintain accurate and valid payout information.</li>
                <li>Complete required onboarding steps prior to receiving payment.</li>
                <li>Submit accurate completion confirmations.</li>
              </ul>
              <p className="mt-1">Delays caused by incorrect payout information are the responsibility of the Contractor.</p>
              <p className="mt-1">Fraudulent payment claims, manipulation of job status, or collusion may result in immediate termination.</p>

              <p className="mt-3 font-semibold">6. Parts &amp; Materials (P&amp;M)</p>
              <ul className="ml-5 list-disc space-y-1">
                <li>Parts &amp; Materials requests must be submitted through the platform system when applicable.</li>
                <li>Submitted receipts must reflect actual purchases.</li>
                <li>Misrepresentation of material costs or falsified receipts may result in suspension or termination.</li>
                <li>The platform reserves the right to audit submitted documentation.</li>
              </ul>

              <p className="mt-3 font-semibold">7. Job Completion &amp; Approval Process</p>
              <p className="mt-1">Payment is contingent upon:</p>
              <ul className="ml-5 list-disc space-y-1">
                <li>Job marked complete by Contractor</li>
                <li>Confirmation or approval by the Router and/or Job Poster as required</li>
                <li>Compliance with platform procedures</li>
              </ul>
              <p className="mt-1">Disputes may delay payment until review is completed.</p>

              <p className="mt-3 font-semibold">8. Platform Integrity &amp; Fraud Prevention</p>
              <ul className="ml-5 list-disc space-y-1">
                <li>Creating duplicate accounts is prohibited.</li>
                <li>Circumventing platform payment systems is prohibited.</li>
                <li>Coordinating off-platform payment to avoid platform fees is prohibited.</li>
                <li>Collusion with Routers or Job Posters to manipulate outcomes is prohibited.</li>
              </ul>
              <p className="mt-1">Confirmed violations may result in permanent termination.</p>

              <p className="mt-3 font-semibold">9. Suspension &amp; Termination</p>
              <p className="mt-1 font-medium">Immediate termination may occur for:</p>
              <ul className="ml-5 list-disc space-y-1">
                <li>Theft</li>
                <li>Harassment or violence</li>
                <li>Fraud</li>
                <li>Material misrepresentation</li>
                <li>Criminal conduct</li>
                <li>Payment manipulation</li>
              </ul>
              <p className="mt-2 font-medium">Suspension may occur for:</p>
              <ul className="ml-5 list-disc space-y-1">
                <li>Repeated no-shows</li>
                <li>Strike accumulation</li>
                <li>Policy violations</li>
                <li>Failure to maintain professional standards</li>
              </ul>
              <p className="mt-1">Platform decisions regarding suspension or termination are final.</p>

              <p className="mt-3 font-semibold">10. Amendments</p>
              <p className="mt-1">8Fold reserves the right to amend these Terms at any time.</p>
              <p className="mt-1">Continued use of the platform constitutes acceptance of updated Terms.</p>

              <p className="mt-3 font-semibold">Acceptance</p>
              <p className="mt-1">By completing Contractor Setup and accepting this Agreement, you acknowledge that:</p>
              <ul className="ml-5 list-disc space-y-1">
                <li>You understand your responsibilities.</li>
                <li>You agree to operate professionally and independently.</li>
                <li>You accept that platform access is conditional upon ongoing compliance.</li>
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
                  value={streetAddress}
                  onChange={(e) => setStreetAddress(e.target.value)}
                  className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2"
                  placeholder="Street address"
                />
              </label>

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
            </div>
          </section>

          <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
            <h2 className="text-xl font-semibold text-gray-900">OpenStreetMap Map Location</h2>
            <div className="mt-4 space-y-3">
              <span className="text-sm font-medium text-gray-700">Map Location Search *</span>
              <GeoSearchMap
                initialQuery={mapQuery}
                onSelect={(result) => {
                  setMapQuery(result.displayName);
                  setSelectedMapAddress(result.displayName);
                  setHomeLatitude(result.latitude);
                  setHomeLongitude(result.longitude);
                }}
              />

              {selectedMapAddress ? (
                <div className="rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-700">{selectedMapAddress}</div>
              ) : null}
              <p className="text-xs text-gray-500">
                <span className="font-medium">Location Accuracy Notice</span>
                <br />
                The address selected above is used to determine approximate geographic coordinates for routing purposes.
                Exact positioning may vary slightly. 8Fold uses approximate mapping data and does not guarantee pinpoint accuracy.
              </p>
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
                    {MONTH_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            </div>
            <p className={`mt-3 text-sm font-medium ${experienceEligible ? "text-green-700" : "text-red-600"}`}>
              Calculated trade experience: {experienceLabel}
            </p>
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

          {missingFields.length > 0 ? (
            <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              Required before save: {missingFields.join(", ")}.
            </div>
          ) : null}

          <div className="flex items-center gap-4 pt-4">
            <button
              type="button"
              onClick={handleSaveClick}
              disabled={saving || !canSave}
              className="rounded-lg bg-green-600 px-4 py-2 font-semibold text-white hover:bg-green-700 disabled:opacity-50"
            >
              {saving ? "Saving…" : "Save and Continue"}
            </button>
            <Link href="/dashboard/contractor" className="text-sm font-medium text-gray-600 hover:text-gray-900">
              Cancel
            </Link>
          </div>
        </div>
      </div>

      {showExperienceModal ? (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-lg rounded-xl bg-white p-6 shadow-xl">
            <h3 className="text-lg font-semibold text-gray-900">Confirm Trade Experience</h3>
            <p className="mt-3 text-sm text-gray-700">
              Based on your business start date, your calculated trade experience is <span className="font-semibold">{experienceLabel}</span>.
            </p>
            {!experienceEligible ? (
              <p className="mt-3 rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800">
                This is under 3 years. If you continue, your contractor account will be suspended until {suspensionDate.toISOString().slice(0, 10)}.
              </p>
            ) : null}

            <div className="mt-6 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setShowExperienceModal(false)}
                className="rounded-md border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmExperienceAndContinue}
                className="rounded-md bg-green-600 px-3 py-2 text-sm font-semibold text-white hover:bg-green-700"
              >
                Confirm and Continue
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
