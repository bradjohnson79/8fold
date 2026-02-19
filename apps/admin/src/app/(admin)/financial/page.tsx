import { adminApiFetch } from "@/server/adminApi";

type FinancialOverview = {
  window: { days: number; since: string };
  platformRevenue: { lifetimeCents: number; windowCents: number };
  contractorEarnings: { lifetimeCents: number; windowCents: number };
  routerEarnings: { lifetimeCents: number; windowCents: number };
  expressRevenue: { lifetimeCents: number; windowCents: number; jobCountLifetime: number; jobCountWindow: number };
  escrow: { heldCents: number; pendingReleaseCount: number; pendingReleaseCents: number };
  transfers: { failedCountLifetime: number; failedCountWindow: number };
  disputes: { disputedJobCount: number; disputedJobCents: number };
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

export default async function FinancialOverviewPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = (await searchParams) ?? {};
  const get = (k: string) => String(Array.isArray((sp as any)[k]) ? (sp as any)[k][0] : (sp as any)[k] ?? "").trim();
  const days = get("days") || "30";

  const data = await adminApiFetch<FinancialOverview>(`/api/admin/financial/overview${qs({ days })}`).catch(() => null);

  return (
    <div>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 950, letterSpacing: 0.2 }}>Financial Overview</h1>
        <form method="GET" style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <input
            name="days"
            defaultValue={days}
            placeholder="Days (window)"
            style={{
              background: "rgba(2,6,23,0.35)",
              border: "1px solid rgba(148,163,184,0.14)",
              color: "rgba(226,232,240,0.92)",
              borderRadius: 12,
              padding: "9px 10px",
              fontSize: 13,
              width: 120,
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
        Platform-grade snapshot derived from DB ledger + escrow + transfer records. All values are read-only.
      </p>

      {!data ? (
        <div style={{ marginTop: 10, color: "rgba(254,202,202,0.95)", fontWeight: 900 }}>Failed to load financial overview.</div>
      ) : (
        <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <Card title="Platform revenue">
            <div style={{ fontSize: 18, fontWeight: 950 }}>{fmtMoney(data.platformRevenue.windowCents)} (window)</div>
            <div style={{ marginTop: 4, color: "rgba(226,232,240,0.65)", fontSize: 12 }}>
              lifetime {fmtMoney(data.platformRevenue.lifetimeCents)}
            </div>
          </Card>

          <Card title="Contractor earnings">
            <div style={{ fontSize: 18, fontWeight: 950 }}>{fmtMoney(data.contractorEarnings.windowCents)} (window)</div>
            <div style={{ marginTop: 4, color: "rgba(226,232,240,0.65)", fontSize: 12 }}>
              lifetime {fmtMoney(data.contractorEarnings.lifetimeCents)}
            </div>
          </Card>

          <Card title="Router earnings">
            <div style={{ fontSize: 18, fontWeight: 950 }}>{fmtMoney(data.routerEarnings.windowCents)} (window)</div>
            <div style={{ marginTop: 4, color: "rgba(226,232,240,0.65)", fontSize: 12 }}>
              lifetime {fmtMoney(data.routerEarnings.lifetimeCents)}
            </div>
          </Card>

          <Card title="Express revenue">
            <div style={{ fontSize: 18, fontWeight: 950 }}>{fmtMoney(data.expressRevenue.windowCents)} (window)</div>
            <div style={{ marginTop: 4, color: "rgba(226,232,240,0.65)", fontSize: 12 }}>
              jobs {data.expressRevenue.jobCountWindow} • lifetime {fmtMoney(data.expressRevenue.lifetimeCents)} ({data.expressRevenue.jobCountLifetime} jobs)
            </div>
          </Card>

          <Card title="Escrow (held)">
            <div style={{ fontSize: 18, fontWeight: 950 }}>{fmtMoney(data.escrow.heldCents)}</div>
            <div style={{ marginTop: 4, color: "rgba(226,232,240,0.65)", fontSize: 12 }}>
              pending releases: {data.escrow.pendingReleaseCount} ({fmtMoney(data.escrow.pendingReleaseCents)})
            </div>
          </Card>

          <Card title="Risk / exceptions">
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <div>
                <div style={{ fontSize: 12, color: "rgba(226,232,240,0.65)", fontWeight: 900 }}>Failed transfers</div>
                <div style={{ marginTop: 6, fontSize: 16, fontWeight: 950 }}>{String(data.transfers.failedCountWindow)}</div>
                <div style={{ marginTop: 4, fontSize: 12, color: "rgba(226,232,240,0.60)" }}>
                  lifetime {String(data.transfers.failedCountLifetime)}
                </div>
              </div>
              <div>
                <div style={{ fontSize: 12, color: "rgba(226,232,240,0.65)", fontWeight: 900 }}>Disputed jobs</div>
                <div style={{ marginTop: 6, fontSize: 16, fontWeight: 950 }}>{String(data.disputes.disputedJobCount)}</div>
                <div style={{ marginTop: 4, fontSize: 12, color: "rgba(226,232,240,0.60)" }}>{fmtMoney(data.disputes.disputedJobCents)} impacted</div>
              </div>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}

