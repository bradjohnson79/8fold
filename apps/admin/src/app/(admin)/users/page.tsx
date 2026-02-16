import { adminApiFetch } from "@/server/adminApi";

type UserRow = {
  id: string;
  name: string | null;
  email: string | null;
  role: string;
  country: string | null;
  state: string | null;
  city: string | null;
  createdAt: string;
  status: string;
  suspendedUntil: string | null;
  archivedAt: string | null;
};

type UsersResp = {
  users: UserRow[];
  nextCursor: string | null;
};

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

function pill(text: string, tone: "neutral" | "danger" | "warn" | "ok" = "neutral") {
  const styles: Record<string, React.CSSProperties> = {
    neutral: { borderColor: "rgba(148,163,184,0.14)", background: "rgba(2,6,23,0.25)", color: "rgba(226,232,240,0.85)" },
    ok: { borderColor: "rgba(34,197,94,0.30)", background: "rgba(34,197,94,0.10)", color: "rgba(134,239,172,0.95)" },
    warn: { borderColor: "rgba(251,191,36,0.30)", background: "rgba(251,191,36,0.10)", color: "rgba(253,230,138,0.95)" },
    danger: { borderColor: "rgba(248,113,113,0.30)", background: "rgba(248,113,113,0.10)", color: "rgba(254,202,202,0.95)" },
  };
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: "6px 10px",
        borderRadius: 999,
        border: "1px solid rgba(148,163,184,0.14)",
        fontSize: 12,
        fontWeight: 800,
        ...styles[tone],
      }}
    >
      {text}
    </span>
  );
}

function inputStyle(): React.CSSProperties {
  return {
    background: "rgba(2,6,23,0.35)",
    border: "1px solid rgba(148,163,184,0.14)",
    color: "rgba(226,232,240,0.92)",
    borderRadius: 12,
    padding: "9px 10px",
    fontSize: 13,
    minWidth: 180,
  };
}

function selectStyle(): React.CSSProperties {
  return { ...inputStyle(), minWidth: 160 };
}

const buttonStyle: React.CSSProperties = {
  background: "rgba(34,197,94,0.16)",
  border: "1px solid rgba(34,197,94,0.35)",
  color: "rgba(134,239,172,0.95)",
  borderRadius: 12,
  padding: "9px 12px",
  fontSize: 13,
  fontWeight: 900,
  cursor: "pointer",
  whiteSpace: "nowrap",
};

