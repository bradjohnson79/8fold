import { adminApiFetch } from "@/server/adminApiV4";

type Party = { id: string; name: string | null; email: string | null; role: string | null };
type PaymentState = { label: string; secured: boolean; captured: boolean; paid: boolean; rawPaymentStatus: string | null; rawPayoutStatus: string | null };
type JobRow = {
  id: string;
  title: string;
  statusRaw: string;
  displayStatus: string;
  isMock: boolean;
  country: string;
  regionCode: string | null;
  city: string | null;
  createdAt: string;
  updatedAt: string;
  amountCents: number;
  paymentState: PaymentState;
  jobPoster: Party | null;
  router: Party | null;
  contractor: Party | null;
  archived: boolean;
};

type JobsResp = {
  rows: JobRow[];
  totalCount: number;
  page: number;
  pageSize: number;
};

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

const thStyle: React.CSSProperties = {
  textAlign: "left",
  fontSize: 12,
  color: "rgba(226,232,240,0.70)",
  fontWeight: 900,
  padding: "10px 10px",
  borderBottom: "1px solid rgba(148,163,184,0.12)",
  whiteSpace: "nowrap",
};

const tdStyle: React.CSSProperties = {
  padding: "10px 10px",
  borderBottom: "1px solid rgba(148,163,184,0.08)",
  color: "rgba(226,232,240,0.90)",
  fontSize: 13,
  verticalAlign: "top",
};

function statusPill(label: string) {
  const upper = label.toUpperCase();
  const tone = upper.includes("REJECT") || upper.includes("FLAG") ? "rgba(248,113,113,0.12)" : "rgba(2,6,23,0.25)";
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: "6px 10px",
        borderRadius: 999,
        border: "1px solid rgba(148,163,184,0.14)",
        background: tone,
        fontSize: 12,
        fontWeight: 900,
      }}
    >
      {upper}
    </span>
  );
}

function paymentPill(state: PaymentState) {
  const tone = state.label === "PAID" ? "rgba(34,197,94,0.14)" : state.label === "CAPTURED" ? "rgba(56,189,248,0.14)" : "rgba(251,191,36,0.14)";
  return (
    <span
      title={`payment=${state.rawPaymentStatus ?? "n/a"} payout=${state.rawPayoutStatus ?? "n/a"}`}
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: "6px 10px",
        borderRadius: 999,
        border: "1px solid rgba(148,163,184,0.14)",
        background: tone,
        fontSize: 12,
        fontWeight: 900,
      }}
    >
      {state.label}
    </span>
  );
}

function currency(cents: number) {
  return `$${(Number(cents || 0) / 100).toFixed(2)}`;
}

function person(party: Party | null) {
  if (!party) return "—";
  return (
    <div>
      <div>{party.name ?? "—"}</div>
      <div style={{ color: "rgba(226,232,240,0.55)", fontSize: 12 }}>{party.email ?? "—"}</div>
    </div>
  );
}

