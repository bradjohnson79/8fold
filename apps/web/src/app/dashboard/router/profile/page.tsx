"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@clerk/nextjs";
import { REGION_OPTIONS, type RegionCountryCode } from "@/lib/regions";
import { routerApiFetch } from "@/lib/routerApi";

type ProfileForm = {
  contactName: string;
  phone: string;
  homeCountryCode: RegionCountryCode;
  homeRegionCode: string;
};

function isComplete(form: ProfileForm): boolean {
  return (
    form.contactName.trim().length > 0 &&
    form.phone.trim().length > 0 &&
    form.homeCountryCode.length > 0 &&
    form.homeRegionCode.length > 0
  );
}

export default function RouterProfilePage() {
  const router = useRouter();
  const { getToken } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
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
        if (resp.status === 401) {
          setError("Authentication lost — please refresh and sign in again.");
          return;
        }
        const json = (await resp.json().catch(() => null)) as any;
        if (!alive) return;
        const p = json?.profile ?? {};
        setForm({
          contactName: String(p.contactName ?? "").trim(),
          phone: String(p.phone ?? "").trim(),
          homeCountryCode: (String(p.homeCountryCode ?? "US").toUpperCase() === "CA" ? "CA" : "US") as RegionCountryCode,
          homeRegionCode: String(p.homeRegionCode ?? "").trim(),
        });
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
    setSuccess("");
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
      setSuccess("Profile saved successfully.");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  const regionOptions = REGION_OPTIONS[form.homeCountryCode] ?? [];
  const complete = isComplete(form);

  if (loading) return <div className="p-6 text-slate-600">Loading profile...</div>;

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-bold text-slate-900">Profile</h1>
        <span
          className={
            "rounded-full px-3 py-1 text-xs font-semibold " +
            (complete
              ? "border border-emerald-200 bg-emerald-50 text-emerald-700"
              : "border border-amber-200 bg-amber-50 text-amber-700")
          }
        >
          {complete ? "Complete" : "Incomplete"}
        </span>
      </div>

      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      ) : null}
      {success ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{success}</div>
      ) : null}

      <div className="max-w-2xl rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="space-y-5">
          <label className="block">
            <span className="text-sm font-medium text-slate-700">Contact Name</span>
            <input
              className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2.5 text-slate-900 placeholder:text-slate-400 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
              value={form.contactName}
              onChange={(e) => setForm((s) => ({ ...s, contactName: e.target.value }))}
              placeholder="Your full name"
            />
          </label>

          <label className="block">
            <span className="text-sm font-medium text-slate-700">Phone</span>
            <input
              className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2.5 text-slate-900 placeholder:text-slate-400 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
              value={form.phone}
              onChange={(e) => setForm((s) => ({ ...s, phone: e.target.value }))}
              placeholder="(555) 123-4567"
            />
          </label>

          <label className="block">
            <span className="text-sm font-medium text-slate-700">Country</span>
            <select
              className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2.5 text-slate-900 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
              value={form.homeCountryCode}
              onChange={(e) =>
                setForm((s) => ({
                  ...s,
                  homeCountryCode: e.target.value as RegionCountryCode,
                  homeRegionCode: "",
                }))
              }
            >
              <option value="US">United States</option>
              <option value="CA">Canada</option>
            </select>
          </label>

          <label className="block">
            <span className="text-sm font-medium text-slate-700">
              {form.homeCountryCode === "CA" ? "Province" : "State"}
            </span>
            <select
              className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2.5 text-slate-900 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
              value={form.homeRegionCode}
              onChange={(e) => setForm((s) => ({ ...s, homeRegionCode: e.target.value }))}
            >
              <option value="">Select...</option>
              {regionOptions.map((opt) => (
                <option key={opt.code} value={opt.code}>
                  {opt.name} ({opt.code})
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="mt-6">
          <button
            type="button"
            disabled={saving}
            onClick={() => void onSave()}
            className="rounded-lg bg-emerald-600 px-6 py-3 text-sm font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving ? "Saving..." : "Save Profile"}
          </button>
        </div>
      </div>
    </div>
  );
}
