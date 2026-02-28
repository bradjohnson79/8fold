import { redirect } from "next/navigation";
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

export default async function PayoutsPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = (await searchParams) ?? {};
  const get = (k: string) => String(Array.isArray((sp as any)[k]) ? (sp as any)[k][0] : (sp as any)[k] ?? "").trim();
  const status = get("status") || "REQUESTED";

  async function createAdjustment(formData: FormData) {
    "use server";
    const userId = String(formData.get("userId") ?? "").trim();
    const direction = String(formData.get("direction") ?? "").trim();
    const bucket = String(formData.get("bucket") ?? "").trim();
    const amount = Number(String(formData.get("amount") ?? "0").trim());
    const memo = String(formData.get("memo") ?? "").trim();
    if (!userId || !direction || !bucket || !Number.isFinite(amount) || amount <= 0) {
      redirect(`/payouts${qs({ status })}`);
    }

    await adminApiFetch("/api/admin/v4/payouts/adjustments", {
      method: "POST",
      body: JSON.stringify({
        userId,
        direction,
        bucket,
        amountCents: Math.round(amount * 100),
        memo: memo || undefined,
      }),
    }).catch(() => null);

    redirect(`/payouts${qs({ status })}`);
  }

  const [requests, transfers, overview] = await Promise.all([
    adminApiFetch<{ payoutRequests: Array<any> }>(`/api/admin/v4/payouts/requests${qs({ status })}`)
      .then((r) => r.payoutRequests ?? [])
      .catch(() => []),
    adminApiFetch<{ items: Array<any> }>("/api/admin/v4/payouts/transfers?take=20")
      .then((r) => r.items ?? [])
      .catch(() => []),
    adminApiFetch<{ pendingPayouts: number }>("/api/admin/v4/overview").catch(() => null),
  ]);

  return (
    <div>
      <h1 style={{ margin: 0, fontSize: 22, fontWeight: 950 }}>Payouts</h1>
      <p style={{ marginTop: 8, color: "rgba(226,232,240,0.72)" }}>Payout requests, transfer activity, and manual adjustments.</p>

      <div style={{ marginTop: 12, border: "1px solid rgba(148,163,184,0.2)", borderRadius: 12, padding: 12 }}>
        <div style={{ color: "rgba(226,232,240,0.75)", fontSize: 12, fontWeight: 900 }}>Pending Payout Count</div>
        <div style={{ marginTop: 4, fontSize: 24, fontWeight: 950 }}>{overview?.pendingPayouts ?? 0}</div>
      </div>

      <div style={{ marginTop: 16 }}>
        <div style={{ fontWeight: 900 }}>Create Adjustment</div>
        <form action={createAdjustment} style={{ marginTop: 8, display: "flex", gap: 8, flexWrap: "wrap" }}>
          <input name="userId" placeholder="User ID" style={inputStyle} />
          <select name="direction" defaultValue="CREDIT" style={inputStyle}><option value="CREDIT">CREDIT</option><option value="DEBIT">DEBIT</option></select>
          <input name="bucket" placeholder="Bucket" style={inputStyle} />
          <input name="amount" placeholder="Amount (e.g. 25.00)" style={inputStyle} />
          <input name="memo" placeholder="Memo" style={{ ...inputStyle, minWidth: 240 }} />
          <button type="submit" style={buttonStyle}>Submit</button>
        </form>
      </div>

      <div style={{ marginTop: 18 }}>
        <div style={{ fontWeight: 900 }}>Payout Requests</div>
        {requests.length === 0 ? <div style={{ marginTop: 8, color: "rgba(226,232,240,0.72)" }}>No payout requests.</div> : null}
        {requests.length > 0 ? (
          <table style={{ width: "100%", marginTop: 8, borderCollapse: "collapse" }}>
            <thead>
              <tr>{["ID", "User", "Role", "Amount", "Status", "Created"].map((h) => <th key={h} style={thStyle}>{h}</th>)}</tr>
            </thead>
            <tbody>
              {requests.map((r: any) => (
                <tr key={r.id}>
                  <td style={tdStyle}>{r.id}</td>
                  <td style={tdStyle}>{r.userEmail || r.userId}</td>
                  <td style={tdStyle}>{r.userRole || "-"}</td>
                  <td style={tdStyle}>{money(r.amountCents)}</td>
                  <td style={tdStyle}>{r.status}</td>
                  <td style={tdStyle}>{String(r.createdAt || "").slice(0, 19).replace("T", " ")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : null}
      </div>

      <div style={{ marginTop: 18 }}>
        <div style={{ fontWeight: 900 }}>Recent Transfers</div>
        {transfers.length === 0 ? <div style={{ marginTop: 8, color: "rgba(226,232,240,0.72)" }}>No transfers.</div> : null}
        {transfers.length > 0 ? (
          <table style={{ width: "100%", marginTop: 8, borderCollapse: "collapse" }}>
            <thead>
              <tr>{["ID", "Job", "User", "Role", "Amount", "Status", "Created"].map((h) => <th key={h} style={thStyle}>{h}</th>)}</tr>
            </thead>
            <tbody>
              {transfers.map((t: any) => (
                <tr key={t.id}>
                  <td style={tdStyle}>{t.id}</td>
                  <td style={tdStyle}>{t.jobId}</td>
                  <td style={tdStyle}>{t.userEmail || t.userId}</td>
                  <td style={tdStyle}>{t.role}</td>
                  <td style={tdStyle}>{money(t.amountCents)}</td>
                  <td style={tdStyle}>{t.status}</td>
                  <td style={tdStyle}>{String(t.createdAt || "").slice(0, 19).replace("T", " ")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : null}
      </div>
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
