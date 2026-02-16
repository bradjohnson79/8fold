"use client";

import React from "react";
import { PayoutMethodSetup } from "../../../../../components/PayoutMethodSetup";
import { TradeCategoryLabel, TradeCategorySchema } from "@8fold/shared";
import { OnboardingProgressBar } from "@/components/onboarding/OnboardingProgressBar";

type AddressResult = {
  place_id: string | number | null;
  display_name: string;
  address: any | null;
};

type ContractorProfile = {
  // identity
  firstName: string;
  lastName: string;
  businessName: string;
  businessNumber: string;

  // address
  addressMode: "SEARCH" | "MANUAL";
  addressSearchDisplayName: string;
  address1: string;
  address2: string;
  apt: string;
  city: string;
  postalCode: string;
  stateProvince: string;
  country: "US" | "CA";

  // trade
  tradeCategory: (typeof TradeCategorySchema.options)[number] | "";
  tradeStartYear: string; // YYYY
  tradeStartMonth: string; // 1-12
  tradeStartConfirmed: boolean;

  // server hints
  status?: string | null;
  wizardCompleted?: boolean;
};

function months() {
  return [
    { v: "1", label: "Jan" },
    { v: "2", label: "Feb" },
    { v: "3", label: "Mar" },
    { v: "4", label: "Apr" },
    { v: "5", label: "May" },
    { v: "6", label: "Jun" },
    { v: "7", label: "Jul" },
    { v: "8", label: "Aug" },
    { v: "9", label: "Sep" },
    { v: "10", label: "Oct" },
    { v: "11", label: "Nov" },
    { v: "12", label: "Dec" },
  ];
}

function experienceYears(startYear: number, startMonth: number, now = new Date()): number {
  const startMonths = startYear * 12 + (startMonth - 1);
  const curMonths = now.getUTCFullYear() * 12 + now.getUTCMonth();
  return (curMonths - startMonths) / 12;
}

