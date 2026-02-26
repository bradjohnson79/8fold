import { adminApiFetch } from "@/server/adminApiV4";

function money(cents: number) {
  return `$${(Number(cents || 0) / 100).toFixed(2)}`;
}

function qs(sp: Record<string, string | undefined>) {
  const u = new URL("http://internal");
  for (const [k, v] of Object.entries(sp)) {
    if (!v) continue;
    u.searchParams.set(k, v);
  }
  const out = u.searchParams.toString();
  return out ? `?${out}` : "";
}

export default async function TransfersPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = (await searchParams) ?? {};
  const get = (k: string) => String(Array.isArray((sp as any)[k]) ? (sp as any)[k][0] : (sp as any)[k] ?? "").trim();

  const role = get("role");
  const status = get("status");
  const userId = get("userId");
  const take = get("take") || "50";

  const items = await adminApiFetch<{ items: Array<any> }>(
    `/api/admin/v4/payouts/transfers${qs({ role: role || undefined, status: status || undefined, userId: userId || undefined, take })}`,
  )
    .then((d) => d.items ?? [])
    .catch(() => []);

  return (
    <div>
      <h1 style={{ margin: 0, fontSize: 22, fontWeight: 950 }}>Transfers</h1>
      <p style={{ marginTop: 8, color: "rgba(226,232,240,0.72)" }}>Filterable payout transfer activity.</p>

      <form method="GET" style={{ marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap" }}>
        <select name="role" defaultValue={role} style={inputStyle}>
          <option value="">All roles</option>
          <option value="CONTRACTOR">CONTRACTOR</option>
          <option value="ROUTER">ROUTER</option>
          <option value="PLATFORM">PLATFORM</option>
        </select>
        <select name="status" defaultValue={status} style={inputStyle}>
          <option value="">All statuses</option>
          <option value="SENT">SENT</option>
          <option value="PENDING">PENDING</option>
          <option value="FAILED">FAILED</option>
          <option value="REVERSED">REVERSED</option>
        </select>
        <input name="userId" defaultValue={userId} placeholder="User ID" style={inputStyle} />
        <input name="take" defaultValue={take} placeholder="Take" style={{ ...inputStyle, minWidth: 90 }} />
        <button type="submit" style={buttonStyle}>Apply</button>
      </form>

      {items.length === 0 ? <div style={{ marginTop: 12, color: "rgba(226,232,240,0.72)" }}>No transfers found.</div> : null}
      {items.length > 0 ? (
        <table style={{ width: "100%", marginTop: 12, borderCollapse: "collapse" }}>
          <thead>
            <tr>{["ID", "Job", "User", "Role", "Amount", "Status", "Method", "Created"].map((h) => <th key={h} style={thStyle}>{h}</th>)}</tr>
          </thead>
          <tbody>
            {items.map((t: any) => (
              <tr key={t.id}>
                <td style={tdStyle}>{t.id}</td>
                <td style={tdStyle}>{t.jobId}</td>
                <td style={tdStyle}>{t.userEmail || t.userId}</td>
                <td style={tdStyle}>{t.role}</td>
                <td style={tdStyle}>{money(t.amountCents)}</td>
                <td style={tdStyle}>{t.status}</td>
                <td style={tdStyle}>{t.method}</td>
                <td style={tdStyle}>{String(t.createdAt || "").slice(0, 19).replace("T", " ")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  borderRadius: 10,
  border: "1px solid rgba(148,163,184,0.2)",
  background: "rgba(2,6,23,0.35)",
  color: "rgba(226,232,240,0.92)",
  padding: "8px 10px",
};
const buttonStyle: React.CSSProperties = {
  borderRadius: 10,
  border: "1px solid rgba(56,189,248,0.4)",
  background: "rgba(56,189,248,0.14)",
  color: "rgba(125,211,252,0.95)",
  fontWeight: 900,
  padding: "8px 12px",
  cursor: "pointer",
};
const thStyle: React.CSSProperties = { textAlign: "left", borderBottom: "1px solid rgba(148,163,184,0.2)", padding: "8px 10px", fontSize: 12, color: "rgba(226,232,240,0.7)" };
const tdStyle: React.CSSProperties = { borderBottom: "1px solid rgba(148,163,184,0.1)", padding: "8px 10px", color: "rgba(226,232,240,0.9)", fontSize: 13 };
