import { adminApiFetch } from "@/server/adminApiV4";

type UserRow = {
  id: string;
  role: "JOB_POSTER";
  name: string | null;
  email: string | null;
  phone: string | null;
  country: string | null;
  regionCode: string | null;
  city: string | null;
  status: string;
  createdAt: string;
  badges: string[];
};

type ListResp = { rows: UserRow[]; totalCount: number; page: number; pageSize: number };

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

export default async function JobPostersPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = (await searchParams) ?? {};
  const q = getParam(sp, "q");
  const status = getParam(sp, "status");
  const page = Math.max(1, Number(getParam(sp, "page", "1") || "1") || 1);
  const pageSize = Math.max(1, Math.min(100, Number(getParam(sp, "pageSize", "25") || "25") || 25));

  let data: ListResp | null = null;
  let err: string | null = null;

  try {
    data = await adminApiFetch<ListResp>(
      `/api/admin/v4/job-posters${qs({
        q: q || undefined,
        status: status || undefined,
        page: String(page),
        pageSize: String(pageSize),
      })}`,
    );
  } catch (e) {
    err = e instanceof Error ? e.message : "Failed to load job posters";
  }

  const rows = data?.rows ?? [];
  const totalCount = Number(data?.totalCount ?? 0);
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));

  return (
    <div>
      <h1 style={{ margin: 0, fontSize: 22, fontWeight: 950 }}>Job Posters</h1>
      <p style={{ marginTop: 8, color: "rgba(226,232,240,0.72)" }}>
        Job poster accounts, status signals, and recent activity context.
      </p>

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

      {err ? <div style={{ marginTop: 12, color: "rgba(254,202,202,0.95)", fontWeight: 900 }}>{err}</div> : null}

      <div style={{ marginTop: 12, overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "separate", borderSpacing: 0 }}>
          <thead>
            <tr>
              {["Name", "Email", "Phone", "Region", "Status", "Created", "Badges"].map((h) => (
                <th key={h} style={{ textAlign: "left", fontSize: 12, color: "rgba(226,232,240,0.70)", fontWeight: 900, padding: "10px 10px", borderBottom: "1px solid rgba(148,163,184,0.12)" }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={7} style={{ padding: 12, color: "rgba(226,232,240,0.65)" }}>
                  No job posters found.
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={r.id}>
                  <td style={tdStyle}>
                    <a href={`/job-posters/${encodeURIComponent(r.id)}`} style={linkStyle}>
                      {r.name ?? "—"}
                    </a>
                  </td>
                  <td style={tdStyle}>{r.email ?? "—"}</td>
                  <td style={tdStyle}>{r.phone ?? "—"}</td>
                  <td style={tdStyle}>{[r.city, r.regionCode, r.country].filter(Boolean).join(", ") || "—"}</td>
                  <td style={tdStyle}>{r.status}</td>
                  <td style={tdStyle}>{r.createdAt.slice(0, 10)}</td>
                  <td style={tdStyle}>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      {(r.badges ?? []).map((b) => (
                        <span key={b} style={{ border: "1px solid rgba(148,163,184,0.2)", borderRadius: 999, padding: "4px 8px", fontSize: 11, fontWeight: 900 }}>
                          {b}
                        </span>
                      ))}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div style={{ marginTop: 12, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ color: "rgba(226,232,240,0.65)", fontSize: 12 }}>
          Showing {(page - 1) * pageSize + (rows.length ? 1 : 0)}-{(page - 1) * pageSize + rows.length} of {totalCount}
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <a
            href={`/job-posters${qs({ q: q || undefined, status: status || undefined, page: String(Math.max(1, page - 1)), pageSize: String(pageSize) })}`}
            style={{ ...pagerLinkStyle, pointerEvents: page <= 1 ? "none" : "auto", opacity: page <= 1 ? 0.45 : 1 }}
          >
            ← Prev
          </a>
          <div style={{ color: "rgba(226,232,240,0.72)", fontSize: 12, fontWeight: 900 }}>Page {page} / {totalPages}</div>
          <a
            href={`/job-posters${qs({ q: q || undefined, status: status || undefined, page: String(Math.min(totalPages, page + 1)), pageSize: String(pageSize) })}`}
            style={{ ...pagerLinkStyle, pointerEvents: page >= totalPages ? "none" : "auto", opacity: page >= totalPages ? 0.45 : 1 }}
          >
            Next →
          </a>
        </div>
      </div>
    </div>
  );
}

const tdStyle: React.CSSProperties = {
  padding: "10px 10px",
  borderBottom: "1px solid rgba(148,163,184,0.08)",
  color: "rgba(226,232,240,0.90)",
  fontSize: 13,
  verticalAlign: "top",
};

const linkStyle: React.CSSProperties = {
  color: "rgba(191,219,254,0.95)",
  textDecoration: "none",
  fontWeight: 900,
};

const pagerLinkStyle: React.CSSProperties = {
  border: "1px solid rgba(148,163,184,0.14)",
  borderRadius: 12,
  padding: "8px 10px",
  color: "rgba(191,219,254,0.95)",
  textDecoration: "none",
  fontWeight: 900,
};
