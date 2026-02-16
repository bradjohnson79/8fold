import { adminApiFetch } from "@/server/adminApi";
import { redirect } from "next/navigation";

type PayoutRequestRow = {
  id: string;
  createdAt: string;
  status: "REQUESTED" | "REJECTED" | "PAID" | "CANCELLED";
  userId: string;
  amountCents: number;
  payoutId: string | null;
  user: { id: string; email: string | null; role: string };
  payout: null | {
    id: string;
    paidAt: string | null;
    externalReference: string | null;
    notesInternal: string | null;
    status: string;
  };
};

type PayoutHistoryItem = {
  id: string;
  createdAt: string;
  status: string;
  userId: string;
  amountCents: number;
  payoutId: string | null;
  user: { id: string; email: string | null; role: string };
  payout: null | {
    id: string;
    createdAt: string;
    paidAt: string | null;
    status: string;
    provider: string | null;
    currency: string | null;
    amountCents: number | null;
    externalReference: string | null;
    notesInternal: string | null;
    failureReason: string | null;
  };
};

type StripeRecon = {
  window: { days: number; since: string };
  payments: { lifetime: any; window: any };
  ledger: { lifetime: any; window: any };
  payoutRequests: { lifetime: any; window: any };
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
const dangerButtonStyle: React.CSSProperties = {
  background: "rgba(248,113,113,0.12)",
  border: "1px solid rgba(248,113,113,0.35)",
  color: "rgba(254,202,202,0.95)",
  borderRadius: 12,
  padding: "9px 12px",
  fontSize: 13,
  fontWeight: 950,
  cursor: "pointer",
  whiteSpace: "nowrap",
};
const tdStyle: React.CSSProperties = {
  padding: "10px 10px",
  borderBottom: "1px solid rgba(148,163,184,0.10)",
  verticalAlign: "top",
  color: "rgba(226,232,240,0.86)",
  fontSize: 13,
};
const linkStyle: React.CSSProperties = { color: "rgba(56,189,248,0.95)", textDecoration: "none", fontWeight: 900 };

function Card({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        border: "1px solid rgba(148,163,184,0.14)",
        borderRadius: 16,
        padding: 12,
        background: "rgba(2,6,23,0.30)",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "baseline" }}>
        <div>
          <div style={{ fontWeight: 950, letterSpacing: 0.2 }}>{title}</div>
          {subtitle ? <div style={{ marginTop: 4, color: "rgba(226,232,240,0.65)", fontSize: 12 }}>{subtitle}</div> : null}
        </div>
      </div>
      <div style={{ marginTop: 10 }}>{children}</div>
    </div>
  );
}

