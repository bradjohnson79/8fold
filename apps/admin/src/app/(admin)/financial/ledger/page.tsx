import { adminApiFetch } from "@/server/adminApi";

type LedgerEntry = {
  id: string;
  createdAt: string;
  userId: string;
  jobId: string | null;
  escrowId: string | null;
  type: string;
  direction: string;
  bucket: string;
  amountCents: number;
  currency: string;
  stripeRef: string | null;
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

function fmtMoney(cents: number) {
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
const inputStyle: React.CSSProperties = { ...selectStyle, minWidth: 220 };

export default async function FinancialLedgerPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = (await searchParams) ?? {};
  const get = (k: string) => String(Array.isArray((sp as any)[k]) ? (sp as any)[k][0] : (sp as any)[k] ?? "").trim();

  const type = get("type");
  const from = get("from");
  const to = get("to");
  const take = get("take") || "200";

  const payload = await adminApiFetch<{ entries: LedgerEntry[] }>(
    `/api/admin/financial/ledger${qs({ type: type || undefined, from: from || undefined, to: to || undefined, take })}`,
  ).catch(() => ({ entries: [] }));

  const entries = payload.entries ?? [];

  return (
    <div>
      <h1 style={{ margin: 0, fontSize: 22, fontWeight: 950, letterSpacing: 0.2 }}>Ledger</h1>
      <p style={{ marginTop: 8, color: "rgba(226,232,240,0.72)", maxWidth: 980 }}>
        Immutable ledger entries (append-only). Read-only.
      </p>

      <form method="GET" style={{ marginTop: 10, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
        <select name="type" defaultValue={type} style={selectStyle} aria-label="Type">
          <option value="">All types</option>
          <option value="ESCROW_FUND">ESCROW_FUND</option>
          <option value="ESCROW_RELEASE">ESCROW_RELEASE</option>
          <option value="ESCROW_REFUND">ESCROW_REFUND</option>
          <option value="PLATFORM_FEE">PLATFORM_FEE</option>
          <option value="BROKER_FEE">BROKER_FEE</option>
          <option value="CONTRACTOR_EARN">CONTRACTOR_EARN</option>
          <option value="ROUTER_EARN">ROUTER_EARN</option>
          <option value="PAYOUT">PAYOUT</option>
          <option value="ADJUSTMENT">ADJUSTMENT</option>
        </select>
        <input name="from" defaultValue={from} style={inputStyle} placeholder="From (ISO datetime)" />
        <input name="to" defaultValue={to} style={inputStyle} placeholder="To (ISO datetime)" />
        <input name="take" defaultValue={take} style={{ ...inputStyle, minWidth: 100 }} placeholder="Take" />
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
              {["When", "Ledger ID", "Job", "Type", "Amount", "Currency", "Stripe ref"].map((h) => (
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
            {entries.length === 0 ? (
              <tr>
                <td colSpan={7} style={{ padding: 12, color: "rgba(226,232,240,0.65)" }}>
                  No results.
                </td>
              </tr>
            ) : (
              entries.map((e) => (
                <tr key={e.id}>
                  <td style={{ padding: "10px 10px", borderBottom: "1px solid rgba(148,163,184,0.10)", whiteSpace: "nowrap" }}>
                    {String(e.createdAt).slice(0, 19).replace("T", " ")}
                  </td>
                  <td style={{ padding: "10px 10px", borderBottom: "1px solid rgba(148,163,184,0.10)" }}>
                    <code>{e.id}</code>
                  </td>
                  <td style={{ padding: "10px 10px", borderBottom: "1px solid rgba(148,163,184,0.10)" }}>
                    {e.jobId ? (
                      <a href={`/jobs/${encodeURIComponent(String(e.jobId))}`} style={{ color: "rgba(56,189,248,0.95)", textDecoration: "none", fontWeight: 900 }}>
                        <code>{e.jobId}</code>
                      </a>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td style={{ padding: "10px 10px", borderBottom: "1px solid rgba(148,163,184,0.10)" }}>
                    <code>{e.type}</code> {String(e.direction).toUpperCase()} {String(e.bucket).toUpperCase()}
                  </td>
                  <td style={{ padding: "10px 10px", borderBottom: "1px solid rgba(148,163,184,0.10)" }}>{fmtMoney(e.amountCents)}</td>
                  <td style={{ padding: "10px 10px", borderBottom: "1px solid rgba(148,163,184,0.10)" }}>{e.currency}</td>
                  <td style={{ padding: "10px 10px", borderBottom: "1px solid rgba(148,163,184,0.10)" }}>
                    {e.stripeRef ? <code>{e.stripeRef}</code> : "—"}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

