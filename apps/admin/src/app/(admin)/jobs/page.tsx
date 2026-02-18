import { adminApiFetch } from "@/server/adminApi";

type JobRow = {
  id: string;
  status: string;
  title: string;
  country: string;
  regionCode: string | null;
  city: string | null;
  addressFull: string | null;
  tradeCategory: string;
  jobSource: string;
  routingStatus: string;
  publishedAt: string | null;
  createdAt: string;
  assignment: null | { id: string; status: string; contractor: null | { id: string; businessName: string | null; email: string | null } };
};

type JobsResp = { jobs: JobRow[] };

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

const selectStyle: React.CSSProperties = {
  background: "rgba(2,6,23,0.35)",
  border: "1px solid rgba(148,163,184,0.14)",
  color: "rgba(226,232,240,0.92)",
  borderRadius: 12,
  padding: "9px 10px",
  fontSize: 13,
  minWidth: 160,
};
const inputStyle: React.CSSProperties = { ...selectStyle, minWidth: 220 };
const buttonStyle: React.CSSProperties = {
  background: "rgba(34,197,94,0.16)",
  border: "1px solid rgba(34,197,94,0.35)",
  color: "rgba(134,239,172,0.95)",
  borderRadius: 12,
  padding: "9px 12px",
  fontSize: 13,
  fontWeight: 950,
  cursor: "pointer",
  whiteSpace: "nowrap",
};

function statusPill(s: string) {
  const upper = String(s || "").toUpperCase();
  const tone =
    upper === "COMPLETION_FLAGGED" || upper === "CUSTOMER_REJECTED"
      ? "rgba(248,113,113,0.12)"
      : upper === "CONTRACTOR_COMPLETED" || upper === "CUSTOMER_APPROVED"
        ? "rgba(251,191,36,0.12)"
        : "rgba(2,6,23,0.25)";
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
        color: "rgba(226,232,240,0.90)",
      }}
    >
      {upper}
    </span>
  );
}

function filterPill(label: string, value: string) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: "6px 10px",
        borderRadius: 999,
        border: "1px solid rgba(148,163,184,0.14)",
        background: "rgba(2,6,23,0.25)",
        color: "rgba(226,232,240,0.85)",
        fontSize: 12,
        fontWeight: 850,
        whiteSpace: "nowrap",
      }}
      title="Active server-side filter"
    >
      {label}: <b style={{ marginLeft: 6, color: "rgba(226,232,240,0.95)" }}>{value}</b>
    </span>
  );
}

