import { adminApiFetch } from "@/server/adminApi";
import { redirect } from "next/navigation";

type TransferItem = {
  id: string;
  createdAt: string;
  status: string;
  method: string;
  role: string;
  userId: string;
  jobId: string;
  amountCents: number;
  currency: string;
  stripeTransferId: string | null;
  failureReason: string | null;
  user: { id: string; email: string | null; name: string | null };
  job: { id: string; title: string | null } | null;
  retryCount: number;
};

type PayoutEnginePayload = {
  pending: TransferItem[];
  failed: TransferItem[];
  weekly: Array<{ weekStart: string; pendingCents: number; failedCents: number; sentCents: number }>;
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

const tdStyle: React.CSSProperties = {
  padding: "10px 10px",
  borderBottom: "1px solid rgba(148,163,184,0.10)",
  verticalAlign: "top",
  color: "rgba(226,232,240,0.86)",
  fontSize: 13,
};
const linkStyle: React.CSSProperties = { color: "rgba(56,189,248,0.95)", textDecoration: "none", fontWeight: 900 };

export default async function FinancialPayoutEnginePage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = (await searchParams) ?? {};
  const get = (k: string) => String(Array.isArray((sp as any)[k]) ? (sp as any)[k][0] : (sp as any)[k] ?? "").trim();
  const banner = get("banner");

  async function retryTransfer(formData: FormData) {
    "use server";
    const transferId = String(formData.get("transferId") ?? "").trim();
    if (!transferId) redirect(`/financial/payouts${qs({ banner: "missing_transfer_id" })}`);

    // Visibility layer only (no Stripe mutation yet): request a dry-run preview.
    // If/when Stripe Connect retry is implemented, this will become a confirmed mutation.
    try {
      await adminApiFetch(`/api/admin/financial/payouts/retry`, {
        method: "POST",
        body: JSON.stringify({ transferId, dryRun: true }),
      });
      redirect(`/financial/payouts${qs({ banner: "retry_preview_ok" })}`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "retry_failed";
      redirect(`/financial/payouts${qs({ banner: `retry_failed:${msg}` })}`);
    }
  }

  const data = await adminApiFetch<PayoutEnginePayload>(`/api/admin/financial/payouts${qs({})}`).catch(() => null);

  return (
    <div>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 950, letterSpacing: 0.2 }}>Payout Engine</h1>
        <a href="/payouts/transfers" style={linkStyle}>
          Full transfers view →
        </a>
      </div>
      <p style={{ marginTop: 8, color: "rgba(226,232,240,0.72)", maxWidth: 980 }}>
        Pending/failed transfers and weekly batch totals. Retry is SUPER-only and currently runs as dry-run preview.
      </p>

      {banner ? (
        <div style={{ marginTop: 10, fontWeight: 900, color: banner.includes("failed") ? "rgba(254,202,202,0.95)" : "rgba(134,239,172,0.95)" }}>
          {banner}
        </div>
      ) : null}

      {!data ? (
        <div style={{ marginTop: 10, color: "rgba(254,202,202,0.95)", fontWeight: 900 }}>Failed to load payout engine data.</div>
      ) : (
        <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "1fr", gap: 12 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div style={{ border: "1px solid rgba(148,163,184,0.14)", borderRadius: 16, padding: 12, background: "rgba(2,6,23,0.30)" }}>
              <div style={{ fontWeight: 950, letterSpacing: 0.2 }}>Weekly batch totals</div>
              <div style={{ marginTop: 10, overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "separate", borderSpacing: 0 }}>
                  <thead>
                    <tr>
                      {["Week", "Pending", "Failed", "Sent"].map((h) => (
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
                    {data.weekly.length === 0 ? (
                      <tr>
                        <td colSpan={4} style={{ padding: 12, color: "rgba(226,232,240,0.65)" }}>
                          No data.
                        </td>
                      </tr>
                    ) : (
                      data.weekly.map((w) => (
                        <tr key={w.weekStart}>
                          <td style={tdStyle}>
                            <code>{w.weekStart}</code>
                          </td>
                          <td style={tdStyle}>{fmtMoney(w.pendingCents)}</td>
                          <td style={tdStyle}>{fmtMoney(w.failedCents)}</td>
                          <td style={tdStyle}>{fmtMoney(w.sentCents)}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <div style={{ border: "1px solid rgba(148,163,184,0.14)", borderRadius: 16, padding: 12, background: "rgba(2,6,23,0.30)" }}>
              <div style={{ fontWeight: 950, letterSpacing: 0.2 }}>Queue summary</div>
              <div style={{ marginTop: 10, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <div>
                  <div style={{ fontSize: 12, color: "rgba(226,232,240,0.65)", fontWeight: 900 }}>Pending</div>
                  <div style={{ marginTop: 6, fontSize: 18, fontWeight: 950 }}>{String(data.pending.length)}</div>
                </div>
                <div>
                  <div style={{ fontSize: 12, color: "rgba(226,232,240,0.65)", fontWeight: 900 }}>Failed</div>
                  <div style={{ marginTop: 6, fontSize: 18, fontWeight: 950 }}>{String(data.failed.length)}</div>
                </div>
              </div>
              <div style={{ marginTop: 10, color: "rgba(226,232,240,0.62)", fontSize: 12, lineHeight: 1.45 }}>
                Note: Retry is currently a dry-run preview to avoid changing Stripe behavior during the visibility-only phase.
              </div>
            </div>
          </div>

          <div style={{ border: "1px solid rgba(148,163,184,0.14)", borderRadius: 16, padding: 12, background: "rgba(2,6,23,0.30)" }}>
            <div style={{ fontWeight: 950, letterSpacing: 0.2 }}>Failed transfers</div>
            <div style={{ marginTop: 10, overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "separate", borderSpacing: 0 }}>
                <thead>
                  <tr>
                    {["When", "User", "Role", "Job", "Amount", "Method", "Status", "Stripe ref", "Retry"].map((h) => (
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
                  {data.failed.length === 0 ? (
                    <tr>
                      <td colSpan={9} style={{ padding: 12, color: "rgba(226,232,240,0.65)" }}>
                        No failed transfers.
                      </td>
                    </tr>
                  ) : (
                    data.failed.map((t) => (
                      <tr key={t.id}>
                        <td style={tdStyle}>{String(t.createdAt).slice(0, 19).replace("T", " ")}</td>
                        <td style={tdStyle}>
                          <a href={`/users/${encodeURIComponent(String(t.userId))}`} style={linkStyle}>
                            {t.user?.email ?? t.userId}
                          </a>
                        </td>
                        <td style={tdStyle}>{t.role}</td>
                        <td style={tdStyle}>
                          <a href={`/jobs/${encodeURIComponent(String(t.jobId))}`} style={linkStyle}>
                            {t.job?.title ?? t.jobId}
                          </a>
                        </td>
                        <td style={tdStyle}>{fmtMoney(t.amountCents)}</td>
                        <td style={tdStyle}>{t.method}</td>
                        <td style={tdStyle}>{pill(t.status, "red")}</td>
                        <td style={tdStyle}>{t.stripeTransferId ? <code>{t.stripeTransferId}</code> : "—"}</td>
                        <td style={tdStyle}>
                          <form action={retryTransfer}>
                            <input type="hidden" name="transferId" value={t.id} />
                            <button
                              type="submit"
                              style={{
                                background: "rgba(248,113,113,0.12)",
                                border: "1px solid rgba(248,113,113,0.35)",
                                color: "rgba(254,202,202,0.95)",
                                borderRadius: 12,
                                padding: "9px 12px",
                                fontSize: 13,
                                fontWeight: 950,
                                cursor: "pointer",
                                whiteSpace: "nowrap",
                              }}
                            >
                              Retry (preview)
                            </button>
                          </form>
                          {t.failureReason ? <div style={{ marginTop: 6, fontSize: 12, color: "rgba(254,202,202,0.85)" }}>{t.failureReason}</div> : null}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

