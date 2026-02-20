import { adminApiFetch } from "@/server/adminApi";

type TransferActivityItem = {
  id: string;
  createdAt: string;
  releasedAt: string | null;
  status: string;
  method: string;
  role: string;
  userId: string;
  jobId: string;
  amountCents: number;
  currency: string;
  stripeTransferId: string | null;
  externalRef: string | null;
  failureReason: string | null;
  user: { id: string; email: string | null; name: string | null };
  job: { id: string; title: string | null } | null;
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

function fmtMoney(cents: number | null | undefined) {
  const n = Number(cents ?? 0);
  const sign = n < 0 ? "-" : "";
  const abs = Math.abs(n);
  return `${sign}$${(abs / 100).toFixed(2)}`;
}

const selectStyle: React.CSSProperties = {
  background: "rgba(2,6,23,0.35)",
  border: "1px solid rgba(148,163,184,0.14)",
  color: "rgba(226,232,240,0.92)",
  borderRadius: 12,
  padding: "9px 10px",
  fontSize: 13,
  minWidth: 170,
};
const inputStyle: React.CSSProperties = { ...selectStyle, minWidth: 240 };
const tdStyle: React.CSSProperties = {
  padding: "10px 10px",
  borderBottom: "1px solid rgba(148,163,184,0.10)",
  verticalAlign: "top",
  color: "rgba(226,232,240,0.86)",
  fontSize: 13,
};
const linkStyle: React.CSSProperties = { color: "rgba(56,189,248,0.95)", textDecoration: "none", fontWeight: 900 };

function pill(text: string, tone?: "green" | "red" | "amber" | "slate") {
  const t = tone ?? "slate";
  const bg =
    t === "green"
      ? "rgba(34,197,94,0.14)"
      : t === "red"
        ? "rgba(248,113,113,0.14)"
        : t === "amber"
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
        background: bg,
        fontSize: 12,
        fontWeight: 900,
        color: "rgba(226,232,240,0.90)",
        whiteSpace: "nowrap",
      }}
    >
      {text}
    </span>
  );
}

export default async function TransfersPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = (await searchParams) ?? {};
  const get = (k: string) => String(Array.isArray((sp as any)[k]) ? (sp as any)[k][0] : (sp as any)[k] ?? "").trim();

  const role = get("role");
  const method = get("method");
  const status = get("status");
  const userId = get("userId");
  const from = get("from");
  const to = get("to");
  const take = get("take") || "50";

  const data = await adminApiFetch<{ data: { items: TransferActivityItem[] } }>(
    `/api/admin/finance/transfers${qs({ role: role || undefined, method: method || undefined, status: status || undefined, userId: userId || undefined, from: from || undefined, to: to || undefined, take })}`,
  ).catch(() => ({ data: { items: [] as any } } as any));

  const items = (data as any)?.data?.items ?? [];

  return (
    <div>
      <h1 style={{ margin: 0, fontSize: 22, fontWeight: 950, letterSpacing: 0.2 }}>Transfers</h1>
      <p style={{ marginTop: 8, color: "rgba(226,232,240,0.72)", maxWidth: 980 }}>
        Filterable view of transfer legs created by `releaseJobFunds()` (Stripe transfers).
      </p>

      <form method="GET" style={{ marginTop: 10, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
        <select name="role" defaultValue={role} style={selectStyle} aria-label="Role">
          <option value="">All roles</option>
          <option value="CONTRACTOR">CONTRACTOR</option>
          <option value="ROUTER">ROUTER</option>
          <option value="PLATFORM">PLATFORM</option>
        </select>
        <select name="method" defaultValue={method} style={selectStyle} aria-label="Method">
          <option value="">All methods</option>
          <option value="STRIPE">STRIPE</option>
        </select>
        <select name="status" defaultValue={status} style={selectStyle} aria-label="Status">
          <option value="">All statuses</option>
          <option value="SENT">SENT</option>
          <option value="PENDING">PENDING</option>
          <option value="FAILED">FAILED</option>
          <option value="REVERSED">REVERSED</option>
        </select>
        <input name="userId" defaultValue={userId} style={{ ...inputStyle, minWidth: 260 }} placeholder="User ID (optional)" />
        <input name="from" defaultValue={from} style={{ ...inputStyle, minWidth: 200 }} placeholder="From (ISO datetime)" />
        <input name="to" defaultValue={to} style={{ ...inputStyle, minWidth: 200 }} placeholder="To (ISO datetime)" />
        <input name="take" defaultValue={take} style={{ ...inputStyle, minWidth: 90 }} placeholder="Take" />
        <button
          type="submit"
          style={{
            background: "rgba(34,197,94,0.16)",
            border: "1px solid rgba(34,197,94,0.35)",
            color: "rgba(134,239,172,0.95)",
            borderRadius: 12,
            padding: "9px 12px",
            fontSize: 13,
            fontWeight: 950,
            cursor: "pointer",
            whiteSpace: "nowrap",
          }}
        >
          Apply
        </button>
      </form>

      <div style={{ marginTop: 12, overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "separate", borderSpacing: 0 }}>
          <thead>
            <tr>
              {["When", "User", "Role", "Job", "Amount", "Method", "Status", "External Ref", "Action"].map((h) => (
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
            {items.length === 0 ? (
              <tr>
                <td colSpan={9} style={{ padding: 12, color: "rgba(226,232,240,0.65)" }}>
                  No results.
                </td>
              </tr>
            ) : (
              items.map((t: any) => {
                const st = String(t.status ?? "");
                const tone = st === "SENT" ? "green" : st === "FAILED" || st === "REVERSED" ? "red" : "amber";
                const userLabel = t.user?.email ?? t.userId ?? "—";
                const jobLabel = t.job?.title ?? t.jobId ?? "—";
                const ref = t.stripeTransferId ?? t.externalRef ?? "—";
                return (
                  <tr key={String(t.id)}>
                    <td style={tdStyle}>{String(t.createdAt ?? "").slice(0, 19).replace("T", " ") || "—"}</td>
                    <td style={tdStyle}>
                      <a href={`/users/${encodeURIComponent(String(t.userId ?? ""))}`} style={linkStyle}>
                        {userLabel}
                      </a>
                    </td>
                    <td style={tdStyle}>{String(t.role ?? "—")}</td>
                    <td style={tdStyle}>
                      <a href={`/jobs/${encodeURIComponent(String(t.jobId ?? ""))}`} style={linkStyle}>
                        {jobLabel}
                      </a>
                    </td>
                    <td style={tdStyle}>{fmtMoney(Number(t.amountCents ?? 0))}</td>
                    <td style={tdStyle}>{String(t.method ?? "—")}</td>
                    <td style={tdStyle}>{pill(st || "—", tone as any)}</td>
                    <td style={tdStyle}>
                      <code>{String(ref)}</code>
                      {t.failureReason ? (
                        <div style={{ marginTop: 4, color: "rgba(254,202,202,0.85)", fontSize: 12 }}>{String(t.failureReason)}</div>
                      ) : null}
                    </td>
                    <td style={tdStyle}>
                      <a href={`/users/${encodeURIComponent(String(t.userId ?? ""))}/payout-trace`} style={linkStyle}>
                        View
                      </a>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