export default async function PayoutsPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = (await searchParams) ?? {};
  const get = (k: string) => String(Array.isArray((sp as any)[k]) ? (sp as any)[k][0] : (sp as any)[k] ?? "").trim();

  const status = (get("status") || "REQUESTED") as any;
  const role = get("role"); // client-side filter of payout-requests list
  const days = get("days") || "30";
  const banner = get("banner");

  async function markPaid(formData: FormData) {
    "use server";
    const id = String(formData.get("payoutRequestId") ?? "").trim();
    const externalReference = String(formData.get("externalReference") ?? "").trim();
    const notesInternal = String(formData.get("notesInternal") ?? "").trim();
    if (!id) redirect(`/payouts${qs({ status, role, days, banner: "missing_payout_request_id" })}`);

    try {
      await adminApiFetch<{ payoutRequest: any; payout: any }>(`/api/admin/payout-requests/${encodeURIComponent(id)}/mark-paid`, {
        method: "POST",
        body: JSON.stringify({
          externalReference: externalReference || undefined,
          notesInternal: notesInternal || undefined,
        }),
      });
      redirect(`/payouts${qs({ status, role, days, banner: "marked_paid" })}`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "mark_paid_failed";
      redirect(`/payouts${qs({ status, role, days, banner: `mark_paid_failed:${msg}` })}`);
    }
  }

  async function createAdjustment(formData: FormData) {
    "use server";
    const userId = String(formData.get("userId") ?? "").trim();
    const direction = String(formData.get("direction") ?? "").trim();
    const bucket = String(formData.get("bucket") ?? "").trim();
    const amount = String(formData.get("amount") ?? "").trim();
    const memo = String(formData.get("memo") ?? "").trim();

    const amountNum = Number(amount);
    const cents = Number.isFinite(amountNum) ? Math.round(amountNum * 100) : NaN;

    if (!userId || !direction || !bucket || !Number.isFinite(cents) || cents <= 0) {
      redirect(`/payouts${qs({ status, role, days, banner: "invalid_adjustment_input" })}`);
    }

    try {
      await adminApiFetch(`/api/admin/finance/adjustments`, {
        method: "POST",
        body: JSON.stringify({
          userId,
          direction,
          bucket,
          amountCents: cents,
          memo: memo || undefined,
        }),
      });
      redirect(`/payouts${qs({ status, role, days, banner: "adjustment_created" })}`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "adjustment_failed";
      redirect(`/payouts${qs({ status, role, days, banner: `adjustment_failed:${msg}` })}`);
    }
  }

  let payoutRequestsRows: PayoutRequestRow[] = [];
  let contractorPaid: PayoutHistoryItem[] = [];
  let routerPaid: PayoutHistoryItem[] = [];
  let recon: StripeRecon | null = null;
  let err: string | null = null;

  try {
    const [pr, phC, phR, sr] = await Promise.all([
      adminApiFetch<{ payoutRequests: PayoutRequestRow[] }>(`/api/admin/payout-requests${qs({ status })}`).then((d) => d.payoutRequests ?? []),
      adminApiFetch<{ items: PayoutHistoryItem[] }>(`/api/admin/finance/payout-history${qs({ role: "CONTRACTOR", status: "PAID", take: "60" })}`).then(
        (d) => d.items ?? [],
      ),
      adminApiFetch<{ items: PayoutHistoryItem[] }>(`/api/admin/finance/payout-history${qs({ role: "ROUTER", status: "PAID", take: "60" })}`).then(
        (d) => d.items ?? [],
      ),
      adminApiFetch<StripeRecon>(`/api/admin/finance/stripe-reconciliation${qs({ days })}`),
    ]);
    payoutRequestsRows = pr;
    contractorPaid = phC;
    routerPaid = phR;
    recon = sr;
  } catch (e) {
    err = e instanceof Error ? e.message : "Failed to load finance data";
  }

  const filteredPayoutRequests = role ? payoutRequestsRows.filter((r) => String(r.user?.role) === role) : payoutRequestsRows;

  const statusTone = (s: string) =>
    s === "PAID" ? "green" : s === "REQUESTED" ? "amber" : s === "REJECTED" || s === "CANCELLED" ? "red" : "slate";

  return (
    <div>
      <h1 style={{ margin: 0, fontSize: 22, fontWeight: 950, letterSpacing: 0.2 }}>Financial Controls</h1>
      <p style={{ marginTop: 8, color: "rgba(226,232,240,0.72)", maxWidth: 980 }}>
        Payout requests, payout history, Stripe reconciliation, and manual ledger adjustments.
      </p>

      {banner ? (
        <div
          style={{
            marginTop: 10,
            fontWeight: 900,
            color: banner.includes("failed") ? "rgba(254,202,202,0.95)" : "rgba(134,239,172,0.95)",
          }}
        >
          {banner}
        </div>
      ) : null}
      {err ? <div style={{ marginTop: 10, color: "rgba(254,202,202,0.95)", fontWeight: 900 }}>{err}</div> : null}

      <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "1.15fr 0.85fr", gap: 12, alignItems: "start" }}>
        <Card title="Payout requests" subtitle="Review + mark paid. Filter is server-side by status. Role filter is client-side.">
          <form method="GET" style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
            <select name="status" defaultValue={status} style={selectStyle} aria-label="Payout request status">
              <option value="REQUESTED">REQUESTED</option>
              <option value="PAID">PAID</option>
              <option value="REJECTED">REJECTED</option>
              <option value="CANCELLED">CANCELLED</option>
            </select>
            <select name="role" defaultValue={role} style={selectStyle} aria-label="Role">
              <option value="">All roles</option>
              <option value="ADMIN">ADMIN</option>
              <option value="CONTRACTOR">CONTRACTOR</option>
              <option value="JOB_POSTER">JOB_POSTER</option>
              <option value="ROUTER">ROUTER</option>
            </select>
            <input name="days" defaultValue={days} style={{ ...inputStyle, minWidth: 120 }} placeholder="Recon days" />
            <button type="submit" style={buttonStyle}>
              Apply
            </button>
          </form>

          <div style={{ marginTop: 10, overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "separate", borderSpacing: 0 }}>
              <thead>
                <tr>
                  {["Request", "User", "Status", "Amount", "Paid", "Action"].map((h) => (
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
                {filteredPayoutRequests.length === 0 ? (
                  <tr>
                    <td colSpan={6} style={{ padding: 12, color: "rgba(226,232,240,0.65)" }}>
                      No results.
                    </td>
                  </tr>
                ) : (
                  filteredPayoutRequests.slice(0, 200).map((r) => (
                    <tr key={r.id}>
                      <td style={tdStyle}>
                        <code>{r.id}</code>
                        <div style={{ marginTop: 4, color: "rgba(226,232,240,0.55)", fontSize: 12 }}>{String(r.createdAt).slice(0, 10)}</div>
                      </td>
                      <td style={tdStyle}>
                        <a href={`/users/${encodeURIComponent(r.userId)}`} style={linkStyle}>
                          {r.user?.email ?? r.userId}
                        </a>
                        <div style={{ marginTop: 4, color: "rgba(226,232,240,0.55)", fontSize: 12 }}>{r.user?.role ?? "—"}</div>
                      </td>
                      <td style={tdStyle}>{pill(String(r.status), statusTone(String(r.status)) as any)}</td>
                      <td style={tdStyle}>{fmtMoney(r.amountCents)}</td>
                      <td style={tdStyle}>{r.payout?.paidAt ? String(r.payout.paidAt).slice(0, 10) : "—"}</td>
                      <td style={tdStyle}>
                        {r.status === "REQUESTED" ? (
                          <form action={markPaid} style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                            <input type="hidden" name="payoutRequestId" value={r.id} />
                            <input name="externalReference" placeholder="External ref (optional)" style={{ ...inputStyle, minWidth: 200 }} />
                            <input name="notesInternal" placeholder="Internal notes (optional)" style={{ ...inputStyle, minWidth: 220 }} />
                            <button type="submit" style={dangerButtonStyle}>
                              Mark paid
                            </button>
                          </form>
                        ) : (
                          <span style={{ color: "rgba(226,232,240,0.65)" }}>—</span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Card>

        <Card title="Manual adjustments" subtitle="Creates an ADJUSTMENT ledger entry (append-only).">
          <form action={createAdjustment} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <input name="userId" placeholder="User ID" style={inputStyle} />
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <select name="direction" defaultValue="CREDIT" style={selectStyle} aria-label="Direction">
                <option value="CREDIT">CREDIT</option>
                <option value="DEBIT">DEBIT</option>
              </select>
              <select name="bucket" defaultValue="AVAILABLE" style={selectStyle} aria-label="Bucket">
                <option value="AVAILABLE">AVAILABLE</option>
                <option value="HELD">HELD</option>
                <option value="PENDING">PENDING</option>
                <option value="PAID">PAID</option>
              </select>
              <input name="amount" placeholder="Amount (e.g. 25.00)" style={{ ...inputStyle, minWidth: 180 }} />
            </div>
            <input name="memo" placeholder="Memo (optional)" style={{ ...inputStyle, minWidth: 320 }} />
            <div>
              <button type="submit" style={dangerButtonStyle}>
                Create adjustment
              </button>
            </div>
            <div style={{ color: "rgba(226,232,240,0.62)", fontSize: 12, lineHeight: 1.45 }}>
              Note: AVAILABLE debit is blocked if it would take the wallet negative.
            </div>
          </form>
        </Card>
      </div>

      <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, alignItems: "start" }}>
        <Card title="Contractor payout history" subtitle="Last 60 PAID payout requests (role = CONTRACTOR)">
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "separate", borderSpacing: 0 }}>
              <thead>
                <tr>
                  {["When", "User", "Amount", "External ref"].map((h) => (
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
                {contractorPaid.length === 0 ? (
                  <tr>
                    <td colSpan={4} style={{ padding: 12, color: "rgba(226,232,240,0.65)" }}>
                      No results.
                    </td>
                  </tr>
                ) : (
                  contractorPaid.map((r) => (
                    <tr key={r.id}>
                      <td style={tdStyle}>{String(r.createdAt).slice(0, 10)}</td>
                      <td style={tdStyle}>
                        <a href={`/users/${encodeURIComponent(r.userId)}`} style={linkStyle}>
                          {r.user?.email ?? r.userId}
                        </a>
                      </td>
                      <td style={tdStyle}>{fmtMoney(r.amountCents)}</td>
                      <td style={tdStyle}>{r.payout?.externalReference ?? "—"}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Card>

        <Card title="Router payout history" subtitle="Last 60 PAID payout requests (role = ROUTER)">
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "separate", borderSpacing: 0 }}>
              <thead>
                <tr>
                  {["When", "User", "Amount", "External ref"].map((h) => (
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
                {routerPaid.length === 0 ? (
                  <tr>
                    <td colSpan={4} style={{ padding: 12, color: "rgba(226,232,240,0.65)" }}>
                      No results.
                    </td>
                  </tr>
                ) : (
                  routerPaid.map((r) => (
                    <tr key={r.id}>
                      <td style={tdStyle}>{String(r.createdAt).slice(0, 10)}</td>
                      <td style={tdStyle}>
                        <a href={`/users/${encodeURIComponent(r.userId)}`} style={linkStyle}>
                          {r.user?.email ?? r.userId}
                        </a>
                      </td>
                      <td style={tdStyle}>{fmtMoney(r.amountCents)}</td>
                      <td style={tdStyle}>{r.payout?.externalReference ?? "—"}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      <div style={{ marginTop: 12 }}>
        <Card title="Stripe reconciliation" subtitle={`Snapshot: lifetime + last ${days} days (derived from JobPayment, LedgerEntry, and PayoutRequest).`}>
          {recon ? (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
              <div style={{ padding: 10, borderRadius: 14, border: "1px solid rgba(148,163,184,0.12)", background: "rgba(2,6,23,0.22)" }}>
                <div style={{ fontSize: 12, color: "rgba(226,232,240,0.65)", fontWeight: 900 }}>Payments captured</div>
                <div style={{ marginTop: 6, fontSize: 18, fontWeight: 950 }}>{fmtMoney((recon.payments?.window?.capturedCents as any) ?? 0)}</div>
                <div style={{ marginTop: 4, fontSize: 12, color: "rgba(226,232,240,0.60)" }}>
                  lifetime {fmtMoney((recon.payments?.lifetime?.capturedCents as any) ?? 0)}
                </div>
              </div>

              <div style={{ padding: 10, borderRadius: 14, border: "1px solid rgba(148,163,184,0.12)", background: "rgba(2,6,23,0.22)" }}>
                <div style={{ fontSize: 12, color: "rgba(226,232,240,0.65)", fontWeight: 900 }}>Payout requests paid</div>
                <div style={{ marginTop: 6, fontSize: 18, fontWeight: 950 }}>{fmtMoney((recon.payoutRequests?.window?.paidCents as any) ?? 0)}</div>
                <div style={{ marginTop: 4, fontSize: 12, color: "rgba(226,232,240,0.60)" }}>
                  open requested {fmtMoney((recon.payoutRequests?.window?.requestedOpenCents as any) ?? 0)}
                </div>
              </div>

              <div style={{ padding: 10, borderRadius: 14, border: "1px solid rgba(148,163,184,0.12)", background: "rgba(2,6,23,0.22)" }}>
                <div style={{ fontSize: 12, color: "rgba(226,232,240,0.65)", fontWeight: 900 }}>Ledger payout movement</div>
                <div style={{ marginTop: 6, fontSize: 18, fontWeight: 950 }}>
                  {fmtMoney((recon.ledger?.window?.payoutDebitAvailableCents as any) ?? 0)}
                </div>
                <div style={{ marginTop: 4, fontSize: 12, color: "rgba(226,232,240,0.60)" }}>
                  credit-to-paid {fmtMoney((recon.ledger?.window?.payoutCreditPaidCents as any) ?? 0)}
                </div>
              </div>
            </div>
          ) : (
            <div style={{ color: "rgba(226,232,240,0.70)" }}>No reconciliation data.</div>
          )}

          {recon ? (
            <div style={{ marginTop: 10, color: "rgba(226,232,240,0.65)", fontSize: 12, lineHeight: 1.45 }}>
              Window starts at <code>{String(recon.window?.since).slice(0, 10)}</code>. Reconciliation here is an operational snapshot; deeper audits can be added to
              compare per-job escrow fund/release entries vs JobPayment state.
            </div>
          ) : null}
        </Card>
      </div>
    </div>
  );
}

