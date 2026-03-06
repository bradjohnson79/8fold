"use client";

import React, { useEffect, useState, useCallback } from "react";
import { useAuth } from "@clerk/nextjs";
import { apiFetch } from "@/lib/routerApi";

type ProfileData = {
  contactName: string;
  phone: string;
  businessName: string;
  tradeCategories: string[];
  homeCountryCode: string;
  homeRegionCode: string;
  homeLatitude: number | null;
  homeLongitude: number | null;
  email: string;
  serviceRadiusKm: number | null;
  stripeConnected: boolean;
};

const EMPTY_PROFILE: ProfileData = {
  contactName: "",
  phone: "",
  businessName: "",
  tradeCategories: [],
  homeCountryCode: "",
  homeRegionCode: "",
  homeLatitude: null,
  homeLongitude: null,
  email: "",
  serviceRadiusKm: null,
  stripeConnected: false,
};

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
  const [profile, setProfile] = useState<ProfileData>(EMPTY_PROFILE);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [editing, setEditing] = useState(false);
  const [tradeCatInput, setTradeCatInput] = useState("");

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
        tradeCategories: Array.isArray(p.tradeCategories) ? p.tradeCategories : [],
        homeCountryCode: p.homeCountryCode ?? "",
        homeRegionCode: p.homeRegionCode ?? "",
        homeLatitude: p.homeLatitude ?? null,
        homeLongitude: p.homeLongitude ?? null,
        email: p.email ?? "",
        serviceRadiusKm: p.serviceRadiusKm ?? null,
        stripeConnected: Boolean(p.stripeConnected),
      });
      setTradeCatInput(Array.isArray(p.tradeCategories) ? p.tradeCategories.join(", ") : "");
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
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      const categories = tradeCatInput
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);

      const resp = await apiFetch("/api/web/v4/contractor/profile", getToken, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          contactName: profile.contactName,
          phone: profile.phone,
          businessName: profile.businessName,
          tradeCategories: categories,
          homeCountryCode: profile.homeCountryCode,
          homeRegionCode: profile.homeRegionCode,
          homeLatitude: profile.homeLatitude,
          homeLongitude: profile.homeLongitude,
        }),
      });
      if (resp.status === 401) {
        throw new Error("Authentication lost — please refresh and sign in again.");
      }
      const json = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        throw new Error(
          typeof json?.error === "string" ? json.error : json?.error?.message ?? "Failed to save",
        );
      }
      setSuccess("Profile updated successfully.");
      setEditing(false);
      void loadProfile();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save profile");
    } finally {
      setSaving(false);
    }
  }

  function updateField(field: keyof ProfileData, value: string) {
    setProfile((prev) => ({ ...prev, [field]: value }));
  }

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
              value={profile.contactName}
              onChange={(e) => updateField("contactName", e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          ) : (
            <div className="text-sm font-medium text-slate-900">{profile.contactName || "—"}</div>
          )}
        </FieldCard>

        <FieldCard label="Phone">
          {editing ? (
            <input
              type="tel"
              value={profile.phone}
              onChange={(e) => updateField("phone", e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          ) : (
            <div className="text-sm font-medium text-slate-900">{profile.phone || "—"}</div>
          )}
        </FieldCard>

        <FieldCard label="Business Name">
          {editing ? (
            <input
              type="text"
              value={profile.businessName}
              onChange={(e) => updateField("businessName", e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          ) : (
            <div className="text-sm font-medium text-slate-900">{profile.businessName || "—"}</div>
          )}
        </FieldCard>

        <FieldCard label="Email">
          <div className="text-sm font-medium text-slate-900">{profile.email || "—"}</div>
        </FieldCard>

        <FieldCard label="Trade Categories">
          {editing ? (
            <input
              type="text"
              value={tradeCatInput}
              onChange={(e) => setTradeCatInput(e.target.value)}
              placeholder="Plumbing, Electrical, HVAC"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          ) : (
            <div className="text-sm font-medium text-slate-900">
              {profile.tradeCategories.length > 0 ? profile.tradeCategories.join(", ") : "—"}
            </div>
          )}
        </FieldCard>

        <FieldCard label="Country">
          {editing ? (
            <input
              type="text"
              value={profile.homeCountryCode}
              onChange={(e) => updateField("homeCountryCode", e.target.value)}
              placeholder="CA, US, etc."
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          ) : (
            <div className="text-sm font-medium text-slate-900">{profile.homeCountryCode || "—"}</div>
          )}
        </FieldCard>

        <FieldCard label="Province / State">
          {editing ? (
            <input
              type="text"
              value={profile.homeRegionCode}
              onChange={(e) => updateField("homeRegionCode", e.target.value)}
              placeholder="ON, CA, etc."
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          ) : (
            <div className="text-sm font-medium text-slate-900">{profile.homeRegionCode || "—"}</div>
          )}
        </FieldCard>

        <FieldCard label="Stripe Connected">
          <div className="text-sm font-medium text-slate-900">
            {profile.stripeConnected ? (
              <span className="inline-flex items-center gap-1.5 text-emerald-700">
                <span className="text-emerald-600">&#10003;</span> Verified
              </span>
            ) : (
              <span className="text-amber-700">Not connected</span>
            )}
          </div>
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
            onClick={() => { setEditing(false); void loadProfile(); }}
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
