import { adminApiFetch } from "@/server/adminApi";

type EscrowRow = {
  escrowId: string;
  jobId: string;
  createdAt: string;
  posterPaidCents: number;
  contractorShareCents: number;
  routerShareCents: number;
  platformShareCents: number;
  expressFeeCents: number;
  escrowStatus: string;
  releaseStatus: string;
  stripePaymentIntentId: string | null;
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
  minWidth: 160,
};
const inputStyle: React.CSSProperties = { ...selectStyle, minWidth: 220 };

export default async function FinancialEscrowPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = (await searchParams) ?? {};
  const get = (k: string) => String(Array.isArray((sp as any)[k]) ? (sp as any)[k][0] : (sp as any)[k] ?? "").trim();
  const status = get("status") || "HELD";
  const expressOnly = get("express") || "";
  const from = get("from");
  const to = get("to");
  const take = get("take") || "200";

  const payload = await adminApiFetch<{ rows: EscrowRow[] }>(
    `/api/admin/financial/escrow${qs({ status: status || undefined, express: expressOnly || undefined, from: from || undefined, to: to || undefined, take })}`,
  ).catch(() => ({ rows: [] }));

  const rows = payload.rows ?? [];

  return (
    <div>
      <h1 style={{ margin: 0, fontSize: 22, fontWeight: 950, letterSpacing: 0.2 }}>Escrow</h1>
      <p style={{ marginTop: 8, color: "rgba(226,232,240,0.72)", maxWidth: 980 }}>
        Read-only view of escrow rows (Escrow + Job pricing columns). No manual edits.
      </p>

      <form method="GET" style={{ marginTop: 10, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
        <select name="status" defaultValue={status} style={selectStyle} aria-label="Escrow filter">
          <option value="HELD">Held</option>
          <option value="RELEASED">Released</option>
          <option value="FAILED">Failed</option>
          <option value="ALL">All</option>
        </select>
        <select name="express" defaultValue={expressOnly} style={selectStyle} aria-label="Express filter">
          <option value="">All</option>
          <option value="1">Express only</option>
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
              {[
                "Job",
                "Poster paid",
                "Contractor",
                "Router",
                "Platform",
                "Express fee",
                "Escrow status",
                "Release status",
                "PaymentIntent",
                "Created",
              ].map((h) => (
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
            {rows.length === 0 ? (
              <tr>
                <td colSpan={10} style={{ padding: 12, color: "rgba(226,232,240,0.65)" }}>
                  No results.
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={r.escrowId}>
                  <td style={{ padding: "10px 10px", borderBottom: "1px solid rgba(148,163,184,0.10)" }}>
                    <a href={`/jobs/${encodeURIComponent(r.jobId)}`} style={{ color: "rgba(56,189,248,0.95)", textDecoration: "none", fontWeight: 900 }}>
                      <code>{r.jobId}</code>
                    </a>
                    <div style={{ marginTop: 4, color: "rgba(226,232,240,0.55)", fontSize: 12 }}>
                      <code>{r.escrowId}</code>
                    </div>
                  </td>
                  <td style={{ padding: "10px 10px", borderBottom: "1px solid rgba(148,163,184,0.10)" }}>{fmtMoney(r.posterPaidCents)}</td>
                  <td style={{ padding: "10px 10px", borderBottom: "1px solid rgba(148,163,184,0.10)" }}>{fmtMoney(r.contractorShareCents)}</td>
                  <td style={{ padding: "10px 10px", borderBottom: "1px solid rgba(148,163,184,0.10)" }}>{fmtMoney(r.routerShareCents)}</td>
                  <td style={{ padding: "10px 10px", borderBottom: "1px solid rgba(148,163,184,0.10)" }}>{fmtMoney(r.platformShareCents)}</td>
                  <td style={{ padding: "10px 10px", borderBottom: "1px solid rgba(148,163,184,0.10)" }}>{fmtMoney(r.expressFeeCents)}</td>
                  <td style={{ padding: "10px 10px", borderBottom: "1px solid rgba(148,163,184,0.10)" }}>{r.escrowStatus}</td>
                  <td style={{ padding: "10px 10px", borderBottom: "1px solid rgba(148,163,184,0.10)" }}>{r.releaseStatus}</td>
                  <td style={{ padding: "10px 10px", borderBottom: "1px solid rgba(148,163,184,0.10)" }}>
                    {r.stripePaymentIntentId ? <code>{r.stripePaymentIntentId}</code> : "—"}
                  </td>
                  <td style={{ padding: "10px 10px", borderBottom: "1px solid rgba(148,163,184,0.10)", whiteSpace: "nowrap" }}>
                    {String(r.createdAt).slice(0, 19).replace("T", " ")}
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

