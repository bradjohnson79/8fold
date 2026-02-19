import { adminApiFetch } from "@/server/adminApi";

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

type ReconPayload = {
  window: { days: number; since: string };
  payments: { lifetime: any; window: any };
  ledger: { lifetime: any; window: any };
  payoutRequests: { lifetime: any; window: any };
  transfers?: { lifetime: any; window: any };
  stripe?: { balance: any | null };
  varianceCents: number;
  warning: boolean;
};

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div
      style={{
        border: "1px solid rgba(148,163,184,0.14)",
        borderRadius: 16,
        padding: 12,
        background: "rgba(2,6,23,0.30)",
      }}
    >
      <div style={{ fontWeight: 950, letterSpacing: 0.2 }}>{title}</div>
      <div style={{ marginTop: 10 }}>{children}</div>
    </div>
  );
}

export default async function FinancialReconciliationPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = (await searchParams) ?? {};
  const get = (k: string) => String(Array.isArray((sp as any)[k]) ? (sp as any)[k][0] : (sp as any)[k] ?? "").trim();
  const days = get("days") || "30";

  const payload = await adminApiFetch<ReconPayload>(`/api/admin/financial/reconciliation${qs({ days })}`).catch(() => null);

  return (
    <div>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 950, letterSpacing: 0.2 }}>Stripe Reconciliation</h1>
        <form method="GET" style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <input
            name="days"
            defaultValue={days}
            placeholder="Days"
            style={{
              background: "rgba(2,6,23,0.35)",
              border: "1px solid rgba(148,163,184,0.14)",
              color: "rgba(226,232,240,0.92)",
              borderRadius: 12,
              padding: "9px 10px",
              fontSize: 13,
              width: 110,
            }}
          />
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
      </div>
      <p style={{ marginTop: 8, color: "rgba(226,232,240,0.72)", maxWidth: 980 }}>
        Matches Stripe balance snapshot vs internal ledger aggregates. Warning badge appears if variance exceeds $1.
      </p>

      {!payload ? (
        <div style={{ marginTop: 10, color: "rgba(254,202,202,0.95)", fontWeight: 900 }}>Failed to load reconciliation.</div>
      ) : (
        <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
          <Card title="Variance">
            <div style={{ fontSize: 18, fontWeight: 950, color: payload.warning ? "rgba(254,202,202,0.95)" : "rgba(134,239,172,0.95)" }}>
              {fmtMoney(payload.varianceCents)}
            </div>
            <div style={{ marginTop: 4, fontSize: 12, color: "rgba(226,232,240,0.65)" }}>{payload.warning ? "⚠️ mismatch > $1" : "OK"}</div>
          </Card>

          <Card title="Payments captured (window)">
            <div style={{ fontSize: 18, fontWeight: 950 }}>{fmtMoney((payload as any).payments?.window?.capturedCents ?? 0)}</div>
            <div style={{ marginTop: 4, fontSize: 12, color: "rgba(226,232,240,0.65)" }}>
              refunded {fmtMoney((payload as any).payments?.window?.refundedCents ?? 0)}
            </div>
          </Card>

          <Card title="Platform retained (window)">
            <div style={{ fontSize: 18, fontWeight: 950 }}>{fmtMoney((payload as any).transfers?.window?.platformRetainedCents ?? 0)}</div>
            <div style={{ marginTop: 4, fontSize: 12, color: "rgba(226,232,240,0.65)" }}>
              failed transfers {String((payload as any).transfers?.window?.failedCount ?? 0)}
            </div>
          </Card>

          <Card title="Stripe balance snapshot">
            <pre
              style={{
                margin: 0,
                padding: 10,
                borderRadius: 12,
                border: "1px solid rgba(148,163,184,0.14)",
                background: "rgba(2,6,23,0.25)",
                overflowX: "auto",
                fontSize: 12,
                color: "rgba(226,232,240,0.86)",
              }}
            >
              {JSON.stringify((payload as any).stripe?.balance ?? null, null, 2)}
            </pre>
          </Card>

          <Card title="Internal ledger (window)">
            <pre
              style={{
                margin: 0,
                padding: 10,
                borderRadius: 12,
                border: "1px solid rgba(148,163,184,0.14)",
                background: "rgba(2,6,23,0.25)",
                overflowX: "auto",
                fontSize: 12,
                color: "rgba(226,232,240,0.86)",
              }}
            >
              {JSON.stringify((payload as any).ledger?.window ?? null, null, 2)}
            </pre>
          </Card>

          <Card title="Last webhook timestamp / failures">
            <div style={{ color: "rgba(226,232,240,0.70)", fontSize: 12 }}>
              Not yet wired to Stripe webhook event table in this UI. Add when platform monitoring is formalized.
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}

