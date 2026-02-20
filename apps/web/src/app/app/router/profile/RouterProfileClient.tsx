"use client";

import React from "react";
import { z } from "zod";
import { useUser } from "@clerk/nextjs";
import { REGION_OPTIONS } from "@/lib/regions";
import { MapLocationSelector } from "@/components/location/MapLocationSelector";
import { StripeExpressPayoutSetup } from "@/components/StripeExpressPayoutSetup";

const FormSchema = z.object({
  name: z.string().trim().min(1),
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
  const [attemptedSave, setAttemptedSave] = React.useState(false);
  const [email, setEmail] = React.useState<string>("");
  const [mapDisplayName, setMapDisplayName] = React.useState("");
  const [mapLat, setMapLat] = React.useState<number>(0);
  const [mapLng, setMapLng] = React.useState<number>(0);

  const regionOptions = React.useMemo(() => {
    if (country !== "CA" && country !== "US") return [];
    return REGION_OPTIONS[country];
  }, [country]);

  React.useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const resp = await fetch("/api/app/router/profile", { cache: "no-store", credentials: "include" });
        const json = (await resp.json().catch(() => null)) as RouterProfileResp | null;
        if (!alive) return;
        if (!resp.ok || !json || json.ok !== true) {
          throw new Error(typeof (json as any)?.error === "string" ? (json as any).error : "Failed to load profile");
        }

        const data = json.data;
        const nextName = data.profile?.name ?? "";
        const nextEmail = String(data.router.email ?? "").trim() || String(clerkEmail ?? "").trim();
        const nextAddr = String(data.profile?.address ?? "").trim();
        const nextCity = String(data.profile?.city ?? "").trim();
        const nextPostal = String(data.profile?.postalCode ?? "").trim();
        const nextCountry = String(data.profile?.country ?? data.router.homeCountry ?? "").trim().toUpperCase();
        const nextState = String(data.profile?.stateProvince ?? data.router.homeRegionCode ?? "").trim().toUpperCase();
        setCountry(nextCountry === "CA" || nextCountry === "US" ? (nextCountry as any) : "");
        setStateProvince(nextState);
        setForm((s) => ({
          ...s,
          name: String(nextName ?? ""),
          address: nextAddr,
          city: nextCity,
          postalCode: nextPostal,
        }));
        setEmail(String(nextEmail ?? ""));
        setMapDisplayName(String(data.router.formattedAddress ?? "").trim());
        setMapLat(Number(data.profile?.lat ?? 0) || 0);
        setMapLng(Number(data.profile?.lng ?? 0) || 0);
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
    setAttemptedSave(true);
    setError("");
    setNotice("");
    try {
      const parsed = FormSchema.safeParse(form);
      if (!parsed.success) throw new Error("Please fill all required fields correctly.");
      if (country !== "CA" && country !== "US") throw new Error("Please select a country.");
      const sp = String(stateProvince ?? "").trim().toUpperCase();
      if (!sp) throw new Error("Please select a state / province.");
      if (!Number.isFinite(mapLat) || !Number.isFinite(mapLng) || mapLat === 0 || mapLng === 0) {
        throw new Error("Please select your location from the map suggestions.");
      }

      setSaving(true);
      const resp = await fetch("/api/app/router/profile", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: parsed.data.name,
          address: parsed.data.address,
          city: parsed.data.city,
          stateProvince: sp,
          postalCode: parsed.data.postalCode,
          country,
          mapDisplayName: mapDisplayName.trim(),
          lat: mapLat,
          lng: mapLng,
        }),
      });
      const json = await resp.json().catch(() => null);
      if (!resp.ok) {
        const code = String(json?.error ?? "");
        if (code === "INVALID_INPUT") throw new Error("Please fill all required fields.");
        if (code === "INVALID_GEO") throw new Error("Please select a map location result.");
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

  const geoSelected = Number.isFinite(mapLat) && Number.isFinite(mapLng) && !(mapLat === 0 && mapLng === 0);
  const showMapError = !geoSelected && (attemptedSave || (form.address.trim() && mapDisplayName.trim()));
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

      <div className="mt-6 border border-gray-200 rounded-2xl p-5">
        <div className="font-bold text-gray-900">Map location</div>
        <div className="text-sm text-gray-600 mt-1">Required. Used to calculate routing distance.</div>
        <div className="mt-3">
          <MapLocationSelector
            required
            value={mapDisplayName}
            onChange={(data) => {
              setMapDisplayName(data.mapDisplayName);
              setMapLat(data.lat);
              setMapLng(data.lng);
            }}
            errorText={showMapError ? "Please select your location from the map suggestions." : ""}
          />
        </div>

        {geoSelected ? (
          <div className="mt-4 bg-gray-50 border border-gray-200 rounded-xl p-4">
            <div className="text-sm font-semibold text-gray-900">Saved location</div>
            <div className="text-sm text-gray-700 mt-1">{mapDisplayName.trim() || "Location saved"}</div>
            <div className="text-xs text-gray-600 font-mono mt-2">
              lat {mapLat.toFixed(6)}, lng {mapLng.toFixed(6)}
            </div>
            <div className="mt-2">
              <a
                href={`https://www.openstreetmap.org/?mlat=${encodeURIComponent(String(mapLat))}&mlon=${encodeURIComponent(
                  String(mapLng),
                )}#map=18/${encodeURIComponent(String(mapLat))}/${encodeURIComponent(String(mapLng))}`}
                target="_blank"
                rel="noreferrer"
                className="text-sm font-semibold text-8fold-green hover:text-8fold-green-dark"
              >
                View on OpenStreetMap
              </a>
            </div>
          </div>
        ) : null}
      </div>

      <StripeExpressPayoutSetup />

      <div className="mt-6">
        <button
          disabled={
            loading ||
            saving ||
            !form.name.trim() ||
            !form.address.trim() ||
            !form.city.trim() ||
            !form.postalCode.trim() ||
            !(country === "CA" || country === "US") ||
            !String(stateProvince ?? "").trim() ||
            !geoSelected
          }
          onClick={save}
          className={`font-semibold px-4 py-2 rounded-lg ${
            loading ||
            saving ||
            !form.name.trim() ||
            !form.address.trim() ||
            !form.city.trim() ||
            !form.postalCode.trim() ||
            !(country === "CA" || country === "US") ||
            !String(stateProvince ?? "").trim() ||
            !geoSelected
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

