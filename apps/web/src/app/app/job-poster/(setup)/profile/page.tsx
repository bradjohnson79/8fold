"use client";

import { z } from "zod";
import React from "react";
import { PayoutMethodSetup } from "@/components/PayoutMethodSetup";
import { useClerk } from "@clerk/nextjs";
import { GeoAutocomplete, type GeoAutocompleteResult } from "@/components/GeoAutocomplete";

const JobPosterProfileSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  phone: z.string().min(7).optional(),
  legalStreet: z.string().min(1),
  legalCity: z.string().min(1),
  legalProvince: z.string().min(2),
  legalPostalCode: z.string().min(3),
  legalCountry: z.enum(["US", "CA"]),

  mapDisplayName: z.string().min(1),
  lat: z.number(),
  lng: z.number(),
});
type JobPosterProfile = z.infer<typeof JobPosterProfileSchema>;

function inferStateProvinceFromLocation(s: unknown): string {
  const text = typeof s === "string" ? s.trim() : "";
  if (!text) return "";
  const parts = text.split(",").map((p) => p.trim()).filter(Boolean);
  const last = parts[parts.length - 1] ?? "";
  // Common defaultJobLocation format: "123 Main St, Vancouver, BC" or "Vancouver, BC"
  return last.length <= 10 ? last : "";
}