export default async function JobsPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = (await searchParams) ?? {};
  const get = (k: string) => String(Array.isArray((sp as any)[k]) ? (sp as any)[k][0] : (sp as any)[k] ?? "").trim();

  const q = get("q");
  const status = get("status") || null;
  const dateRange = get("dateRange") || "ALL";
  const jobSource = get("jobSource");
  const archived = get("archived");
  const country = get("country");
  const state = get("state");
  const city = get("city");
  const tradeCategory = get("tradeCategory");
  const msg = get("msg");

  const apiQuery = qs({
    status: status ? status : undefined,
    q: q || undefined,
    dateRange,
    jobSource: jobSource || undefined,
    archived: archived || undefined,
    country: country || undefined,
    state: state || undefined,
    city: city || undefined,
    tradeCategory: tradeCategory || undefined,
  });

  let data: JobsResp | null = null;
  let err: string | null = null;
  try {
    data = await adminApiFetch<JobsResp>(`/api/admin/jobs${apiQuery}`);
  } catch (e) {
    err = e instanceof Error ? e.message : "Failed to load jobs";
  }

  const jobs = data?.jobs ?? [];

  const activePills: React.ReactNode[] = [];
  if (status) activePills.push(filterPill("status", status));
  if (jobSource) activePills.push(filterPill("source", jobSource.toUpperCase()));
  if (archived) activePills.push(filterPill("archived", archived));
  if (country) activePills.push(filterPill("country", country.toUpperCase()));
  if (state) activePills.push(filterPill("state", state.toUpperCase()));
  if (city) activePills.push(filterPill("city", city));
  if (tradeCategory) activePills.push(filterPill("trade", tradeCategory.toUpperCase()));
  if (q) activePills.push(filterPill("q", q));
  if (dateRange && dateRange !== "ALL") activePills.push(filterPill("range", dateRange));

  return (
    <div>
      <h1 style={{ margin: 0, fontSize: 22, fontWeight: 950, letterSpacing: 0.2 }}>Jobs</h1>
      <p style={{ marginTop: 8, color: "rgba(226,232,240,0.72)", maxWidth: 980 }}>
        Full job search + controls. All filtering is server-side.
      </p>

      {msg === "archived" ? (
        <div
          style={{
            marginTop: 10,
            border: "1px solid rgba(34,197,94,0.35)",
            background: "rgba(34,197,94,0.10)",
            borderRadius: 14,
            padding: "10px 12px",
            color: "rgba(134,239,172,0.95)",
            fontWeight: 950,
          }}
        >
          Job archived. You are viewing archived jobs.
        </div>
      ) : null}

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
          <input name="q" defaultValue={q} placeholder="Search job id/title/address/city" style={{ ...inputStyle, minWidth: 320 }} />

          <select name="status" defaultValue={status ?? ""} style={selectStyle} aria-label="Status">
            <option value="">ALL</option>
            {/* Mirrors apps/api ADMIN_STATUSES */}
            <option value="DRAFT">DRAFT</option>
            <option value="OPEN_FOR_ROUTING">OPEN_FOR_ROUTING</option>
            <option value="ASSIGNED">ASSIGNED</option>
            <option value="IN_PROGRESS">IN_PROGRESS</option>
            <option value="CONTRACTOR_COMPLETED">CONTRACTOR_COMPLETED</option>
            <option value="CUSTOMER_APPROVED_AWAITING_ROUTER">CUSTOMER_APPROVED_AWAITING_ROUTER</option>
            <option value="CUSTOMER_REJECTED">CUSTOMER_REJECTED</option>
            <option value="FLAGGED_HOLD">FLAGGED_HOLD</option>
          </select>

          <select name="dateRange" defaultValue={dateRange} style={selectStyle} aria-label="Date range">
            <option value="ALL">ALL</option>
            <option value="1D">1D</option>
            <option value="7D">7D</option>
            <option value="30D">30D</option>
            <option value="90D">90D</option>
          </select>

          <select name="country" defaultValue={country} style={selectStyle} aria-label="Country">
            <option value="">All countries</option>
            <option value="US">US</option>
            <option value="CA">CA</option>
          </select>

          <input name="state" defaultValue={state} placeholder="State/Province (e.g. CA, BC)" style={{ ...inputStyle, minWidth: 220 }} />
          <input name="city" defaultValue={city} placeholder="City" style={inputStyle} />

          <select name="jobSource" defaultValue={jobSource} style={selectStyle} aria-label="Job source">
            <option value="">All sources</option>
            <option value="REAL">REAL</option>
            <option value="MOCK">MOCK</option>
            <option value="AI_REGENERATED">AI_REGENERATED</option>
          </select>

          <select name="archived" defaultValue={archived} style={selectStyle} aria-label="Archived filter">
            <option value="">Hide archived (default)</option>
            <option value="true">Archived only</option>
            <option value="false">Non-archived only</option>
          </select>

          <input name="tradeCategory" defaultValue={tradeCategory} placeholder="TradeCategory (enum)" style={{ ...inputStyle, minWidth: 220 }} />

          <button type="submit" style={buttonStyle}>
            Search
          </button>
        </form>

        {activePills.length ? (
          <div style={{ marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <div style={{ color: "rgba(226,232,240,0.65)", fontSize: 12, fontWeight: 900 }}>Active filters</div>
            {activePills}
          </div>
        ) : (
          <div style={{ marginTop: 10, color: "rgba(226,232,240,0.60)", fontSize: 12 }}>
            No filters applied (includes mock + real jobs).
          </div>
        )}
      </div>

      {err ? <div style={{ marginTop: 12, color: "rgba(254,202,202,0.95)", fontWeight: 900 }}>{err}</div> : null}

      <div style={{ marginTop: 12, overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "separate", borderSpacing: 0 }}>
          <thead>
            <tr>
              {["Job", "Status", "Routing", "Location", "Trade", "Source", "Published", "Assignment"].map((h) => (
                <th
                  key={h}
                  style={{
                    textAlign: "left",
                    fontSize: 12,
                    color: "rgba(226,232,240,0.70)",
                    fontWeight: 900,
                    padding: "10px 10px",
                    borderBottom: "1px solid rgba(148,163,184,0.12)",
                    whiteSpace: "nowrap",
                  }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {jobs.length === 0 ? (
              <tr>
                <td colSpan={8} style={{ padding: 12, color: "rgba(226,232,240,0.65)" }}>
                  No jobs found for current filters.
                </td>
              </tr>
            ) : (
              jobs.map((j) => (
                <tr key={j.id}>
                  <td style={tdStyle}>
                    <a href={`/jobs/${encodeURIComponent(j.id)}`} style={linkStyle}>
                      {j.title}
                    </a>
                    <div style={{ color: "rgba(226,232,240,0.55)", fontSize: 12, marginTop: 4 }}>
                      <code>{j.id}</code>
                    </div>
                  </td>
                  <td style={tdStyle}>{statusPill(j.status)}</td>
                  <td style={tdStyle}>{j.routingStatus}</td>
                  <td style={tdStyle}>
                    {(j.city ? `${j.city}, ` : "") + (j.regionCode ?? "—")} · {j.country}
                    <div style={{ color: "rgba(226,232,240,0.55)", fontSize: 12, marginTop: 4 }}>{j.addressFull ?? "—"}</div>
                  </td>
                  <td style={tdStyle}>{j.tradeCategory}</td>
                  <td style={tdStyle}>{j.jobSource}</td>
                  <td style={tdStyle}>{(j.publishedAt ?? j.createdAt).slice(0, 10)}</td>
                  <td style={tdStyle}>{j.assignment?.contractor?.businessName ?? (j.assignment ? "Assigned" : "—")}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const tdStyle: React.CSSProperties = {
  padding: "10px 10px",
  borderBottom: "1px solid rgba(148,163,184,0.08)",
  color: "rgba(226,232,240,0.90)",
  fontSize: 13,
  whiteSpace: "nowrap",
  verticalAlign: "top",
};

const linkStyle: React.CSSProperties = {
  color: "rgba(191,219,254,0.95)",
  textDecoration: "none",
  fontWeight: 950,
};