export default async function UsersPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = (await searchParams) ?? {};
  const get = (k: string) => String(Array.isArray((sp as any)[k]) ? (sp as any)[k][0] : (sp as any)[k] ?? "").trim();

  const q = get("q");
  const range = get("range") || "7D";
  const country = get("country");
  const state = get("state"); // maps to API "region"
  const city = get("city");
  const role = get("role");
  const status = get("status");
  const cursor = get("cursor");

  const includeSuspended = status === "ALL" ? "1" : "";
  const includeArchived = status === "ALL" ? "1" : "";

  const apiQuery = qs({
    query: q || undefined,
    range: range || undefined,
    country: country || undefined,
    region: state || undefined,
    city: city || undefined,
    role: role && role !== "ALL" ? role : undefined,
    status: status && status !== "ALL" ? status : undefined,
    includeSuspended: includeSuspended || undefined,
    includeArchived: includeArchived || undefined,
    cursor: cursor || undefined,
  });

  let data: UsersResp | null = null;
  let err: string | null = null;
  try {
    data = await adminApiFetch<UsersResp>(`/api/admin/users${apiQuery}`);
  } catch (e) {
    err = e instanceof Error ? e.message : "Failed to load users";
  }

  const users = data?.users ?? [];

  return (
    <div>
      <h1 style={{ margin: 0, fontSize: 22, fontWeight: 950, letterSpacing: 0.2 }}>Users</h1>
      <p style={{ marginTop: 8, color: "rgba(226,232,240,0.72)", maxWidth: 980 }}>
        Unified user intelligence. All filtering is server-side.
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
          <input name="q" defaultValue={q} placeholder="Search name/email" style={inputStyle()} />

          <select name="range" defaultValue={range} style={selectStyle()} aria-label="Date range">
            <option value="ALL">All time</option>
            <option value="1D">Last 24h</option>
            <option value="7D">Last 7d</option>
            <option value="30D">Last 30d</option>
            <option value="90D">Last 90d</option>
          </select>

          <select name="country" defaultValue={country} style={selectStyle()} aria-label="Country">
            <option value="">All countries</option>
            <option value="US">US</option>
            <option value="CA">CA</option>
          </select>

          <input name="state" defaultValue={state} placeholder="State/Province (e.g. CA, BC)" style={{ ...inputStyle(), minWidth: 220 }} />
          <input name="city" defaultValue={city} placeholder="City" style={inputStyle()} />

          <select name="role" defaultValue={role || "ALL"} style={selectStyle()} aria-label="Role">
            <option value="ALL">All roles</option>
            <option value="JOB_POSTER">Job Poster</option>
            <option value="ROUTER">Router</option>
            <option value="CONTRACTOR">Contractor</option>
            <option value="ADMIN">Admin</option>
          </select>

          <select name="status" defaultValue={status || "ALL"} style={selectStyle()} aria-label="Status">
            <option value="ALL">All statuses</option>
            <option value="ACTIVE">Active</option>
            <option value="SUSPENDED">Suspended</option>
            <option value="ARCHIVED">Dismissed (Archived)</option>
            <option value="PENDING">Pending</option>
          </select>

          <button type="submit" style={buttonStyle}>
            Apply filters
          </button>
        </form>
      </div>

      {err ? (
        <div style={{ marginTop: 12 }}>
          {pill(`Error: ${err}`, "danger")}
        </div>
      ) : null}

      <div style={{ marginTop: 12, overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "separate", borderSpacing: 0 }}>
          <thead>
            <tr>
              {["Name", "Email", "Role", "Country", "State/Province", "City", "Created", "Status flags"].map((h) => (
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
            {users.length === 0 ? (
              <tr>
                <td colSpan={8} style={{ padding: 12, color: "rgba(226,232,240,0.65)" }}>
                  No results.
                </td>
              </tr>
            ) : (
              users.map((u) => {
                const flags: React.ReactNode[] = [];
                if (u.status === "SUSPENDED" || u.suspendedUntil) flags.push(pill("SUSPENDED", "warn"));
                if (u.status === "ARCHIVED" || u.archivedAt) flags.push(pill("ARCHIVED", "danger"));
                if (u.status === "PENDING") flags.push(pill("PENDING", "neutral"));
                if (flags.length === 0) flags.push(pill(u.status || "ACTIVE", "ok"));

                return (
                  <tr key={u.id}>
                    <td style={tdStyle}>
                      <a href={`/users/${encodeURIComponent(u.id)}`} style={linkStyle}>
                        {u.name || "—"}
                      </a>
                    </td>
                    <td style={tdStyle}>{u.email || "—"}</td>
                    <td style={tdStyle}>{u.role}</td>
                    <td style={tdStyle}>{u.country || "—"}</td>
                    <td style={tdStyle}>{u.state || "—"}</td>
                    <td style={tdStyle}>{u.city || "—"}</td>
                    <td style={tdStyle}>{(u.createdAt || "").slice(0, 10) || "—"}</td>
                    <td style={{ ...tdStyle, display: "flex", gap: 8, flexWrap: "wrap" }}>{flags}</td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <div style={{ marginTop: 12, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
        <div style={{ color: "rgba(226,232,240,0.65)", fontSize: 12 }}>Showing {users.length} (page size up to 100).</div>

        {data?.nextCursor ? (
          <a
            href={`/users${qs({
              q: q || undefined,
              range: range || undefined,
              country: country || undefined,
              state: state || undefined,
              city: city || undefined,
              role: role || undefined,
              status: status || undefined,
              cursor: data.nextCursor || undefined,
            })}`}
            style={{
              ...linkStyle,
              border: "1px solid rgba(148,163,184,0.14)",
              borderRadius: 12,
              padding: "8px 10px",
              background: "rgba(2,6,23,0.35)",
              fontWeight: 900,
            }}
          >
            Next →
          </a>
        ) : (
          <div />
        )}
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
  fontWeight: 900,
};

