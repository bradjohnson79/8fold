"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useUser } from "@clerk/nextjs";
import { ROUTER_TOS_SECTIONS, ROUTER_TOS_TITLE, ROUTER_TOS_VERSION } from "@/lib/routerTosV1";

const US_STATES = [
  "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "FL", "GA", "HI", "ID", "IL", "IN", "IA", "KS", "KY", "LA", "ME",
  "MD", "MA", "MI", "MN", "MS", "MO", "MT", "NE", "NV", "NH", "NJ", "NM", "NY", "NC", "ND", "OH", "OK", "OR", "PA",
  "RI", "SC", "SD", "TN", "TX", "UT", "VT", "VA", "WA", "WV", "WI", "WY",
];

const CA_PROVINCES = ["AB", "BC", "MB", "NB", "NL", "NS", "NT", "NU", "ON", "PE", "QC", "SK", "YT"];

type RouterSetupForm = {
  contactName: string;
  phone: string;
  homeRegion: string;
  homeCountryCode: "US" | "CA";
  homeRegionCode: string;
};

function canSave(form: RouterSetupForm, termsChecked: boolean): boolean {
  return Boolean(
    termsChecked &&
      form.contactName.trim() &&
      form.phone.trim().length >= 7 &&
      form.homeRegion.trim() &&
      form.homeCountryCode &&
      form.homeRegionCode.trim(),
  );
}

function TermsSection({
  checked,
  setChecked,
}: {
  checked: boolean;
  setChecked: (checked: boolean) => void;
}) {
  return (
    <div className="rounded-xl bg-white p-6 shadow dark:bg-zinc-900 space-y-4">
      <h2 className="text-xl font-semibold">
        {ROUTER_TOS_TITLE} ({ROUTER_TOS_VERSION})
      </h2>
      <div className="h-64 overflow-y-scroll rounded border p-4 text-sm">
        <div className="space-y-4">
          {ROUTER_TOS_SECTIONS.map((section) => (
            <div key={section.heading}>
              <div className="font-semibold text-gray-900 dark:text-gray-100">{section.heading}</div>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-gray-700 dark:text-gray-300">
                {section.body.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={checked} onChange={(e) => setChecked(e.target.checked)} />
        I have read and agree to the Terms & Conditions.
      </label>
    </div>
  );
}

function Field(props: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  helperText?: string;
}) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-gray-700">{props.label}</span>
      <input
        className={`mt-1 block w-full rounded-md border px-3 py-2 ${props.disabled ? "border-gray-200 bg-gray-50 text-gray-500" : "border-gray-300"}`}
        value={props.value}
        onChange={(e) => props.onChange(e.target.value)}
        disabled={props.disabled}
      />
      {props.helperText ? <span className="mt-1 block text-xs text-gray-500">{props.helperText}</span> : null}
    </label>
  );
}

export function RouterSetupClient() {
  const router = useRouter();
  const { user } = useUser();
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState("");
  const [termsChecked, setTermsChecked] = React.useState(false);
  const [form, setForm] = React.useState<RouterSetupForm>({
    contactName: "",
    phone: "",
    homeRegion: "",
    homeCountryCode: "US",
    homeRegionCode: "",
  });

  React.useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const profileResp = await fetch("/api/web/v4/router/profile", { cache: "no-store", credentials: "include" });
        const profileRes = (await profileResp.json().catch(() => null)) as any;
        if (!alive) return;

        const p = profileRes?.profile ?? {};
        const contactName = p.contactName ?? user?.fullName ?? "";
        setForm((s) => ({
          ...s,
          contactName: String(contactName).trim(),
          phone: String(p.phone ?? "").trim(),
          homeRegion: String(p.homeRegion ?? "").trim(),
          homeCountryCode: (String(p.homeCountryCode ?? "US").toUpperCase() === "CA" ? "CA" : "US") as "US" | "CA",
          homeRegionCode: String(p.homeRegionCode ?? "").trim(),
        }));
      } catch {
        if (alive) setError("Failed to load setup data.");
      } finally {
        if (alive) setLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [user]);

  async function onSave() {
    if (!canSave(form, termsChecked)) return;
    setSaving(true);
    setError("");
    try {
      const regionCode = form.homeRegionCode.trim();
      const profilePayload = {
        contactName: form.contactName.trim(),
        phone: form.phone.trim(),
        homeRegion: form.homeRegion.trim(),
        homeCountryCode: form.homeCountryCode,
        homeRegionCode: regionCode,
        serviceAreas: [regionCode],
        availability: ["STATEWIDE_ROUTING"],
        homeLatitude: 0,
        homeLongitude: 0,
      };

      const profileResp = await fetch("/api/web/v4/router/profile", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        credentials: "include",
        body: JSON.stringify(profilePayload),
      });
      const profileJson = (await profileResp.json().catch(() => null)) as any;
      if (!profileResp.ok) throw new Error(String(profileJson?.error?.message ?? profileJson?.error ?? "Failed to save profile."));

      const tosResp = await fetch("/api/web/v4/router/accept-tos", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ accepted: true, version: ROUTER_TOS_VERSION }),
      });
      const tosJson = (await tosResp.json().catch(() => null)) as any;
      if (!tosResp.ok) throw new Error(String(tosJson?.error?.message ?? tosJson?.error ?? "Failed to record terms acceptance."));

      router.replace("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save setup.");
    } finally {
      setSaving(false);
    }
  }

  const regionOptions = form.homeCountryCode === "CA" ? CA_PROVINCES : US_STATES;

  return (
    <div className="mx-auto max-w-4xl space-y-8 py-10">
      <TermsSection checked={termsChecked} setChecked={setTermsChecked} />
      <div className="rounded-xl bg-white p-6 shadow dark:bg-zinc-900 space-y-4">
        <h2 className="text-xl font-semibold">Router Profile</h2>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Field label="Contact Name" value={form.contactName} onChange={(v) => setForm((s) => ({ ...s, contactName: v }))} />
          <Field label="Phone" value={form.phone} onChange={(v) => setForm((s) => ({ ...s, phone: v }))} helperText="Required" />
          <Field label="Home Region (display)" value={form.homeRegion} onChange={(v) => setForm((s) => ({ ...s, homeRegion: v }))} helperText="e.g. Ontario, California" />
          <label className="block">
            <span className="text-sm font-medium text-gray-700">Country</span>
            <select
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2"
              value={form.homeCountryCode}
              onChange={(e) => setForm((s) => ({ ...s, homeCountryCode: e.target.value as "US" | "CA", homeRegionCode: "" }))}
            >
              <option value="US">United States</option>
              <option value="CA">Canada</option>
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
                <option key={code} value={code}>
                  {code}
                </option>
              ))}
            </select>
            <span className="mt-1 block text-xs text-gray-500">Routing is state/province-wide based on this code.</span>
          </label>
        </div>
      </div>
      {error ? <div className="text-sm text-red-700">{error}</div> : null}
      <button
        disabled={loading || saving || !canSave(form, termsChecked)}
        onClick={() => void onSave()}
        className="rounded-lg bg-green-600 px-6 py-3 text-white disabled:opacity-50"
      >
        {saving ? "Saving..." : "Save & Continue"}
      </button>
    </div>
  );
}