export default function ContractorProfilePage() {
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState("");
  const [notice, setNotice] = React.useState("");
  const [denial, setDenial] = React.useState("");
  const [status, setStatus] = React.useState<any | null>(null);

  const [businessNameTouched, setBusinessNameTouched] = React.useState(false);
  const [form, setForm] = React.useState<ContractorProfile>({
    firstName: "",
    lastName: "",
    businessName: "",
    businessNumber: "",
    addressMode: "SEARCH",
    addressSearchDisplayName: "",
    address1: "",
    address2: "",
    apt: "",
    city: "",
    postalCode: "",
    stateProvince: "",
    country: "CA",
    tradeCategory: "",
    tradeStartYear: "",
    tradeStartMonth: "",
    tradeStartConfirmed: false,
    status: null,
    wizardCompleted: false,
  });

  React.useEffect(() => {
    let alive = true;
    (async () => {
      const resp = await fetch("/api/app/onboarding/status", { cache: "no-store", credentials: "include" }).catch(() => null as any);
      const json = await resp?.json?.().catch(() => null);
      if (!alive) return;
      if (json && json.ok) setStatus(json);
    })();
    return () => {
      alive = false;
    };
  }, []);

  // Address search UI
  const [addrQuery, setAddrQuery] = React.useState("");
  const [addrResults, setAddrResults] = React.useState<AddressResult[]>([]);
  const [addrLoading, setAddrLoading] = React.useState(false);

  // Start-date confirmation modal
  const [confirmOpen, setConfirmOpen] = React.useState(false);

  const years = React.useMemo(() => {
    const out: string[] = [];
    for (let y = 2026; y >= 1926; y--) out.push(String(y));
    return out;
  }, []);

  const selectedMonthLabel =
    months().find((m) => m.v === form.tradeStartMonth)?.label ?? form.tradeStartMonth;

  const expYears = React.useMemo(() => {
    const y = Number(form.tradeStartYear);
    const m = Number(form.tradeStartMonth);
    if (!y || !m) return null;
    const v = experienceYears(y, m);
    return Number.isFinite(v) ? v : null;
  }, [form.tradeStartYear, form.tradeStartMonth]);

  React.useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const resp = await fetch("/api/app/contractor/profile", { cache: "no-store" });
        const json = await resp.json().catch(() => null);
        if (!alive) return;
        if (!resp.ok) throw new Error(json?.error ?? "Failed to load profile");
        const p = json?.profile ?? null;
        if (!p) return;
        const tradeParsed = TradeCategorySchema.safeParse(p.tradeCategory);

        setForm((s) => ({
          ...s,
          firstName: String(p.firstName ?? ""),
          lastName: String(p.lastName ?? ""),
          businessName: String(p.businessName ?? ""),
          businessNumber: String(p.businessNumber ?? ""),
          addressMode: String(p.addressMode ?? "SEARCH") === "MANUAL" ? "MANUAL" : "SEARCH",
          addressSearchDisplayName: String(p.addressSearchDisplayName ?? ""),
          address1: String(p.address1 ?? ""),
          address2: String(p.address2 ?? ""),
          apt: String(p.apt ?? ""),
          city: String(p.city ?? ""),
          postalCode: String(p.postalCode ?? ""),
          stateProvince: String(p.stateProvince ?? ""),
          country: String(p.country ?? "CA") === "US" ? "US" : "CA",
          tradeCategory: tradeParsed.success ? tradeParsed.data : "",
          tradeStartYear: p.tradeStartYear != null ? String(p.tradeStartYear) : "",
          tradeStartMonth: p.tradeStartMonth != null ? String(p.tradeStartMonth) : "",
          tradeStartConfirmed: Boolean(p.tradeStartYear && p.tradeStartMonth),
          status: String(p.status ?? ""),
          wizardCompleted: Boolean(p.wizardCompleted),
        }));
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  React.useEffect(() => {
    if (form.addressMode !== "SEARCH") return;
    const q = addrQuery.trim();
    if (!q) {
      setAddrResults([]);
      return;
    }
    let cancelled = false;
    setAddrLoading(true);
    const t = setTimeout(() => {
      (async () => {
        try {
          const resp = await fetch(`/api/app/contractor/address-search?q=${encodeURIComponent(q)}`, {
            cache: "no-store",
          });
          const json = await resp.json().catch(() => null);
          const list = Array.isArray(json?.results) ? (json.results as AddressResult[]) : [];
          if (!cancelled) setAddrResults(list);
        } finally {
          if (!cancelled) setAddrLoading(false);
        }
      })();
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [addrQuery, form.addressMode]);

  function pickAddress(r: AddressResult) {
    const display = String(r?.display_name ?? "").trim();
    const a = (r?.address ?? {}) as any;
    const city = String(a.city ?? a.town ?? a.village ?? a.hamlet ?? "").trim();
    const state = String(a.state ?? a.state_code ?? a.region ?? "").trim();
    const postcode = String(a.postcode ?? "").trim();
    const countryCode = String(a.country_code ?? "").trim().toUpperCase();
    const country = countryCode === "US" ? "US" : countryCode === "CA" ? "CA" : form.country;

    setForm((s) => ({
      ...s,
      addressSearchDisplayName: display,
      city: city || s.city,
      postalCode: postcode || s.postalCode,
      stateProvince: (state.length === 2 ? state.toUpperCase() : s.stateProvince).toUpperCase(),
      country,
    }));
    setAddrQuery(display);
    setAddrResults([]);
  }

  function onChangeStartDate(next: Partial<Pick<ContractorProfile, "tradeStartYear" | "tradeStartMonth">>) {
    setForm((s) => ({ ...s, ...next, tradeStartConfirmed: false }));
  }

  const addressOk =
    form.addressMode === "SEARCH"
      ? Boolean(form.addressSearchDisplayName.trim())
      : Boolean(
          form.address1.trim() &&
            form.city.trim() &&
            form.postalCode.trim() &&
            form.stateProvince.trim().length >= 2 &&
            form.country
        );

  const requiredOk =
    Boolean(form.firstName.trim()) &&
    Boolean(form.lastName.trim()) &&
    Boolean(form.tradeCategory) &&
    Boolean(form.tradeStartYear) &&
    Boolean(form.tradeStartMonth) &&
    Boolean(form.tradeStartConfirmed) &&
    addressOk &&
    Boolean(form.stateProvince.trim());

  async function save() {
    setSaving(true);
    setError("");
    setNotice("");
    setDenial("");
    try {
      const businessName =
        form.businessName.trim() || `${form.firstName.trim()} ${form.lastName.trim()}`.trim();

      const payload = {
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        businessName,
        businessNumber: form.businessNumber.trim() || null,
        addressMode: form.addressMode,
        addressSearchDisplayName: form.addressSearchDisplayName.trim() || null,
        address1: form.address1.trim() || null,
        address2: form.address2.trim() || null,
        apt: form.apt.trim() || null,
        city: form.city.trim() || null,
        postalCode: form.postalCode.trim() || null,
        stateProvince: form.stateProvince.trim().toUpperCase(),
        country: form.country,
        tradeCategory: form.tradeCategory,
        tradeStartYear: Number(form.tradeStartYear),
        tradeStartMonth: Number(form.tradeStartMonth),
      };

      const resp = await fetch("/api/app/contractor/profile", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await resp.json().catch(() => null);
      if (!resp.ok) {
        const msg = String(json?.error ?? "Failed to save profile");
        if (String(json?.status ?? "") === "DENIED_INSUFFICIENT_EXPERIENCE") {
          setDenial(msg);
          setForm((s) => ({ ...s, status: "DENIED_INSUFFICIENT_EXPERIENCE", wizardCompleted: false }));
          return;
        }
        throw new Error(msg);
      }
      setNotice("Saved.");
      setForm((s) => ({ ...s, status: "ACTIVE", wizardCompleted: true }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  // Auto-default business name to "First Last" if empty and untouched.
  React.useEffect(() => {
    if (businessNameTouched) return;
    const fn = form.firstName.trim();
    const ln = form.lastName.trim();
    if (!fn || !ln) return;
    if (form.businessName.trim()) return;
    setForm((s) => ({ ...s, businessName: `${fn} ${ln}`.trim() }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.firstName, form.lastName, businessNameTouched]);

  const title = form.wizardCompleted ? "Profile" : "Complete your contractor profile";

  return (
    <>
      {status?.steps ? (
        <div className="mb-6">
          <OnboardingProgressBar title="Contractor onboarding" steps={status.steps} />
        </div>
      ) : null}
      <h2 className="text-lg font-bold text-gray-900">{title}</h2>
      <p className="text-gray-600 mt-2">We need a few details to determine eligibility and route jobs correctly.</p>

      {error ? <div className="mt-4 text-sm text-red-600">{error}</div> : null}
      {denial ? (
        <div className="mt-4 border border-red-200 bg-red-50 text-red-800 rounded-xl px-4 py-3 text-sm font-semibold">
          {denial} Your account is kept on record.
        </div>
      ) : null}
      {notice ? <div className="mt-4 text-sm text-8fold-green font-semibold">{notice}</div> : null}

      <div className="mt-6">
        <div className="text-sm font-bold text-gray-900">Identity</div>
        <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="First Name" value={form.firstName} onChange={(v) => setForm((s) => ({ ...s, firstName: v }))} required />
          <Field label="Last Name" value={form.lastName} onChange={(v) => setForm((s) => ({ ...s, lastName: v }))} required />
          <Field
            label="Business Name (optional)"
            value={form.businessName}
            onChange={(v) => {
              setBusinessNameTouched(true);
              setForm((s) => ({ ...s, businessName: v }));
            }}
            helperText={form.businessName.trim() ? undefined : "If empty, this will default to “First Last”."}
          />
          <Field label="Business Number (optional)" value={form.businessNumber} onChange={(v) => setForm((s) => ({ ...s, businessNumber: v }))} />
        </div>
      </div>

      <div className="mt-10">
        <div className="text-sm font-bold text-gray-900">Address</div>
        <div className="mt-2 text-sm text-gray-600">Choose OpenStreetMap search or enter it manually. Either option works.</div>

        <div className="mt-4 flex items-center gap-4 text-sm">
          <label className="inline-flex items-center gap-2">
            <input type="radio" checked={form.addressMode === "SEARCH"} onChange={() => setForm((s) => ({ ...s, addressMode: "SEARCH" }))} />
            <span className="font-semibold text-gray-900">Search (OpenStreetMap)</span>
          </label>
          <label className="inline-flex items-center gap-2">
            <input type="radio" checked={form.addressMode === "MANUAL"} onChange={() => setForm((s) => ({ ...s, addressMode: "MANUAL" }))} />
            <span className="font-semibold text-gray-900">Manual entry</span>
          </label>
        </div>

        {form.addressMode === "SEARCH" ? (
          <div className="mt-4">
            <Field
              label="Address search"
              value={addrQuery}
              onChange={(v) => setAddrQuery(v)}
              placeholder="Start typing an address…"
              helperText={addrLoading ? "Searching…" : undefined}
            />
            {addrResults.length ? (
              <div className="mt-2 border border-gray-200 rounded-xl overflow-hidden">
                {addrResults.map((r) => (
                  <button
                    type="button"
                    key={String(r.place_id ?? r.display_name)}
                    onClick={() => pickAddress(r)}
                    className="w-full text-left px-4 py-3 hover:bg-gray-50 border-b border-gray-100 last:border-b-0"
                  >
                    <div className="text-sm text-gray-900 font-medium">{r.display_name}</div>
                  </button>
                ))}
              </div>
            ) : null}
            <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-4">
              <Field label="City" value={form.city} onChange={(v) => setForm((s) => ({ ...s, city: v }))} />
              <Field label="State / Province" value={form.stateProvince} onChange={(v) => setForm((s) => ({ ...s, stateProvince: v }))} placeholder="BC" required />
              <Select
                label="Country"
                value={form.country}
                onChange={(v) => setForm((s) => ({ ...s, country: v as any }))}
                options={[
                  { value: "CA", label: "Canada" },
                  { value: "US", label: "United States" },
                ]}
              />
            </div>
            <Field label="Selected address" value={form.addressSearchDisplayName} onChange={() => {}} disabled helperText="This is stored as provided by OpenStreetMap (no verification)." />
          </div>
        ) : (
          <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="Address1" value={form.address1} onChange={(v) => setForm((s) => ({ ...s, address1: v }))} required />
            <Field label="Address2 (optional)" value={form.address2} onChange={(v) => setForm((s) => ({ ...s, address2: v }))} />
            <Field label="Apt (optional)" value={form.apt} onChange={(v) => setForm((s) => ({ ...s, apt: v }))} />
            <Field label="City" value={form.city} onChange={(v) => setForm((s) => ({ ...s, city: v }))} required />
            <Field label="Postal / ZIP" value={form.postalCode} onChange={(v) => setForm((s) => ({ ...s, postalCode: v }))} required />
            <Field label="State / Province" value={form.stateProvince} onChange={(v) => setForm((s) => ({ ...s, stateProvince: v }))} placeholder="BC" required />
            <Select
              label="Country"
              value={form.country}
              onChange={(v) => setForm((s) => ({ ...s, country: v as any }))}
              options={[
                { value: "CA", label: "Canada" },
                { value: "US", label: "United States" },
              ]}
            />
          </div>
        )}
      </div>

      <div className="mt-10">
        <div className="text-sm font-bold text-gray-900">Trade</div>
        <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-4">
          <Select
            label="Trade"
            value={form.tradeCategory || ""}
            onChange={(v) => setForm((s) => ({ ...s, tradeCategory: v as any }))}
            options={[
              { value: "", label: "Select a trade" },
              ...TradeCategorySchema.options.map((k) => ({ value: k, label: TradeCategoryLabel[k] })),
            ]}
            required
          />
          <div className="grid grid-cols-2 gap-3">
            <Select
              label="Start year"
              value={form.tradeStartYear}
              onChange={(v) => onChangeStartDate({ tradeStartYear: v })}
              options={[{ value: "", label: "Year" }, ...years.map((y) => ({ value: y, label: y }))]}
              required
            />
            <Select
              label="Start month"
              value={form.tradeStartMonth}
              onChange={(v) => onChangeStartDate({ tradeStartMonth: v })}
              options={[{ value: "", label: "Month" }, ...months().map((m) => ({ value: m.v, label: m.label }))]}
              required
            />
          </div>
        </div>

        <div className="mt-3 flex items-center gap-3">
          <button
            type="button"
            onClick={() => setConfirmOpen(true)}
            disabled={!form.tradeStartYear || !form.tradeStartMonth || form.tradeStartConfirmed}
            className="bg-white border border-gray-200 hover:bg-gray-50 disabled:bg-gray-100 disabled:text-gray-500 text-gray-900 font-semibold px-4 py-2 rounded-lg"
          >
            {form.tradeStartConfirmed ? "Start date confirmed" : "Confirm start date"}
          </button>
          {expYears != null ? (
            <div className="text-sm text-gray-700">
              Experience: <span className="font-semibold">{expYears.toFixed(1)} years</span>
              {expYears < 3 ? <span className="text-red-700 font-semibold"> (minimum 3 years required)</span> : null}
            </div>
          ) : null}
        </div>
      </div>

      <div className="mt-8">
        <button
          disabled={loading || saving || !requiredOk}
          onClick={() => void save()}
          className={`font-semibold px-5 py-2.5 rounded-lg ${
            loading || saving || !requiredOk ? "bg-gray-200 text-gray-600" : "bg-8fold-green text-white hover:bg-8fold-green-dark"
          }`}
        >
          {saving ? "Saving…" : "Save"}
        </button>
        {!requiredOk ? <div className="mt-2 text-xs text-gray-500">Fill required fields and confirm your trade start date to enable saving.</div> : null}
      </div>

      <PayoutMethodSetup title="Payout setup" subtitle="Choose how you’d like to receive contractor payouts." />

      {confirmOpen ? (
        <ConfirmModal
          title="Confirm trade start date"
          body={`You’re confirming you started in ${selectedMonthLabel} ${form.tradeStartYear}.`}
          confirmLabel="Confirm"
          onCancel={() => setConfirmOpen(false)}
          onConfirm={() => {
            setForm((s) => ({ ...s, tradeStartConfirmed: true }));
            setConfirmOpen(false);
          }}
        />
      ) : null}
    </>
  );
}

function Field(props: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
  helperText?: string;
}) {
  return (
    <label className="block">
      <div className="text-sm font-medium text-gray-700">
        {props.label} {props.required ? <span className="text-red-600">*</span> : null}
      </div>
      <input
        className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 disabled:bg-gray-50 disabled:text-gray-500"
        placeholder={props.placeholder}
        value={props.value}
        onChange={(e) => props.onChange(e.target.value)}
        disabled={props.disabled}
      />
      {props.helperText ? <div className="mt-1 text-xs text-gray-500">{props.helperText}</div> : null}
    </label>
  );
}

function Select(props: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: Array<{ value: string; label: string }>;
  required?: boolean;
}) {
  return (
    <label className="block">
      <div className="text-sm font-medium text-gray-700">
        {props.label} {props.required ? <span className="text-red-600">*</span> : null}
      </div>
      <select
        className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 bg-white"
        value={props.value}
        onChange={(e) => props.onChange(e.target.value)}
      >
        {props.options.map((o) => (
          <option key={o.value || o.label} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function ConfirmModal(props: {
  title: string;
  body: string;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <div className="w-full max-w-lg bg-white rounded-2xl shadow-2xl border border-gray-200 overflow-hidden">
        <div className="px-6 py-5 border-b border-gray-100">
          <div className="text-lg font-bold text-gray-900">{props.title}</div>
        </div>
        <div className="px-6 py-5 text-gray-700 text-sm">{props.body}</div>
        <div className="px-6 py-5 border-t border-gray-100 bg-gray-50 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={props.onCancel}
            className="bg-white border border-gray-200 hover:bg-gray-50 text-gray-900 font-semibold px-4 py-2 rounded-lg"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={props.onConfirm}
            className="bg-8fold-green hover:bg-8fold-green-dark text-white font-semibold px-4 py-2 rounded-lg"
          >
            {props.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

