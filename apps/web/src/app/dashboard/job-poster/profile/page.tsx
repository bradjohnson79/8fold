"use client";

import React from "react";
import { useUser } from "@clerk/nextjs";
import {
  GoogleAddressAutocomplete,
  type GoogleAddressResult,
} from "@/components/GoogleAddressAutocomplete";
import { REGION_OPTIONS } from "@/lib/regions";

type CountryCode = "US" | "CA";

type ProfileResponse = {
  ok?: boolean;
  profile?: {
    phone?: string | null;
    country?: string | null;
    region?: string | null;
    city?: string | null;
    address?: string | null;
    latitude?: number | null;
    longitude?: number | null;
  };
};

type FormState = {
  phone: string;
  country: CountryCode;
  region: string;
  city: string;
  addressInput: string;
  selectedAddress: string;
  latitude: number | null;
  longitude: number | null;
};

const EMPTY_FORM: FormState = {
  phone: "",
  country: "US",
  region: "",
  city: "",
  addressInput: "",
  selectedAddress: "",
  latitude: null,
  longitude: null,
};

function isGeoSelected(form: FormState): boolean {
  return (
    typeof form.latitude === "number" &&
    typeof form.longitude === "number" &&
    Number.isFinite(form.latitude) &&
    Number.isFinite(form.longitude) &&
    !(form.latitude === 0 && form.longitude === 0) &&
    form.selectedAddress.trim().length > 0 &&
    form.addressInput.trim() === form.selectedAddress.trim()
  );
}

function validate(form: FormState): string | null {
  if (!form.phone.trim()) return "Phone number is required.";
  if (!(form.country === "US" || form.country === "CA"))
    return "Country is required.";
  if (!form.region.trim()) return "State/Province is required.";
  if (!form.city.trim()) return "City is required.";
  if (!form.selectedAddress.trim()) return "Map location is required.";
  if (!isGeoSelected(form))
    return "Please select a Google Places result for map location.";
  return null;
}