export default async function JobsPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = (await searchParams) ?? {};

  const q = getParam(sp, "q");
  const status = getParam(sp, "status");
  const isMock = getParam(sp, "is_mock");
  const createdFrom = getParam(sp, "createdFrom");
  const createdTo = getParam(sp, "createdTo");
  const showArchived = getParam(sp, "showArchived", "1") || "1";
  const page = Math.max(1, Number(getParam(sp, "page", "1") || "1") || 1);
  const pageSize = Math.max(1, Math.min(100, Number(getParam(sp, "pageSize", "25") || "25") || 25));

  const query = qs({
    q: q || undefined,
    status: status || undefined,
    is_mock: isMock || undefined,
    createdFrom: createdFrom || undefined,
    createdTo: createdTo || undefined,
    showArchived,
    page: String(page),
    pageSize: String(pageSize),
    sort: "createdAt:desc",
  });

  let data: JobsResp | null = null;
  let loadError: string | null = null;
  try {
    data = await adminApiFetch<JobsResp>(`/api/admin/v4/jobs${query}`);
  } catch (e) {
    const status = typeof (e as any)?.status === "number" ? (e as any).status : null;
    const message = e instanceof Error ? e.message : "Failed to load jobs";
    loadError = `/api/admin/v4/jobs failed${status ? ` (HTTP ${status})` : ""}: ${message}`;
  }

  const rows = data?.rows ?? [];
  const totalCount = Number(data?.totalCount ?? 0);
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));

  const prevHref = `/jobs${qs({
    q: q || undefined,
    status: status || undefined,
    is_mock: isMock || undefined,
    createdFrom: createdFrom || undefined,
    createdTo: createdTo || undefined,
    showArchived,
    page: String(Math.max(1, page - 1)),
    pageSize: String(pageSize),
  })}`;

  const nextHref = `/jobs${qs({
    q: q || undefined,
    status: status || undefined,
    is_mock: isMock || undefined,
    createdFrom: createdFrom || undefined,
    createdTo: createdTo || undefined,
    showArchived,
    page: String(Math.min(totalPages, page + 1)),
    pageSize: String(pageSize),
  })}`;

  return (
    <div>
      <h1 style={{ margin: 0, fontSize: 22, fontWeight: 950, letterSpacing: 0.2 }}>Jobs</h1>
      <p style={{ marginTop: 8, color: "rgba(226,232,240,0.72)", maxWidth: 980 }}>
        All jobs (mock + real + archived + test data) with server-side filtering and pagination.
      </p>

      <div
        style={{
          marginTop: 12,
          border: "1px solid rgba(148,163,184,0.14)",
          borderRadius: 16,
          padding: 12,
          background: "rgba(2,6,23,0.30)",
        }}
      >
        <form method="GET" style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <input name="q" defaultValue={q} placeholder="Search by ID, title, poster email" style={{ ...inputStyle, minWidth: 280 }} />

          <select name="status" defaultValue={status} style={{ ...inputStyle, minWidth: 220 }} aria-label="Status">
            <option value="">All statuses</option>
            <option value="DRAFT">DRAFT</option>
            <option value="PUBLISHED">PUBLISHED</option>
            <option value="OPEN_FOR_ROUTING">OPEN_FOR_ROUTING</option>
            <option value="ASSIGNED">ASSIGNED</option>
            <option value="IN_PROGRESS">IN_PROGRESS</option>
            <option value="CONTRACTOR_COMPLETED">CONTRACTOR_COMPLETED</option>
            <option value="CUSTOMER_APPROVED_AWAITING_ROUTER">CUSTOMER_APPROVED_AWAITING_ROUTER</option>
            <option value="CUSTOMER_APPROVED">CUSTOMER_APPROVED</option>
            <option value="CUSTOMER_REJECTED">CUSTOMER_REJECTED</option>
            <option value="COMPLETION_FLAGGED">COMPLETION_FLAGGED</option>
            <option value="COMPLETED_APPROVED">COMPLETED_APPROVED</option>
          </select>

          <select name="is_mock" defaultValue={isMock} style={{ ...inputStyle, minWidth: 160 }} aria-label="Mock filter">
            <option value="">All jobs</option>
            <option value="true">Only mock</option>
            <option value="false">Only real</option>
          </select>

          <label style={{ color: "rgba(226,232,240,0.72)", fontSize: 12, fontWeight: 900 }}>
            From
            <input type="date" name="createdFrom" defaultValue={createdFrom} style={{ ...inputStyle, marginLeft: 8 }} />
          </label>

          <label style={{ color: "rgba(226,232,240,0.72)", fontSize: 12, fontWeight: 900 }}>
            To
            <input type="date" name="createdTo" defaultValue={createdTo} style={{ ...inputStyle, marginLeft: 8 }} />
          </label>

          <select name="showArchived" defaultValue={showArchived} style={{ ...inputStyle, minWidth: 160 }} aria-label="Show archived">
            <option value="1">Show archived (default)</option>
            <option value="0">Hide archived</option>
          </select>

          <select name="pageSize" defaultValue={String(pageSize)} style={{ ...inputStyle, minWidth: 130 }} aria-label="Page size">
            <option value="10">10 / page</option>
            <option value="25">25 / page</option>
            <option value="50">50 / page</option>
            <option value="100">100 / page</option>
          </select>

          <button
            type="submit"
            style={{
              border: "1px solid rgba(34,197,94,0.35)",
              background: "rgba(34,197,94,0.16)",
              color: "rgba(134,239,172,0.95)",
              borderRadius: 12,
              padding: "9px 12px",
              fontWeight: 900,
              cursor: "pointer",
            }}
          >
            Apply
          </button>
        </form>
      </div>

      {loadError ? <div style={{ marginTop: 12, color: "rgba(254,202,202,0.95)", fontWeight: 900 }}>{loadError}</div> : null}

      <div style={{ marginTop: 12, overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "separate", borderSpacing: 0 }}>
          <thead>
            <tr>
              {[
                "Job ID",
                "Title",
                "Status",
                "Is Mock",
                "Location",
                "Created",
                "Updated",
                "Job Poster",
                "Router",
                "Contractor",
                "Price/Budget",
                "Payment",
              ].map((h) => (
                <th key={h} style={thStyle}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loadError ? (
              <tr>
                <td colSpan={12} style={{ ...tdStyle, color: "rgba(254,202,202,0.95)", fontWeight: 900 }}>
                  {loadError}
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={12} style={tdStyle}>
                  No jobs found for current filters.
                </td>
              </tr>
            ) : (
              rows.map((j) => {
                const displayStatus = j.isMock ? "IN_PROGRESS" : j.displayStatus || j.statusRaw;
                return (
                  <tr key={j.id}>
                    <td style={tdStyle}>
                      <a href={`/jobs/${encodeURIComponent(j.id)}`} style={{ color: "rgba(191,219,254,0.95)", textDecoration: "none", fontWeight: 900 }}>
                        {j.id}
                      </a>
                    </td>
                    <td style={tdStyle}>{j.title}</td>
                    <td style={tdStyle}>{statusPill(displayStatus)}</td>
                    <td style={tdStyle}>{j.isMock ? statusPill("MOCK") : "REAL"}</td>
                    <td style={tdStyle}>{[j.city, j.regionCode, j.country].filter(Boolean).join(", ") || "—"}</td>
                    <td style={tdStyle}>{j.createdAt.slice(0, 19).replace("T", " ")}</td>
                    <td style={tdStyle}>{j.updatedAt.slice(0, 19).replace("T", " ")}</td>
                    <td style={tdStyle}>{person(j.jobPoster)}</td>
                    <td style={tdStyle}>{person(j.router)}</td>
                    <td style={tdStyle}>{person(j.contractor)}</td>
                    <td style={tdStyle}>{currency(j.amountCents)}</td>
                    <td style={tdStyle}>{paymentPill(j.paymentState)}</td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <div style={{ marginTop: 12, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
        <div style={{ color: "rgba(226,232,240,0.65)", fontSize: 12 }}>
          Showing {(page - 1) * pageSize + (rows.length ? 1 : 0)}-{(page - 1) * pageSize + rows.length} of {totalCount}
        </div>

        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <a
            href={prevHref}
            style={{
              pointerEvents: page <= 1 ? "none" : "auto",
              opacity: page <= 1 ? 0.45 : 1,
              border: "1px solid rgba(148,163,184,0.14)",
              borderRadius: 12,
              padding: "8px 10px",
              color: "rgba(191,219,254,0.95)",
              textDecoration: "none",
              fontWeight: 900,
            }}
          >
            ← Prev
          </a>
          <div style={{ color: "rgba(226,232,240,0.72)", fontSize: 12, fontWeight: 900 }}>
            Page {page} / {totalPages}
          </div>
          <a
            href={nextHref}
            style={{
              pointerEvents: page >= totalPages ? "none" : "auto",
              opacity: page >= totalPages ? 0.45 : 1,
              border: "1px solid rgba(148,163,184,0.14)",
              borderRadius: 12,
              padding: "8px 10px",
              color: "rgba(191,219,254,0.95)",
              textDecoration: "none",
              fontWeight: 900,
            }}
          >
            Next →
          </a>
        </div>
      </div>
    </div>
  );
}
