"use client";

import React from "react";
import { z } from "zod";
import { useUser } from "@clerk/nextjs";
import { REGION_OPTIONS } from "@/lib/regions";
import { StripeExpressPayoutSetup } from "@/components/StripeExpressPayoutSetup";

const FormSchema = z.object({
  name: z.string().trim().min(1),
  phone: z.string().trim().min(7).max(40),
  address: z.string().trim().min(1).max(200),
  city: z.string().trim().min(1).max(120),
  postalCode: z.string().trim().min(3).max(24),
});

type RouterProfileForm = z.infer<typeof FormSchema>;

type RouterProfileResp =
  | {
      ok: true;
      data: {
        router: {
          userId: string;
          email: string | null;
          formattedAddress: string | null;
          hasAcceptedTerms: boolean;
          homeCountry: string | null;
          homeRegionCode: string | null;
        };
        profile:
          | null
          | {
              name: string | null;
              address: string | null;
              city: string | null;
              stateProvince: string | null;
              postalCode: string | null;
              country: string | null;
              lat: number | null;
              lng: number | null;
            };
      };
    }
  | { ok: false; error: string };

function regionLabel(codeRaw: string, nameRaw: string): string {
  const code = String(codeRaw ?? "").trim().toUpperCase();
  const name = String(nameRaw ?? "").trim();
  if (!code) return "—";
  return name ? `${code} — ${name}` : code;
}