export default function JobPosterProfilePage() {
  const { signOut } = useClerk();
  const [form, setForm] = React.useState<JobPosterProfile>({
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
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string>("");
  const [notice, setNotice] = React.useState<string>("");
  const [isAdmin, setIsAdmin] = React.useState(false);

  const [suspendOpen, setSuspendOpen] = React.useState(false);
  const [deleteOpen, setDeleteOpen] = React.useState(false);
  const [accountActionLoading, setAccountActionLoading] = React.useState(false);
  const [accountActionError, setAccountActionError] = React.useState<string>("");
  const [suspendMonths, setSuspendMonths] = React.useState<1 | 3 | 6>(1);
  const [deleteReason, setDeleteReason] = React.useState<string>("Taking a break");
  const [customDeleteReason, setCustomDeleteReason] = React.useState<string>("");

  React.useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [meResp, resp] = await Promise.all([
          fetch("/api/app/me", { cache: "no-store", credentials: "include" }).catch(() => null as any),
          fetch("/api/app/job-poster/profile", { cache: "no-store", credentials: "include" }),
        ]);
        const meJson = await meResp?.json?.().catch(() => null);
        const json = await resp.json().catch(() => null);
        if (!alive) return;
        setIsAdmin(Boolean(meJson?.superuser));
        if (!resp.ok) throw new Error(json?.error ?? "Failed to load profile");
        if (json?.profile) {
          const stateProvince =
            String(json.profile.stateProvince ?? "").trim() ||
            inferStateProvinceFromLocation((json.profile as any)?.defaultJobLocation);
          setForm({
            name: json.profile.name ?? "",
            email: json.profile.email ?? "",
            phone: json.profile.phone ?? "",
            legalStreet: json.profile.address ?? "",
            legalCity: json.profile.city ?? "",
            legalProvince: stateProvince || "",
            legalPostalCode: String(json.profile.postalCode ?? ""),
            legalCountry: json.profile.country ?? "US",
            mapDisplayName: String((json.profile as any)?.mapDisplayName ?? (json.profile as any)?.formattedAddress ?? "").trim(),
            lat: typeof json.profile.lat === "number" ? json.profile.lat : 0,
            lng: typeof json.profile.lng === "number" ? json.profile.lng : 0,
          });
        }
      } catch (e) {
        if (!alive) return;
        setError(e instanceof Error ? e.message : "Failed to load");
      } finally {
        if (!alive) return;
        setLoading(false);
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
      const parsed = JobPosterProfileSchema.safeParse(form);
      if (!parsed.success) {
        throw new Error("Please fill all required fields correctly.");
      }
      const resp = await fetch("/api/app/job-poster/profile", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "include",
        body: JSON.stringify(parsed.data)
      });
      const json = await resp.json().catch(() => null);
      if (!resp.ok) {
        const code = json?.code ?? json?.error?.code ?? "";
        const msg = json?.error?.message ?? json?.error ?? "Failed to save profile";
        if (code === "MAP_LOCATION_REQUIRED") throw new Error("Please select a location from the map search field to enable routing.");
        throw new Error(msg);
      }
      setNotice("Saved.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  async function suspendAccount() {
    setAccountActionLoading(true);
    setAccountActionError("");
    try {
      const resp = await fetch("/api/app/account/suspend", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ months: suspendMonths }),
      });
      const json = await resp.json().catch(() => null);
      if (!resp.ok) throw new Error(json?.error ?? "Failed to suspend account");
      setNotice("Account suspended.");
      setSuspendOpen(false);
    } catch (e) {
      setAccountActionError(e instanceof Error ? e.message : "Failed to suspend account");
    } finally {
      setAccountActionLoading(false);
    }
  }

  async function deleteAccount() {
    setAccountActionLoading(true);
    setAccountActionError("");
    try {
      const finalReason =
        deleteReason === "Other"
          ? customDeleteReason.trim()
          : deleteReason.trim();
      if (deleteReason === "Other" && !finalReason) {
        throw new Error("Please enter a reason.");
      }

      const resp = await fetch("/api/app/account/delete", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          reason: deleteReason,
          customReason: deleteReason === "Other" ? finalReason : undefined,
        }),
      });
      const json = await resp.json().catch(() => null);
      if (!resp.ok) throw new Error(json?.error ?? "Failed to delete account");

      // Account deletion should end the Clerk session as well.
      await signOut({ redirectUrl: "/" }).catch(() => null);
      window.location.href = "/";
    } catch (e) {
      setAccountActionError(e instanceof Error ? e.message : "Failed to delete account");
    } finally {
      setAccountActionLoading(false);
    }
  }

  return (
    <>
      <h2 className="text-lg font-bold text-gray-900">Profile</h2>
      <p className="text-gray-600 mt-2">
        This information is required before posting a job. Your job address defaults to this profile.
      </p>

      {error ? <div className="mt-4 text-sm text-red-600">{error}</div> : null}
      {notice ? <div className="mt-4 text-sm text-8fold-green font-semibold">{notice}</div> : null}

      <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
        <Field
          label="Name"
          placeholder="Jamie Poster"
          value={form.name}
          onChange={(v) => setForm((s) => ({ ...s, name: v }))}
        />
        <Field
          label="Email"
          placeholder="jamie@domain.com"
          value={form.email}
          onChange={(v) => setForm((s) => ({ ...s, email: v }))}
        />
        <Field
          label="Phone (optional)"
          placeholder="(555) 555-5555"
          value={form.phone ?? ""}
          onChange={(v) => setForm((s) => ({ ...s, phone: v }))}
        />
      </div>

      <div className="mt-6 border border-gray-200 rounded-2xl p-5">
        <div className="font-bold text-gray-900">Legal address</div>
        <div className="text-sm text-gray-600 mt-1">This is your legal service address.</div>
        <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field
            label="Street address"
            placeholder="8345 209 Street"
            value={form.legalStreet}
            onChange={(v) => setForm((s) => ({ ...s, legalStreet: v }))}
          />
          <Field
            label="City"
            placeholder="Langley"
            value={form.legalCity}
            onChange={(v) => setForm((s) => ({ ...s, legalCity: v }))}
          />
          <Field
            label="State / Province"
            placeholder="BC"
            value={form.legalProvince}
            onChange={(v) => setForm((s) => ({ ...s, legalProvince: v }))}
            disabled={false}
            helperText="Required. Always editable."
          />
          <Field
            label="Postal / ZIP"
            placeholder="V2Y 0R2"
            value={form.legalPostalCode}
            onChange={(v) => setForm((s) => ({ ...s, legalPostalCode: v }))}
          />
          <Select
            label="Country"
            value={form.legalCountry}
            onChange={(v: string) => setForm((s) => ({ ...s, legalCountry: v as any }))}
            options={[
              { value: "CA", label: "Canada" },
              { value: "US", label: "United States" },
            ]}
          />
        </div>
      </div>

      <div className="mt-6 border border-gray-200 rounded-2xl p-5">
        <div className="font-bold text-gray-900">Map location</div>
        <div className="text-sm text-gray-600 mt-1">
          Required. Used to calculate distance between Job Posters and Contractors.
        </div>
        <div className="mt-3">
          <GeoAutocomplete
            label="Search approximate location (required for routing distance)"
            required
            value={form.mapDisplayName}
            onChange={(v) =>
              setForm((s) => ({
                ...s,
                mapDisplayName: v,
                // typing without selecting must not count
                lat: 0,
                lng: 0,
              }))
            }
            onPick={(r: GeoAutocompleteResult) => {
              setForm((s) => ({
                ...s,
                mapDisplayName: r.display_name,
                lat: r.lat,
                lng: r.lon,
              }));
            }}
            errorText={
              !Number.isFinite(form.lat) || !Number.isFinite(form.lng) || (form.lat === 0 && form.lng === 0)
                ? "Please select a location from the map search field to enable routing."
                : ""
            }
          />
        </div>
      </div>

      <div className="mt-6">
        <button
          disabled={
            loading ||
            saving ||
            !form.legalStreet.trim() ||
            !form.legalCity.trim() ||
            !form.legalProvince.trim() ||
            !form.legalPostalCode.trim() ||
            !Number.isFinite(form.lat) ||
            !Number.isFinite(form.lng) ||
            (form.lat === 0 && form.lng === 0)
          }
          onClick={save}
          className={`font-semibold px-4 py-2 rounded-lg ${
            loading ||
            saving ||
            !form.legalStreet.trim() ||
            !form.legalCity.trim() ||
            !form.legalProvince.trim() ||
            !form.legalPostalCode.trim() ||
            !Number.isFinite(form.lat) ||
            !Number.isFinite(form.lng) ||
            (form.lat === 0 && form.lng === 0)
              ? "bg-gray-200 text-gray-600"
              : "bg-8fold-green text-white hover:bg-8fold-green-dark"
          }`}
        >
          {saving ? "Saving…" : "Save"}
        </button>
      </div>

      <PayoutMethodSetup
        title="Refund / reimbursement setup"
        subtitle="If you’re ever eligible for a reimbursement, payout timing depends on the selected provider."
        includeRefundNote
      />

      <div className="mt-10 border-t border-gray-200 pt-8">
        <h3 className="text-base font-semibold text-gray-900">Account Management</h3>
        <p className="mt-2 text-sm text-gray-600">
          Suspend your account temporarily or archive it permanently. Archiving is a soft delete: financial records are preserved.
        </p>

        {accountActionError ? (
          <div className="mt-4 text-sm text-red-600">{accountActionError}</div>
        ) : null}

        <div className="mt-4 flex flex-col sm:flex-row gap-3">
          <button
            onClick={() => setSuspendOpen(true)}
            className="px-4 py-2 rounded-lg border border-gray-300 text-gray-900 hover:bg-gray-50 font-semibold"
          >
            Suspend Account
          </button>
          <button
            onClick={() => setDeleteOpen(true)}
            className="px-4 py-2 rounded-lg bg-red-600 text-white hover:bg-red-700 font-semibold"
          >
            Delete Account
          </button>
        </div>
      </div>

      {suspendOpen ? (
        <Modal
          title="Suspend account"
          onClose={() => (accountActionLoading ? null : setSuspendOpen(false))}
        >
          <div className="text-sm text-gray-700">
            Choose how long you want to suspend your account. While suspended, you won’t be able to post or route jobs, or send messages.
          </div>
          <div className="mt-4">
            <label className="block text-sm font-medium text-gray-700">Duration</label>
            <select
              className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2"
              value={String(suspendMonths)}
              onChange={(e) => setSuspendMonths(Number(e.target.value) as 1 | 3 | 6)}
              disabled={accountActionLoading}
            >
              <option value="1">1 month</option>
              <option value="3">3 months</option>
              <option value="6">6 months</option>
            </select>
          </div>
          <div className="mt-6 flex gap-3 justify-end">
            <button
              className="px-4 py-2 rounded-lg border border-gray-300 text-gray-900 hover:bg-gray-50 font-semibold"
              onClick={() => setSuspendOpen(false)}
              disabled={accountActionLoading}
            >
              Cancel
            </button>
            <button
              className="px-4 py-2 rounded-lg bg-8fold-green text-white hover:bg-8fold-green-dark font-semibold"
              onClick={suspendAccount}
              disabled={accountActionLoading}
            >
              {accountActionLoading ? "Suspending…" : "Suspend"}
            </button>
          </div>
        </Modal>
      ) : null}

      {deleteOpen ? (
        <Modal
          title="Delete (archive) account"
          onClose={() => (accountActionLoading ? null : setDeleteOpen(false))}
        >
          <div className="text-sm text-gray-700">
            This archives your account (soft delete). You’ll be logged out and won’t be able to log back in unless support reactivates you.
          </div>
          <div className="mt-4">
            <label className="block text-sm font-medium text-gray-700">Reason</label>
            <select
              className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2"
              value={deleteReason}
              onChange={(e) => setDeleteReason(e.target.value)}
              disabled={accountActionLoading}
            >
              <option>Taking a break</option>
              <option>Found another platform</option>
              <option>Cost concerns</option>
              <option>Privacy concerns</option>
              <option>Other</option>
            </select>
          </div>
          {deleteReason === "Other" ? (
            <div className="mt-4">
              <label className="block text-sm font-medium text-gray-700">Custom reason</label>
              <textarea
                className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2"
                rows={3}
                value={customDeleteReason}
                onChange={(e) => setCustomDeleteReason(e.target.value)}
                disabled={accountActionLoading}
              />
            </div>
          ) : null}
          <div className="mt-6 flex gap-3 justify-end">
            <button
              className="px-4 py-2 rounded-lg border border-gray-300 text-gray-900 hover:bg-gray-50 font-semibold"
              onClick={() => setDeleteOpen(false)}
              disabled={accountActionLoading}
            >
              Cancel
            </button>
            <button
              className="px-4 py-2 rounded-lg bg-red-600 text-white hover:bg-red-700 font-semibold"
              onClick={deleteAccount}
              disabled={accountActionLoading}
            >
              {accountActionLoading ? "Deleting…" : "Delete account"}
            </button>
          </div>
        </Modal>
      ) : null}
    </>
  );
}

function Modal({
  title,
  children,
  onClose,
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full max-w-lg mx-4 rounded-xl bg-white shadow-xl border border-gray-200 p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="text-base font-semibold text-gray-900">{title}</div>
          <button className="text-gray-500 hover:text-gray-700" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>
        <div className="mt-4">{children}</div>
      </div>
    </div>
  );
}

function Field({
  label,
  placeholder,
  value,
  onChange,
  disabled,
  helperText
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

function Select(props: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <label className="block">
      <div className="text-sm font-medium text-gray-700">{props.label}</div>
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