export default function JobPosterProfilePage() {
  const { user, isLoaded } = useUser();
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState("");
  const [toast, setToast] = React.useState("");
  const [form, setForm] = React.useState<FormState>(EMPTY_FORM);

  const regionOptions = React.useMemo(
    () => REGION_OPTIONS[form.country],
    [form.country],
  );

  const loadProfile = React.useCallback(async () => {
    const resp = await fetch("/api/v4/job-poster/profile", {
      cache: "no-store",
      credentials: "include",
    });
    const json = (await resp
      .json()
      .catch(() => null)) as ProfileResponse | null;
    if (!resp.ok) {
      const message =
        (json as any)?.error?.message ??
        (json as any)?.error ??
        "Failed to load profile.";
      throw new Error(String(message));
    }

    const p = json?.profile ?? {};
    const country =
      String(p.country ?? "US").toUpperCase() === "CA" ? "CA" : "US";
    const address = String(p.address ?? "").trim();
    const lat = typeof p.latitude === "number" ? p.latitude : null;
    const lng = typeof p.longitude === "number" ? p.longitude : null;

    setForm({
      phone: String(p.phone ?? "").trim(),
      country,
      region: String(p.region ?? "")
        .trim()
        .toUpperCase(),
      city: String(p.city ?? "").trim(),
      addressInput: address,
      selectedAddress: address,
      latitude: lat,
      longitude: lng,
    });
  }, []);

  React.useEffect(() => {
    let active = true;
    (async () => {
      try {
        setError("");
        await loadProfile();
      } catch (e) {
        if (!active) return;
        setError(e instanceof Error ? e.message : "Failed to load profile.");
      } finally {
        if (active) setLoading(false);
      }
    })();

    return () => {
      active = false;
    };
  }, [loadProfile]);

  React.useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(""), 1800);
    return () => window.clearTimeout(t);
  }, [toast]);

  const fullName = [user?.firstName, user?.lastName]
    .filter(Boolean)
    .join(" ")
    .trim();
  const email = user?.primaryEmailAddress?.emailAddress?.trim() ?? "";

  async function onSave() {
    setError("");
    const issue = validate(form);
    if (issue) {
      setError(issue);
      return;
    }

    setSaving(true);
    try {
      const resp = await fetch("/api/v4/job-poster/profile", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          phone: form.phone.trim(),
          country: form.country,
          region: form.region.trim().toUpperCase(),
          city: form.city.trim(),
          address: form.selectedAddress.trim(),
          latitude: form.latitude,
          longitude: form.longitude,
        }),
      });
      const json = await resp.json().catch(() => null);
      if (!resp.ok) {
        const message =
          json?.error?.message ?? json?.error ?? "Failed to save profile.";
        throw new Error(String(message));
      }

      await loadProfile();
      setToast("Profile saved");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save profile.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="relative p-6">
      {toast ? (
        <div className="fixed right-6 top-6 z-40 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-lg">
          {toast}
        </div>
      ) : null}

      <div className="mx-auto max-w-3xl rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-bold text-gray-900">Profile</h1>
        <p className="mt-1 text-sm text-gray-600">
          This information is used for job location and routing.
        </p>

        {error ? (
          <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        ) : null}

        <div className="mt-6 rounded-xl border border-gray-200 p-4">
          <div className="text-sm font-semibold text-gray-900">Account</div>
          <div className="mt-3 grid grid-cols-1 gap-4 md:grid-cols-2">
            <label className="block">
              <div className="text-sm font-medium text-gray-700">Full Name</div>
              <input
                value={isLoaded ? fullName : ""}
                readOnly
                className="mt-1 block w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-gray-600"
              />
            </label>
            <label className="block">
              <div className="text-sm font-medium text-gray-700">Email</div>
              <input
                value={isLoaded ? email : ""}
                readOnly
                className="mt-1 block w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-gray-600"
              />
            </label>
          </div>
        </div>

        <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2">
          <label className="block">
            <div className="text-sm font-medium text-gray-700">
              Phone Number *
            </div>
            <input
              value={form.phone}
              onChange={(e) =>
                setForm((s) => ({ ...s, phone: e.target.value }))
              }
              className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2"
              placeholder="+1 555 123 4567"
            />
          </label>

          <label className="block">
            <div className="text-sm font-medium text-gray-700">Country *</div>
            <select
              value={form.country}
              onChange={(e) => {
                const next = e.target.value === "CA" ? "CA" : "US";
                setForm((s) => ({ ...s, country: next, region: "" }));
              }}
              className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2"
            >
              <option value="US">United States</option>
              <option value="CA">Canada</option>
            </select>
          </label>

          <label className="block">
            <div className="text-sm font-medium text-gray-700">
              State/Province *
            </div>
            <select
              value={form.region}
              onChange={(e) =>
                setForm((s) => ({ ...s, region: e.target.value.toUpperCase() }))
              }
              className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2"
            >
              <option value="">Select...</option>
              {regionOptions.map((opt) => (
                <option key={opt.code} value={opt.code}>
                  {opt.name}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <div className="text-sm font-medium text-gray-700">City *</div>
            <input
              value={form.city}
              onChange={(e) => setForm((s) => ({ ...s, city: e.target.value }))}
              className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2"
              placeholder="City"
            />
          </label>
        </div>

        <div className="mt-6">
          <GoogleAddressAutocomplete
            label="Map Location"
            required
            value={form.addressInput}
            onChange={(value) =>
              setForm((s) => ({
                ...s,
                addressInput: value,
                selectedAddress: "",
                latitude: null,
                longitude: null,
              }))
            }
            onPick={(result: GoogleAddressResult) => {
              setForm((s) => ({
                ...s,
                addressInput: result.formattedAddress,
                selectedAddress: result.formattedAddress,
                latitude: result.latitude,
                longitude: result.longitude,
                city: result.city || s.city,
                region: result.regionCode || s.region,
                country:
                  result.countryCode === "CA" || result.countryCode === "US"
                    ? result.countryCode
                    : s.country,
              }));
            }}
            errorText={
              form.addressInput.trim().length > 0 && !isGeoSelected(form)
                ? "Select a result from Google Places to continue."
                : ""
            }
            placeholder="Start typing an address..."
          />

          <div className="mt-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-700">
            {form.selectedAddress.trim()
              ? `Selected address: ${form.selectedAddress}`
              : "Selected address: none"}
          </div>
        </div>

        <div className="mt-6">
          <button
            type="button"
            onClick={() => void onSave()}
            disabled={loading || saving}
            className="rounded-lg bg-emerald-600 px-5 py-2 font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saving ? "Saving..." : "Save Profile"}
          </button>
        </div>
      </div>
    </div>
  );
}
