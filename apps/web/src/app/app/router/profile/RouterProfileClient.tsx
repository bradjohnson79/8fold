"use client";

import React from "react";
import { z } from "zod";
import { PayoutMethodSetup } from "../../../../components/PayoutMethodSetup";
import { REGION_OPTIONS } from "@/lib/regions";

const FormSchema = z.object({
  name: z.string().trim().min(1),
  email: z.string().trim().email(),
  addressPrivate: z.string().trim().min(1),
});

type RouterProfileForm = z.infer<typeof FormSchema>;

type RouterProfileResp = {
  ok?: boolean;
  router?: {
    homeRegionCode?: string;
    homeCountry?: string;
    email?: string | null;
    termsAccepted?: boolean;
    profileComplete?: boolean;
  };
  profile?: { name?: string | null; addressPrivate?: string | null; state?: string | null };
  error?: string;
};

function regionLabel(codeRaw: string, nameRaw: string): string {
  const code = String(codeRaw ?? "").trim().toUpperCase();
  const name = String(nameRaw ?? "").trim();
  if (!code) return "—";
  return name ? `${code} — ${name}` : code;
}

export default function RouterProfileClient() {
  const [form, setForm] = React.useState<RouterProfileForm>({
    name: "",
    email: "",
    addressPrivate: "",
  });
  const [country, setCountry] = React.useState<"CA" | "US" | "">("");
  const [regionCode, setRegionCode] = React.useState<string>("");
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string>("");
  const [notice, setNotice] = React.useState<string>("");
  const [isAdmin, setIsAdmin] = React.useState(false);
  const [termsAccepted, setTermsAccepted] = React.useState(false);

  const regionOptions = React.useMemo(() => {
    if (country !== "CA" && country !== "US") return [];
    return REGION_OPTIONS[country];
  }, [country]);

  React.useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [meResp, resp] = await Promise.all([
          fetch("/api/app/me", { cache: "no-store" }).catch(() => null as any),
          fetch("/api/app/router/profile", { cache: "no-store" }),
        ]);
        const meJson = await meResp?.json?.().catch(() => null);
        const json = (await resp.json().catch(() => null)) as RouterProfileResp | null;
        if (!alive) return;
        setIsAdmin(Boolean(meJson?.superuser));
        if (!resp.ok) throw new Error(json?.error ?? "Failed to load profile");

        const nextName = json?.profile?.name ?? "";
        const nextEmail = json?.router?.email ?? "";
        const nextAddr = (json as any)?.profile?.addressPrivate ?? "";
        const nextCountry = String(json?.router?.homeCountry ?? "").trim().toUpperCase();
        const nextRegion = String(json?.router?.homeRegionCode ?? "").trim().toUpperCase();
        setCountry(nextCountry === "CA" || nextCountry === "US" ? (nextCountry as any) : "");
        setRegionCode(nextRegion);
        setForm((s) => ({
          ...s,
          name: String(nextName ?? ""),
          email: String(nextEmail ?? ""),
          addressPrivate: String(nextAddr ?? ""),
        }));
        setTermsAccepted(Boolean((json as any)?.router?.termsAccepted));
      } catch (e) {
        if (!alive) return;
        setError(e instanceof Error ? e.message : "Failed to load");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  async function save() {
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const parsed = FormSchema.safeParse(form);
      if (!parsed.success) throw new Error("Please fill all required fields correctly.");
      if (country !== "CA" && country !== "US") throw new Error("Please select a country.");
      const rc = String(regionCode ?? "").trim().toUpperCase();
      if (!rc) throw new Error("Please select a state / province.");

      const resp = await fetch("/api/app/router/profile", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: parsed.data.name,
          email: parsed.data.email,
          addressPrivate: parsed.data.addressPrivate,
          termsAccepted,
          country,
          regionCode: rc,
        }),
      });
      const json = await resp.json().catch(() => null);
      if (!resp.ok) throw new Error(json?.error ?? "Failed to save");
      setNotice("Saved.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <h2 className="text-lg font-bold text-gray-900">Profile</h2>
      <p className="text-gray-600 mt-2">Keep your payout and contact details up to date.</p>

      {error ? <div className="mt-4 text-sm text-red-600">{error}</div> : null}
      {notice ? <div className="mt-4 text-sm text-8fold-green font-semibold">{notice}</div> : null}

      <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
        <Field label="Name" placeholder="Jane Router" value={form.name} onChange={(v) => setForm((s) => ({ ...s, name: v }))} />
        <Field label="Email" placeholder="jane@domain.com" value={form.email} onChange={(v) => setForm((s) => ({ ...s, email: v }))} />
        <Field
          label="Address (private)"
          placeholder="123 Main St"
          value={form.addressPrivate}
          onChange={(v) => setForm((s) => ({ ...s, addressPrivate: v }))}
        />
        <Select
          label="Country"
          value={country}
          onChange={(v) => {
            const next = String(v ?? "").toUpperCase();
            const nextCountry = next === "CA" || next === "US" ? (next as any) : "";
            setCountry(nextCountry);
            // On country change: reset regionCode and refresh dropdown options.
            setRegionCode("");
          }}
          options={[
            { value: "", label: "Select…" },
            { value: "CA", label: "CA — Canada" },
            { value: "US", label: "US — United States" },
          ]}
        />
        <Select
          label="State / Province"
          value={regionCode}
          onChange={(v) => setRegionCode(String(v ?? "").toUpperCase())}
          disabled={!country}
          options={[
            { value: "", label: country ? "Select…" : "Select a country first" },
            ...regionOptions.map((o) => ({ value: o.code, label: regionLabel(o.code, o.name) })),
          ]}
          helperText={isAdmin ? undefined : "Changing country resets the state/province selection."}
        />
      </div>

      <div className="mt-6 border border-gray-200 rounded-2xl p-5">
        <div className="font-bold text-gray-900">Router Terms & Conditions</div>
        <div className="text-sm text-gray-600 mt-1">Required to access routing tools.</div>
        <label className="mt-4 inline-flex items-center gap-2 text-sm text-gray-800">
          <input type="checkbox" checked={termsAccepted} onChange={(e) => setTermsAccepted(e.target.checked)} />
          I accept the Router Terms & Conditions.
        </label>
      </div>

      <div className="mt-6">
        <button
          disabled={loading || saving}
          onClick={save}
          className={`font-semibold px-4 py-2 rounded-lg ${
            loading || saving ? "bg-gray-200 text-gray-600" : "bg-8fold-green text-white hover:bg-8fold-green-dark"
          }`}
        >
          {saving ? "Saving…" : "Save"}
        </button>
      </div>

      <PayoutMethodSetup title="Payout setup" subtitle="Choose how you’d like to receive router payouts." />
    </>
  );
}

function Field({
  label,
  placeholder,
  value,
  onChange,
  disabled,
  helperText,
}: {
  label: string;
  placeholder: string;
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  helperText?: string;
}) {
  return (
    <label className="block">
      <div className="text-sm font-medium text-gray-700">{label}</div>
      <input
        className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 disabled:bg-gray-50 disabled:text-gray-500"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
      />
      {helperText ? <div className="mt-1 text-xs text-gray-500">{helperText}</div> : null}
    </label>
  );
}

function Select({
  label,
  value,
  onChange,
  options,
  disabled,
  helperText,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: Array<{ value: string; label: string }>;
  disabled?: boolean;
  helperText?: string;
}) {
  return (
    <label className="block">
      <div className="text-sm font-medium text-gray-700">{label}</div>
      <select
        className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 disabled:bg-gray-50 disabled:text-gray-500"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
      >
        {options.map((o) => (
          <option key={o.value || o.label} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      {helperText ? <div className="mt-1 text-xs text-gray-500">{helperText}</div> : null}
    </label>
  );
}

