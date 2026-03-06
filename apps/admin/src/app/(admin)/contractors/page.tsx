import { adminApiFetch } from "@/server/adminApiV4";
import { redirect } from "next/navigation";
import { ContractorsTableClient } from "./ContractorsTableClient";

type UserRow = {
  id: string;
  role: "CONTRACTOR";
  name: string | null;
  businessName?: string | null;
  email: string | null;
  phone: string | null;
  country: string | null;
  regionCode: string | null;
  city: string | null;
  status: string;
  suspendedUntil: string | null;
  archivedAt: string | null;
  createdAt: string;
  badges: string[];
};

type ListResp = { rows: UserRow[]; totalCount: number; page: number; pageSize: number };

function getCreateErrorMessage(error: unknown): string {
  const status = typeof (error as any)?.status === "number" ? (error as any).status : null;
  const message = error instanceof Error ? error.message : "Failed to create contractor";
  return `${status ? `HTTP ${status}: ` : ""}${message}`.slice(0, 300);
}

async function doCreateContractor(formData: FormData) {
  "use server";

  const payload = {
    clerkUserId: String(formData.get("clerkUserId") ?? "").trim(),
    email: String(formData.get("email") ?? "").trim(),
    name: String(formData.get("name") ?? "").trim(),
    phone: String(formData.get("phone") ?? "").trim() || undefined,
    country: String(formData.get("country") ?? "US").trim().toUpperCase(),
    regionCode: String(formData.get("regionCode") ?? "").trim(),
    city: String(formData.get("city") ?? "").trim() || undefined,
    businessName: String(formData.get("businessName") ?? "").trim(),
  };

  try {
    await adminApiFetch("/api/admin/v4/contractors", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    redirect("/contractors?created=1");
  } catch (error) {
    redirect(`/contractors?createError=${encodeURIComponent(getCreateErrorMessage(error))}`);
  }
}

function getParam(sp: Record<string, string | string[] | undefined>, key: string, fallback = "") {
  const raw = sp[key];
  return String(Array.isArray(raw) ? raw[0] : raw ?? fallback).trim();
}

function qs(sp: Record<string, string | undefined>): string {
  const u = new URL("http://internal");
  for (const [k, v] of Object.entries(sp)) {
    if (v == null) continue;
    const s = String(v).trim();
    if (!s) continue;
    u.searchParams.set(k, s);
  }
  const out = u.searchParams.toString();
  return out ? `?${out}` : "";
}

const inputStyle: React.CSSProperties = {
  background: "rgba(2,6,23,0.35)",
  border: "1px solid rgba(148,163,184,0.14)",
  color: "rgba(226,232,240,0.92)",
  borderRadius: 12,
  padding: "9px 10px",
  fontSize: 13,
};

function formatBadgeLabel(badge: string): string {
  const b = String(badge ?? "").trim().toUpperCase();
  if (!b) return "UNKNOWN";
  if (b.startsWith("JOBS:")) return `Jobs ${b.slice(5)}`;
  if (b === "STRIPE_VERIFIED") return "Stripe Verified";
  if (b === "STRIPE_CONNECTED_PENDING_VERIFICATION") return "Stripe Pending Verification";
  if (b === "STRIPE_NOT_CONNECTED") return "Stripe Not Connected";
  if (b === "PROFILE_SYNCED") return "Profile Synced";
  if (b === "PROFILE_CANONICAL_ONLY") return "Profile Canonical Only";
  if (b === "PROFILE_V4_ONLY") return "Profile V4 Only";
  if (b === "PROFILE_MISSING") return "Profile Missing";
  if (b === "PENDING_APPROVAL") return "Pending Approval";
  return b.replace(/_/g, " ");
}

export default async function ContractorsPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = (await searchParams) ?? {};
  const q = getParam(sp, "q");
  const status = getParam(sp, "status");
  const created = getParam(sp, "created");
  const createError = getParam(sp, "createError");
  const page = Math.max(1, Number(getParam(sp, "page", "1") || "1") || 1);
  const pageSize = Math.max(1, Math.min(100, Number(getParam(sp, "pageSize", "25") || "25") || 25));

  let data: ListResp | null = null;
  let err: string | null = null;

  try {
    data = await adminApiFetch<ListResp>(
      `/api/admin/v4/contractors${qs({
        q: q || undefined,
        status: status || undefined,
        page: String(page),
        pageSize: String(pageSize),
      })}`,
    );
  } catch (e) {
    const status = typeof (e as any)?.status === "number" ? (e as any).status : null;
    const message = e instanceof Error ? e.message : "Failed to load contractors";
    err = `/api/admin/v4/contractors failed${status ? ` (HTTP ${status})` : ""}: ${message}`;
  }

  const rows = data?.rows ?? [];
  const totalCount = Number(data?.totalCount ?? 0);

  return (
    <div>
      <h1 style={{ margin: 0, fontSize: 22, fontWeight: 950 }}>Contractors</h1>
      <p style={{ marginTop: 8, color: "rgba(226,232,240,0.72)" }}>
        Contractor accounts with status visibility and quick access to profile/job detail.
      </p>

      <div style={{ marginTop: 12, border: "1px solid rgba(148,163,184,0.14)", borderRadius: 16, padding: 12, background: "rgba(2,6,23,0.30)" }}>
        <div style={{ fontWeight: 900, marginBottom: 10 }}>Create Contractor (ADMIN_OPERATOR)</div>
        <form action={doCreateContractor} style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 10 }}>
          <input name="name" placeholder="Full name" required style={inputStyle} />
          <input name="email" type="email" placeholder="Email" required style={inputStyle} />
          <input name="clerkUserId" placeholder="Clerk User ID" required style={inputStyle} />
          <input name="phone" placeholder="Phone (optional)" style={inputStyle} />
          <input name="businessName" placeholder="Business name" required style={inputStyle} />
          <select name="country" defaultValue="US" style={inputStyle}>
            <option value="US">US</option>
            <option value="CA">CA</option>
          </select>
          <input name="regionCode" placeholder="Region code (BC, CA, TX...)" required style={inputStyle} />
          <input name="city" placeholder="City (optional)" style={inputStyle} />
          <div style={{ gridColumn: "1 / -1", display: "flex", justifyContent: "flex-end" }}>
            <button type="submit" style={{ ...inputStyle, cursor: "pointer", fontWeight: 900 }}>
              Create Contractor
            </button>
          </div>
        </form>
        {created === "1" ? (
          <div style={{ marginTop: 10, color: "rgba(134,239,172,0.95)", fontWeight: 900, fontSize: 12 }}>
            Contractor created or updated successfully.
          </div>
        ) : null}
        {createError ? <div style={{ marginTop: 10, color: "rgba(254,202,202,0.95)", fontWeight: 900, fontSize: 12 }}>{createError}</div> : null}
      </div>

      <div style={{ marginTop: 12, border: "1px solid rgba(148,163,184,0.14)", borderRadius: 16, padding: 12, background: "rgba(2,6,23,0.30)" }}>
        <form method="GET" style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <input name="q" defaultValue={q} placeholder="Search name/email/region" style={{ ...inputStyle, minWidth: 260 }} />
          <select name="status" defaultValue={status} style={{ ...inputStyle, minWidth: 180 }}>
            <option value="">All statuses</option>
            <option value="ACTIVE">ACTIVE</option>
            <option value="SUSPENDED">SUSPENDED</option>
            <option value="ARCHIVED">ARCHIVED</option>
            <option value="PENDING">PENDING</option>
          </select>
          <select name="pageSize" defaultValue={String(pageSize)} style={{ ...inputStyle, minWidth: 140 }}>
            <option value="10">10 / page</option>
            <option value="25">25 / page</option>
            <option value="50">50 / page</option>
            <option value="100">100 / page</option>
          </select>
          <button type="submit" style={{ ...inputStyle, cursor: "pointer", fontWeight: 900 }}>Apply</button>
        </form>
      </div>

      <ContractorsTableClient
        rows={rows}
        totalCount={totalCount}
        page={page}
        pageSize={pageSize}
        q={q}
        status={status}
        error={err}
        formatBadgeLabel={formatBadgeLabel}
      />
    </div>
  );
}

