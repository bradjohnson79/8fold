"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useUser } from "@clerk/nextjs";
import { MapLocationSelector } from "@/components/location/MapLocationSelector";
import { JOB_POSTER_TOS_SECTIONS, JOB_POSTER_TOS_TITLE, JOB_POSTER_TOS_VERSION } from "@/lib/jobPosterTosV1";

type SetupForm = {
  name: string;
  email: string;
  phone: string;
  legalStreet: string;
  legalCity: string;
  legalProvince: string;
  legalPostalCode: string;
  legalCountry: "US" | "CA";
  mapDisplayName: string;
  lat: number;
  lng: number;
};

function canSave(form: SetupForm, termsChecked: boolean): boolean {
  return Boolean(
    termsChecked &&
      form.name.trim() &&
      form.legalStreet.trim() &&
      form.legalCity.trim() &&
      form.legalProvince.trim() &&
      form.legalPostalCode.trim() &&
      form.mapDisplayName.trim() &&
      Number.isFinite(form.lat) &&
      Number.isFinite(form.lng) &&
      !(form.lat === 0 && form.lng === 0),
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
        {JOB_POSTER_TOS_TITLE} v{JOB_POSTER_TOS_VERSION}
      </h2>

      <div className="h-64 overflow-y-scroll rounded border p-4 text-sm">
        <div className="space-y-4">
          {JOB_POSTER_TOS_SECTIONS.map((section) => (
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

function ProfileSection({
  form,
  setForm,
}: {
  form: SetupForm;
  setForm: React.Dispatch<React.SetStateAction<SetupForm>>;
}) {
  return (
    <div className="rounded-xl bg-white p-6 shadow dark:bg-zinc-900 space-y-4">
      <h2 className="text-xl font-semibold">Profile Information</h2>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Field label="Name" value={form.name} onChange={(v) => setForm((s) => ({ ...s, name: v }))} />
        <label className="block">
          <span className="text-sm font-medium text-gray-700">Email</span>
          <input
            type="email"
            value={form.email}
            readOnly
            className="mt-1 block w-full cursor-not-allowed rounded-md border border-gray-200 bg-gray-100 px-3 py-2 text-gray-500"
          />
          <span className="mt-1 block text-xs text-gray-500">Managed by your account.</span>
        </label>
        <Field label="Phone (optional)" value={form.phone} onChange={(v) => setForm((s) => ({ ...s, phone: v }))} />
      </div>

      <div className="rounded-xl border border-gray-200 p-4">
        <div className="mb-3 text-sm font-semibold text-gray-900">Legal Address</div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Field label="Street Address" value={form.legalStreet} onChange={(v) => setForm((s) => ({ ...s, legalStreet: v }))} />
          <Field label="City" value={form.legalCity} onChange={(v) => setForm((s) => ({ ...s, legalCity: v }))} />
          <Field label="State / Province" value={form.legalProvince} onChange={(v) => setForm((s) => ({ ...s, legalProvince: v }))} />
          <Field label="Postal / ZIP" value={form.legalPostalCode} onChange={(v) => setForm((s) => ({ ...s, legalPostalCode: v }))} />
          <label className="block">
            <span className="text-sm font-medium text-gray-700">Country</span>
            <select
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2"
              value={form.legalCountry}
              onChange={(e) => setForm((s) => ({ ...s, legalCountry: e.target.value as "US" | "CA" }))}
            >
              <option value="US">United States</option>
              <option value="CA">Canada</option>
            </select>
          </label>
        </div>
      </div>

      <div className="rounded-xl border border-gray-200 p-4">
        <div className="mb-3 text-sm font-semibold text-gray-900">Map Location</div>
        <MapLocationSelector
          required
          value={form.mapDisplayName}
          onChange={(data) =>
            setForm((s) => ({
              ...s,
              mapDisplayName: data.mapDisplayName,
              lat: data.lat,
              lng: data.lng,
            }))
          }
          errorText={
            !Number.isFinite(form.lat) || !Number.isFinite(form.lng) || (form.lat === 0 && form.lng === 0)
              ? "Please select a location from map results."
              : ""
          }
        />
      </div>
    </div>
  );
}

export function DashboardSetupClient() {
  const router = useRouter();
  const { user, isLoaded } = useUser();
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState("");
  const [termsChecked, setTermsChecked] = React.useState(false);
  const [form, setForm] = React.useState<SetupForm>({
    name: "",
    email: "",
    phone: "",
    legalStreet: "",
    legalCity: "",
    legalProvince: "",
    legalPostalCode: "",
    legalCountry: "US",
    mapDisplayName: "",
    lat: 0,
    lng: 0,
  });

  React.useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [meResp, profileResp] = await Promise.all([
          fetch("/api/app/me", { cache: "no-store", credentials: "include" }),
          fetch("/api/app/job-poster/profile", { cache: "no-store", credentials: "include" }),
        ]);
        const me = (await meResp.json().catch(() => null)) as any;
        const profile = (await profileResp.json().catch(() => null)) as any;
        if (!alive) return;

        const p = profile?.profile ?? {};
        setForm((s) => ({
          ...s,
          name: String(p.name ?? me?.firstName ?? "").trim(),
          email: String(p.email ?? me?.email ?? "").trim(),
          phone: String(p.phone ?? "").trim(),
          legalStreet: String(p.address ?? "").trim(),
          legalCity: String(p.city ?? "").trim(),
          legalProvince: String(p.stateProvince ?? "").trim(),
          legalPostalCode: String(p.postalCode ?? "").trim(),
          legalCountry: (String(p.country ?? "US").toUpperCase() === "CA" ? "CA" : "US") as "US" | "CA",
          mapDisplayName: String(p.mapDisplayName ?? "").trim(),
          lat: typeof p.lat === "number" ? p.lat : 0,
          lng: typeof p.lng === "number" ? p.lng : 0,
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
  }, []);

  React.useEffect(() => {
    if (!isLoaded || !user) return;
    const clerkEmail = user.primaryEmailAddress?.emailAddress ?? "";
    setForm((prev) => ({ ...prev, email: clerkEmail }));
  }, [isLoaded, user]);

  async function onSave() {
    if (!canSave(form, termsChecked)) return;
    setSaving(true);
    setError("");
    try {
      const profileResp = await fetch("/api/app/job-poster/profile", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "include",
        body: JSON.stringify(form),
      });
      const profileJson = (await profileResp.json().catch(() => null)) as any;
      if (!profileResp.ok) throw new Error(String(profileJson?.error?.message ?? profileJson?.error ?? "Failed to save profile."));

      const tosResp = await fetch("/api/app/job-poster/tos", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ accepted: true, version: JOB_POSTER_TOS_VERSION }),
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

  return (
    <div className="mx-auto max-w-4xl space-y-8 py-10">
      <TermsSection checked={termsChecked} setChecked={setTermsChecked} />
      <ProfileSection form={form} setForm={setForm} />
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
