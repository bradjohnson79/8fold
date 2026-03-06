"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@clerk/nextjs";
import { REGION_OPTIONS } from "@/lib/regions";
import { routerApiFetch } from "@/lib/routerApi";

const US_STATES = [
  "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "FL", "GA", "HI", "ID", "IL", "IN", "IA", "KS", "KY", "LA", "ME",
  "MD", "MA", "MI", "MN", "MS", "MO", "MT", "NE", "NV", "NH", "NJ", "NM", "NY", "NC", "ND", "OH", "OK", "OR", "PA",
  "RI", "SC", "SD", "TN", "TX", "UT", "VT", "VA", "WA", "WV", "WI", "WY",
];

const CA_PROVINCES = ["AB", "BC", "MB", "NB", "NL", "NS", "NT", "NU", "ON", "PE", "QC", "SK", "YT"];

type ProfileForm = {
  contactName: string;
  phone: string;
  homeCountryCode: "US" | "CA";
  homeRegionCode: string;
};

function Field(props: { label: string; value: string; onChange: (v: string) => void; helperText?: string }) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-gray-700">{props.label}</span>
      <input
        className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2"
        value={props.value}
        onChange={(e) => props.onChange(e.target.value)}
      />
      {props.helperText ? <span className="mt-1 block text-xs text-gray-500">{props.helperText}</span> : null}
    </label>
  );
}

export default function RouterProfilePage() {
  const router = useRouter();
  const { getToken } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState<ProfileForm>({
    contactName: "",
    phone: "",
    homeCountryCode: "US",
    homeRegionCode: "",
  });

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const resp = await routerApiFetch("/api/web/v4/router/profile", getToken);
        const json = (await resp.json().catch(() => null)) as any;
        if (!alive) return;
        const p = json?.profile ?? {};
        setForm((s) => ({
          ...s,
          contactName: String(p.contactName ?? "").trim(),
          phone: String(p.phone ?? "").trim(),
          homeCountryCode: (String(p.homeCountryCode ?? "US").toUpperCase() === "CA" ? "CA" : "US") as "US" | "CA",
          homeRegionCode: String(p.homeRegionCode ?? "").trim(),
        }));
      } catch {
        if (alive) setError("Failed to load profile");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  function regionNameFor(code: string): string {
    const opts = REGION_OPTIONS[form.homeCountryCode] ?? [];
    const r = opts.find((o) => o.code === code);
    return r?.name ?? code;
  }

  async function onSave() {
    setSaving(true);
    setError("");
    try {
      const regionCode = form.homeRegionCode.trim();
      const resp = await routerApiFetch("/api/web/v4/router/profile", getToken, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          contactName: form.contactName.trim(),
          phone: form.phone.trim(),
          homeRegion: regionNameFor(regionCode),
          homeCountryCode: form.homeCountryCode,
          homeRegionCode: regionCode,
        }),
      });
      const json = (await resp.json().catch(() => null)) as any;
      if (resp.status === 401) {
        throw new Error("Authentication lost — please refresh and sign in again.");
      }
      if (!resp.ok) {
        const detail = json?.error?.details ? ` (${JSON.stringify(json.error.details)})` : "";
        throw new Error(`${resp.status}: ${json?.error?.message ?? json?.error ?? "Failed to save"}${detail}`);
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  const regionOptions = form.homeCountryCode === "CA" ? CA_PROVINCES : US_STATES;

  if (loading) return <div className="p-6">Loading...</div>;

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold">Profile</h1>
      <div className="rounded-xl bg-white p-6 shadow dark:bg-zinc-900 space-y-4 max-w-2xl">
        <Field label="Contact Name" value={form.contactName} onChange={(v) => setForm((s) => ({ ...s, contactName: v }))} />
        <Field label="Phone" value={form.phone} onChange={(v) => setForm((s) => ({ ...s, phone: v }))} />
        <label className="block">
          <span className="text-sm font-medium text-gray-700">Country</span>
          <select
            className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2"
            value={form.homeCountryCode}
            onChange={(e) => setForm((s) => ({ ...s, homeCountryCode: e.target.value as "US" | "CA", homeRegionCode: "" }))}
          >
            <option value="US">US</option>
            <option value="CA">CA</option>
          </select>
        </label>
        <label className="block">
          <span className="text-sm font-medium text-gray-700">State / Province Code</span>
          <select
            className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2"
            value={form.homeRegionCode}
            onChange={(e) => setForm((s) => ({ ...s, homeRegionCode: e.target.value }))}
          >
            <option value="">Select...</option>
            {regionOptions.map((code) => (
              <option key={code} value={code}>{code}</option>
            ))}
          </select>
        </label>
      </div>
      {error ? <div className="text-red-700">{error}</div> : null}
      <button
        disabled={saving}
        onClick={() => void onSave()}
        className="rounded-lg bg-green-600 px-6 py-3 text-white disabled:opacity-50"
      >
        {saving ? "Saving..." : "Save"}
      </button>
    </div>
  );
}
