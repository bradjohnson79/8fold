import { adminApiFetch } from "@/server/adminApi";

type TraceItem = {
  id: string;
  createdAt: string;
  releasedAt: string | null;
  status: string;
  method: string;
  role: string;
  jobId: string;
  amountCents: number;
  currency: string;
  stripeTransferId: string | null;
  externalRef: string | null;
  failureReason: string | null;
  job: { id: string; title: string | null; payoutStatus: string | null } | null;
};

function fmtMoney(cents: number | null | undefined) {
  const n = Number(cents ?? 0);
  const sign = n < 0 ? "-" : "";
  const abs = Math.abs(n);
  return `${sign}$${(abs / 100).toFixed(2)}`;
}

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

export default async function PayoutTracePage({ params }: { params: Promise<{ id: string }> }) {
  const p = await params;
  const id = String(p.id ?? "").trim();

  const resp = await adminApiFetch<{ data: any }>(`/api/admin/users/${encodeURIComponent(id)}/payout-trace`).catch(() => null);
  const data = (resp as any)?.data ?? null;

  const user = data?.user ?? null;
  const totals = data?.totals ?? null;
  const walletTotals = data?.walletTotals ?? null;
  const sanity = data?.sanity ?? null;
  const items: TraceItem[] = data?.items ?? [];

  return (
    <div>
      <h1 style={{ margin: 0, fontSize: 22, fontWeight: 950, letterSpacing: 0.2 }}>Payout Trace</h1>
      <p style={{ marginTop: 8, color: "rgba(226,232,240,0.72)", maxWidth: 980 }}>
        TransferRecord history + ledger snapshot for a single user.
      </p>

      <div style={{ marginTop: 10, color: "rgba(226,232,240,0.75)" }}>
        <div>
          <span style={{ color: "rgba(226,232,240,0.55)" }}>User:</span>{" "}
          <code>{id}</code> {user?.email ? <span style={{ marginLeft: 10 }}>{String(user.email)}</span> : null}
        </div>
        {sanity ? (
          <div style={{ marginTop: 6, color: sanity.missingLedgerEvidence ? "rgba(254,202,202,0.92)" : "rgba(134,239,172,0.92)", fontWeight: 900 }}>
            Sanity: missing ledger evidence = {String(sanity.missingLedgerEvidence ?? 0)}
          </div>
        ) : null}
      </div>

      <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <div style={{ border: "1px solid rgba(148,163,184,0.14)", borderRadius: 16, padding: 12, background: "rgba(2,6,23,0.30)" }}>
          <div style={{ fontWeight: 950 }}>Transfer totals</div>
          <div style={{ marginTop: 10, display: "grid", gap: 6, color: "rgba(226,232,240,0.78)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
              <div>Sent</div>
              <div style={{ fontWeight: 950 }}>{fmtMoney(totals?.sentCents ?? 0)}</div>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
              <div>Pending</div>
              <div style={{ fontWeight: 950 }}>{fmtMoney(totals?.pendingCents ?? 0)}</div>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
              <div>Failed</div>
              <div style={{ fontWeight: 950 }}>{fmtMoney(totals?.failedCents ?? 0)}</div>
            </div>
            <div style={{ height: 1, background: "rgba(148,163,184,0.12)", margin: "6px 0" }} />
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
              <div>Stripe sent</div>
              <div style={{ fontWeight: 950 }}>{fmtMoney(totals?.stripeSentCents ?? 0)}</div>
            </div>
          </div>
        </div>

        <div style={{ border: "1px solid rgba(148,163,184,0.14)", borderRadius: 16, padding: 12, background: "rgba(2,6,23,0.30)" }}>
          <div style={{ fontWeight: 950 }}>Ledger snapshot</div>
          <div style={{ marginTop: 10, display: "grid", gap: 6, color: "rgba(226,232,240,0.78)" }}>
            {["PENDING", "AVAILABLE", "PAID", "HELD"].map((b) => (
              <div key={b} style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                <div>{b}</div>
                <div style={{ fontWeight: 950 }}>{fmtMoney(walletTotals?.[b] ?? 0)}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div style={{ marginTop: 12, overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "separate", borderSpacing: 0 }}>
          <thead>
            <tr>
              {["When", "Role", "Job", "Amount", "Method", "Status", "External Ref"].map((h) => (
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
                <td colSpan={7} style={{ padding: 12, color: "rgba(226,232,240,0.65)" }}>
                  No transfer history.
                </td>
              </tr>
            ) : (
              items.map((t: any) => {
                const st = String(t.status ?? "");
                const tone = st === "SENT" ? "green" : st === "FAILED" ? "red" : "amber";
                const jobLabel = t.job?.title ?? t.jobId ?? "—";
                const ref = t.stripeTransferId ?? t.externalRef ?? "—";
                return (
                  <tr key={String(t.id)}>
                    <td style={tdStyle}>{String(t.createdAt ?? "").slice(0, 19).replace("T", " ") || "—"}</td>
                    <td style={tdStyle}>{String(t.role ?? "—")}</td>
                    <td style={tdStyle}>
                      <a href={`/jobs/${encodeURIComponent(String(t.jobId ?? ""))}`} style={linkStyle}>
                        {jobLabel}
                      </a>
                      {t.job?.payoutStatus ? (
                        <div style={{ marginTop: 4, color: "rgba(226,232,240,0.55)", fontSize: 12 }}>job payoutStatus={String(t.job.payoutStatus)}</div>
                      ) : null}
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

