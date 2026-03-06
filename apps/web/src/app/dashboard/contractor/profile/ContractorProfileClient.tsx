"use client";

import React, { useEffect, useState, useCallback } from "react";
import { useAuth, useUser } from "@clerk/nextjs";
import { apiFetch } from "@/lib/routerApi";

type FullProfile = {
  contactName: string;
  phone: string;
  businessName: string;
  businessNumber: string | null;
  startedTradeYear: number | null;
  startedTradeMonth: number | null;
  streetAddress: string | null;
  formattedAddress: string | null;
  city: string | null;
  postalCode: string | null;
  countryCode: string;
  homeRegionCode: string | null;
  tradeCategories: string[];
  homeLatitude: number;
  homeLongitude: number;
  tosVersion: string | null;
  email: string | null;
};

const TRADE_CATEGORIES = [
  { value: "HANDYMAN", label: "Handyman" },
  { value: "PLUMBING", label: "Plumbing" },
  { value: "ELECTRICAL", label: "Electrical" },
  { value: "HVAC", label: "HVAC" },
  { value: "APPLIANCE", label: "Appliance" },
  { value: "CARPENTRY", label: "Carpentry" },
  { value: "PAINTING", label: "Painting" },
  { value: "DRYWALL", label: "Drywall" },
  { value: "ROOFING", label: "Roofing" },
  { value: "LANDSCAPING", label: "Landscaping" },
  { value: "JUNK_REMOVAL", label: "Junk Removal" },
  { value: "FURNITURE_ASSEMBLY", label: "Furniture Assembly" },
  { value: "MOVING", label: "Moving" },
  { value: "FENCING", label: "Fencing" },
  { value: "SNOW_REMOVAL", label: "Snow Removal" },
  { value: "JANITORIAL_CLEANING", label: "Janitorial / Cleaning" },
  { value: "AUTOMOTIVE", label: "Automotive" },
  { value: "WELDING", label: "Welding" },
  { value: "JACK_OF_ALL_TRADES", label: "Jack of All Trades" },
] as const;

const COUNTRIES = [
  { value: "CA", label: "Canada" },
  { value: "US", label: "United States" },
] as const;

const CA_PROVINCES = [
  { value: "AB", label: "Alberta" },
  { value: "BC", label: "British Columbia" },
  { value: "MB", label: "Manitoba" },
  { value: "NB", label: "New Brunswick" },
  { value: "NL", label: "Newfoundland and Labrador" },
  { value: "NS", label: "Nova Scotia" },
  { value: "ON", label: "Ontario" },
  { value: "PE", label: "Prince Edward Island" },
  { value: "QC", label: "Quebec" },
  { value: "SK", label: "Saskatchewan" },
] as const;

const US_STATES = [
  { value: "AL", label: "Alabama" },
  { value: "AK", label: "Alaska" },
  { value: "AZ", label: "Arizona" },
  { value: "AR", label: "Arkansas" },
  { value: "CA", label: "California" },
  { value: "CO", label: "Colorado" },
  { value: "CT", label: "Connecticut" },
  { value: "DE", label: "Delaware" },
  { value: "FL", label: "Florida" },
  { value: "GA", label: "Georgia" },
  { value: "HI", label: "Hawaii" },
  { value: "ID", label: "Idaho" },
  { value: "IL", label: "Illinois" },
  { value: "IN", label: "Indiana" },
  { value: "IA", label: "Iowa" },
  { value: "KS", label: "Kansas" },
  { value: "KY", label: "Kentucky" },
  { value: "LA", label: "Louisiana" },
  { value: "ME", label: "Maine" },
  { value: "MD", label: "Maryland" },
  { value: "MA", label: "Massachusetts" },
  { value: "MI", label: "Michigan" },
  { value: "MN", label: "Minnesota" },
  { value: "MS", label: "Mississippi" },
  { value: "MO", label: "Missouri" },
  { value: "MT", label: "Montana" },
  { value: "NE", label: "Nebraska" },
  { value: "NV", label: "Nevada" },
  { value: "NH", label: "New Hampshire" },
  { value: "NJ", label: "New Jersey" },
  { value: "NM", label: "New Mexico" },
  { value: "NY", label: "New York" },
  { value: "NC", label: "North Carolina" },
  { value: "ND", label: "North Dakota" },
  { value: "OH", label: "Ohio" },
  { value: "OK", label: "Oklahoma" },
  { value: "OR", label: "Oregon" },
  { value: "PA", label: "Pennsylvania" },
  { value: "RI", label: "Rhode Island" },
  { value: "SC", label: "South Carolina" },
  { value: "SD", label: "South Dakota" },
  { value: "TN", label: "Tennessee" },
  { value: "TX", label: "Texas" },
  { value: "UT", label: "Utah" },
  { value: "VT", label: "Vermont" },
  { value: "VA", label: "Virginia" },
  { value: "WA", label: "Washington" },
  { value: "WV", label: "West Virginia" },
  { value: "WI", label: "Wisconsin" },
  { value: "WY", label: "Wyoming" },
] as const;