export default function RouterProfileClient(props?: { onComplete?: () => void }) {
  const { user } = useUser();
  const clerkEmail = user?.primaryEmailAddress?.emailAddress ?? "";

  const [form, setForm] = React.useState<RouterProfileForm>({
    name: "",
    phone: "",
    address: "",
    city: "",
    postalCode: "",
  });
  const [country, setCountry] = React.useState<"CA" | "US" | "">("");
  const [stateProvince, setStateProvince] = React.useState<string>("");
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string>("");
  const [notice, setNotice] = React.useState<string>("");
  const [email, setEmail] = React.useState<string>("");

  const regionOptions = React.useMemo(() => {
    if (country !== "CA" && country !== "US") return [];
    return REGION_OPTIONS[country];
  }, [country]);

  React.useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const resp = await fetch("/api/web/v4/router/profile", { cache: "no-store", credentials: "include" });
        const json = (await resp.json().catch(() => null)) as { ok?: boolean; profile?: Record<string, unknown> } | null;
        if (!alive) return;
        if (!resp.ok || !json?.ok) {
          throw new Error(typeof (json as any)?.error === "string" ? (json as any).error : "Failed to load profile");
        }

        const p = json.profile ?? {};
        const nextName = String(p.contactName ?? "").trim();
        const nextEmail = String(p.email ?? clerkEmail ?? "").trim() || String(clerkEmail ?? "").trim();
        const nextCountry = String(p.homeCountryCode ?? "US").trim().toUpperCase();
        const nextState = String(p.homeRegionCode ?? "").trim().toUpperCase();
        const nextRegion = String(p.homeRegion ?? "").trim();
        setCountry(nextCountry === "CA" || nextCountry === "US" ? (nextCountry as any) : "");
        setStateProvince(nextState);
        const nextPhone = String((p as any).phone ?? "").trim();
        setForm((s) => ({
          ...s,
          name: nextName,
          phone: nextPhone,
          address: nextRegion || nextState,
          city: nextRegion || nextState,
          postalCode: nextState || "",
        }));
        setEmail(String(nextEmail ?? ""));
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
    setError("");
    setNotice("");
    try {
      const parsed = FormSchema.safeParse(form);
      if (!parsed.success) throw new Error("Please fill all required fields correctly.");
      if (country !== "CA" && country !== "US") throw new Error("Please select a country.");
      const sp = String(stateProvince ?? "").trim().toUpperCase();
      if (!sp) throw new Error("Please select a state / province.");

      setSaving(true);
      const resp = await fetch("/api/web/v4/router/profile", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          contactName: parsed.data.name,
          phone: parsed.data.phone,
          homeRegion: parsed.data.city || sp,
          homeCountryCode: country,
          homeRegionCode: sp,
        }),
      });
      const json = await resp.json().catch(() => null);
      if (!resp.ok) {
        const code = String(json?.error ?? "");
        if (code === "INVALID_INPUT") throw new Error("Please fill all required fields.");
        throw new Error("Unable to save profile. Please try again.");
      }
      setNotice("Saved.");
      props?.onComplete?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  const displayEmail = String(email || clerkEmail || "").trim();

  return (
    <>
      <h2 className="text-lg font-bold text-gray-900">Profile</h2>
      <p className="text-gray-600 mt-2">Keep your payout and contact details up to date.</p>

      {error ? <div className="mt-4 text-sm text-red-600">{error}</div> : null}
      {notice ? <div className="mt-4 text-sm text-8fold-green font-semibold">{notice}</div> : null}

      <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
        <Field
          label="Name *"
          placeholder="Jane Router"
          value={form.name}
          onChange={(v) => setForm((s) => ({ ...s, name: v }))}
        />
        <Field
          label="Phone *"
          placeholder="+1 555 123 4567"
          value={form.phone}
          onChange={(v) => setForm((s) => ({ ...s, phone: v }))}
        />
        <Field
          label="Email"
          placeholder="jane@domain.com"
          value={displayEmail}
          onChange={() => {}}
          disabled
          helperText="Email is managed by your account."
        />
        <Field
          label="Address *"
          placeholder="5393 201 Street"
          value={form.address}
          onChange={(v) => setForm((s) => ({ ...s, address: v }))}
        />
        <Field
          label="City *"
          placeholder="Langley"
          value={form.city}
          onChange={(v) => setForm((s) => ({ ...s, city: v }))}
        />
        <Field
          label="Postal / ZIP *"
          placeholder="V2Y 0R2"
          value={form.postalCode}
          onChange={(v) => setForm((s) => ({ ...s, postalCode: v }))}
        />
        <Select
          label="Country *"
          value={country}
          onChange={(v) => {
            const next = String(v ?? "").toUpperCase();
            const nextCountry = next === "CA" || next === "US" ? (next as any) : "";
            setCountry(nextCountry);
            // On country change: reset state/province selection.
            setStateProvince("");
          }}
          options={[
            { value: "", label: "Select…" },
            { value: "CA", label: "CA — Canada" },
            { value: "US", label: "US — United States" },
          ]}
        />
        <Select
          label="State / Province *"
          value={stateProvince}
          onChange={(v) => setStateProvince(String(v ?? "").toUpperCase())}
          disabled={false}
          options={[
            { value: "", label: country ? "Select…" : "Select a country first" },
            ...regionOptions.map((o) => ({ value: o.code, label: regionLabel(o.code, o.name) })),
          ]}
          helperText="Changing country resets the state/province selection."
        />
      </div>

      <StripeExpressPayoutSetup />

      <div className="mt-6">
        <button
          disabled={
            loading ||
            saving ||
            !form.name.trim() ||
            !form.phone.trim() ||
            form.phone.trim().length < 7 ||
            !form.address.trim() ||
            !form.city.trim() ||
            !form.postalCode.trim() ||
            !(country === "CA" || country === "US") ||
            !String(stateProvince ?? "").trim()
          }
          onClick={save}
          className={`font-semibold px-4 py-2 rounded-lg ${
            loading ||
            saving ||
            !form.name.trim() ||
            !form.phone.trim() ||
            form.phone.trim().length < 7 ||
            !form.address.trim() ||
            !form.city.trim() ||
            !form.postalCode.trim() ||
            !(country === "CA" || country === "US") ||
            !String(stateProvince ?? "").trim()
              ? "bg-gray-200 text-gray-600"
              : "bg-8fold-green text-white hover:bg-8fold-green-dark"
          }`}
        >
          {saving ? "Saving…" : "Save"}
        </button>
      </div>
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