function getRegionOptions(countryCode: string) {
  if (countryCode === "CA") return CA_PROVINCES;
  if (countryCode === "US") return US_STATES;
  return [];
}

function formatTradeLabel(value: string): string {
  return TRADE_CATEGORIES.find((t) => t.value === value)?.label ?? value.replace(/_/g, " ");
}

function FieldCard({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-slate-500">
        {label}
      </label>
      {children}
    </div>
  );
}

export default function ContractorProfileClient() {
  const { getToken } = useAuth();
  const { user: clerkUser } = useUser();
  const [profile, setProfile] = useState<FullProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [editing, setEditing] = useState(false);
  const [tradeCatOpen, setTradeCatOpen] = useState(false);

  const clerkEmail = clerkUser?.primaryEmailAddress?.emailAddress ?? "";

  const loadProfile = useCallback(async () => {
    setError("");
    try {
      const resp = await apiFetch("/api/web/v4/contractor/profile", getToken);
      if (resp.status === 401) {
        setError("Authentication lost — please refresh and sign in again.");
        return;
      }
      const json = await resp.json().catch(() => null);
      const p = json?.profile ?? json ?? {};
      setProfile({
        contactName: p.contactName ?? "",
        phone: p.phone ?? "",
        businessName: p.businessName ?? "",
        businessNumber: p.businessNumber ?? null,
        startedTradeYear: p.startedTradeYear ?? null,
        startedTradeMonth: p.startedTradeMonth ?? null,
        streetAddress: p.streetAddress ?? null,
        formattedAddress: p.formattedAddress ?? null,
        city: p.city ?? null,
        postalCode: p.postalCode ?? null,
        countryCode: p.countryCode ?? "",
        homeRegionCode: p.homeRegionCode ?? null,
        tradeCategories: Array.isArray(p.tradeCategories) ? p.tradeCategories : [],
        homeLatitude: typeof p.homeLatitude === "number" ? p.homeLatitude : 0,
        homeLongitude: typeof p.homeLongitude === "number" ? p.homeLongitude : 0,
        tosVersion: p.tosVersion ?? "v1.0",
        email: p.email ?? null,
      });
    } catch (e: unknown) {
      if (e instanceof Error && (e as any).code === "AUTH_MISSING_TOKEN") {
        setError("Authentication lost — please refresh and sign in again.");
      } else {
        setError("Failed to load profile");
      }
    } finally {
      setLoading(false);
    }
  }, [getToken]);

  useEffect(() => { void loadProfile(); }, [loadProfile]);

  async function handleSave() {
    if (!profile) return;
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      const payload = {
        contactName: profile.contactName,
        phone: profile.phone,
        businessName: profile.businessName,
        businessNumber: profile.businessNumber,
        startedTradeYear: profile.startedTradeYear ?? new Date().getFullYear() - 5,
        startedTradeMonth: profile.startedTradeMonth ?? 1,
        streetAddress: profile.streetAddress ?? "N/A",
        city: profile.city ?? "N/A",
        postalCode: profile.postalCode ?? "N/A",
        countryCode: profile.countryCode || "CA",
        homeRegionCode: profile.homeRegionCode || null,
        formattedAddress: profile.formattedAddress ?? profile.streetAddress ?? "N/A",
        tradeCategories: profile.tradeCategories,
        homeLatitude: profile.homeLatitude,
        homeLongitude: profile.homeLongitude,
        acceptedTos: true as const,
        tosVersion: "v1.0" as const,
      };

      const resp = await apiFetch("/api/web/v4/contractor/profile", getToken, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (resp.status === 401) {
        throw new Error("Authentication lost — please refresh and sign in again.");
      }
      const json = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        const msg = typeof json?.error === "string"
          ? json.error
          : json?.error?.message ?? json?.message ?? "Failed to save";
        throw new Error(msg);
      }
      setSuccess("Profile updated successfully.");
      setEditing(false);
      setTradeCatOpen(false);
      void loadProfile();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save profile");
    } finally {
      setSaving(false);
    }
  }

  function updateField(field: keyof FullProfile, value: string) {
    setProfile((prev) => prev ? { ...prev, [field]: value } : prev);
  }

  function toggleTradeCategory(cat: string) {
    setProfile((prev) => {
      if (!prev) return prev;
      const has = prev.tradeCategories.includes(cat);
      return {
        ...prev,
        tradeCategories: has
          ? prev.tradeCategories.filter((c) => c !== cat)
          : [...prev.tradeCategories, cat],
      };
    });
  }

  function handleCountryChange(newCountry: string) {
    setProfile((prev) => prev ? { ...prev, countryCode: newCountry, homeRegionCode: null } : prev);
  }

  const displayEmail = profile?.email || clerkEmail || "";
  const regionOptions = getRegionOptions(profile?.countryCode ?? "");
  const regionLabel = profile?.countryCode === "US" ? "State" : profile?.countryCode === "CA" ? "Province" : "Province / State";
  const countryLabel = COUNTRIES.find((c) => c.value === profile?.countryCode)?.label ?? profile?.countryCode ?? "";

  if (loading) {
    return (
      <div className="space-y-4 p-6">
        <div className="h-6 w-40 animate-pulse rounded bg-slate-200" />
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-20 animate-pulse rounded-xl border border-slate-200 bg-slate-50" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Profile</h1>
          <p className="mt-1 text-sm text-slate-600">
            {editing ? "Edit your contractor profile." : "View your contractor profile."}
          </p>
        </div>
        {!editing ? (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
          >
            Edit Profile
          </button>
        ) : null}
      </div>

      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      ) : null}
      {success ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{success}</div>
      ) : null}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <FieldCard label="Contact Name">
          {editing ? (
            <input
              type="text"
              value={profile?.contactName ?? ""}
              onChange={(e) => updateField("contactName", e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          ) : (
            <div className="text-sm font-medium text-slate-900">{profile?.contactName || "—"}</div>
          )}
        </FieldCard>

        <FieldCard label="Phone">
          {editing ? (
            <input
              type="tel"
              value={profile?.phone ?? ""}
              onChange={(e) => updateField("phone", e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          ) : (
            <div className="text-sm font-medium text-slate-900">{profile?.phone || "—"}</div>
          )}
        </FieldCard>

        <FieldCard label="Business Name">
          {editing ? (
            <input
              type="text"
              value={profile?.businessName ?? ""}
              onChange={(e) => updateField("businessName", e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          ) : (
            <div className="text-sm font-medium text-slate-900">{profile?.businessName || "—"}</div>
          )}
        </FieldCard>

        <FieldCard label="Email">
          <input
            type="email"
            value={displayEmail}
            disabled
            className="w-full rounded-lg border border-slate-200 bg-slate-100 px-3 py-2 text-sm text-slate-500"
          />
        </FieldCard>

        {/* Trade Categories — multi-select dropdown */}
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm md:col-span-2">
          <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-slate-500">
            Job Categories
          </label>
          {editing ? (
            <div className="relative">
              <button
                type="button"
                onClick={() => setTradeCatOpen((o) => !o)}
                className="flex w-full items-center justify-between rounded-lg border border-slate-300 px-3 py-2 text-left text-sm"
              >
                <span className={(profile?.tradeCategories.length ?? 0) > 0 ? "text-slate-900" : "text-slate-400"}>
                  {(profile?.tradeCategories.length ?? 0) > 0
                    ? profile!.tradeCategories.map(formatTradeLabel).join(", ")
                    : "Select categories..."}
                </span>
                <svg className="h-4 w-4 shrink-0 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              {tradeCatOpen ? (
                <div className="absolute z-20 mt-1 max-h-64 w-full overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-lg">
                  {TRADE_CATEGORIES.map((cat) => {
                    const checked = profile?.tradeCategories.includes(cat.value) ?? false;
                    return (
                      <label
                        key={cat.value}
                        className="flex cursor-pointer items-center gap-2.5 px-3 py-2 text-sm hover:bg-slate-50"
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleTradeCategory(cat.value)}
                          className="h-4 w-4 rounded border-slate-300"
                        />
                        <span className={checked ? "font-medium text-slate-900" : "text-slate-700"}>
                          {cat.label}
                        </span>
                      </label>
                    );
                  })}
                </div>
              ) : null}
            </div>
          ) : (
            <div className="text-sm font-medium text-slate-900">
              {(profile?.tradeCategories.length ?? 0) > 0
                ? profile!.tradeCategories.map(formatTradeLabel).join(", ")
                : "—"}
            </div>
          )}
        </div>

        {/* Country dropdown */}
        <FieldCard label="Country">
          {editing ? (
            <select
              value={profile?.countryCode ?? ""}
              onChange={(e) => handleCountryChange(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            >
              <option value="">Select country...</option>
              {COUNTRIES.map((c) => (
                <option key={c.value} value={c.value}>{c.label}</option>
              ))}
            </select>
          ) : (
            <div className="text-sm font-medium text-slate-900">{countryLabel || "—"}</div>
          )}
        </FieldCard>

        {/* Province / State dropdown */}
        <FieldCard label={regionLabel}>
          {editing ? (
            <select
              value={profile?.homeRegionCode ?? ""}
              onChange={(e) => setProfile((prev) => prev ? { ...prev, homeRegionCode: e.target.value || null } : prev)}
              disabled={!profile?.countryCode}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm disabled:bg-slate-100 disabled:text-slate-400"
            >
              <option value="">
                {profile?.countryCode ? `Select ${regionLabel.toLowerCase()}...` : "Select country first"}
              </option>
              {regionOptions.map((r) => (
                <option key={r.value} value={r.value}>{r.label} ({r.value})</option>
              ))}
            </select>
          ) : (
            <div className="text-sm font-medium text-slate-900">
              {(() => {
                const code = profile?.homeRegionCode ?? "";
                const found = regionOptions.find((r) => r.value === code);
                return found ? `${found.label} (${found.value})` : code || "—";
              })()}
            </div>
          )}
        </FieldCard>
      </div>

      {editing ? (
        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={saving}
            className="rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
          >
            {saving ? "Saving..." : "Save Changes"}
          </button>
          <button
            type="button"
            onClick={() => { setEditing(false); setTradeCatOpen(false); void loadProfile(); }}
            disabled={saving}
            className="rounded-lg border border-slate-300 px-5 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            Cancel
          </button>
        </div>
      ) : null}
    </div>
  );
}
