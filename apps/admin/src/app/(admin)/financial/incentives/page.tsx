import { adminApiFetch } from "@/server/adminApi";

type IncentiveRow = {
  contractorUserId: string;
  contractorEmail: string | null;
  expressJobsCompleted: number;
  consecutiveCleanCount: number;
  bonusEligibilityProgress: string;
  nextEligibleBonusPayoutDate: string | null;
  bonusPaid: boolean;
};

export default async function FinancialIncentivesPage() {
  const payload = await adminApiFetch<{ rows: IncentiveRow[] }>(`/api/admin/financial/incentives?take=500`).catch(() => ({ rows: [] }));

  const rows = payload.rows ?? [];

  return (
    <div>
      <h1 style={{ margin: 0, fontSize: 22, fontWeight: 950, letterSpacing: 0.2 }}>Incentives (Express)</h1>
      <p style={{ marginTop: 8, color: "rgba(226,232,240,0.72)", maxWidth: 980 }}>
        Read-only incentive tracking derived from Express job completion history. No payouts are executed here.
      </p>

      <div style={{ marginTop: 12, overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "separate", borderSpacing: 0 }}>
          <thead>
            <tr>
              {["Contractor", "Express completed", "Consecutive clean", "Progress", "Next eligible", "Bonus paid"].map((h) => (
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
                <td colSpan={6} style={{ padding: 12, color: "rgba(226,232,240,0.65)" }}>
                  No results.
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={r.contractorUserId}>
                  <td style={{ padding: "10px 10px", borderBottom: "1px solid rgba(148,163,184,0.10)" }}>
                    <a
                      href={`/users/${encodeURIComponent(r.contractorUserId)}`}
                      style={{ color: "rgba(56,189,248,0.95)", textDecoration: "none", fontWeight: 900 }}
                    >
                      {r.contractorEmail ?? r.contractorUserId}
                    </a>
                  </td>
                  <td style={{ padding: "10px 10px", borderBottom: "1px solid rgba(148,163,184,0.10)" }}>{String(r.expressJobsCompleted)}</td>
                  <td style={{ padding: "10px 10px", borderBottom: "1px solid rgba(148,163,184,0.10)" }}>{String(r.consecutiveCleanCount)}</td>
                  <td style={{ padding: "10px 10px", borderBottom: "1px solid rgba(148,163,184,0.10)" }}>
                    <code>{r.bonusEligibilityProgress}</code>
                  </td>
                  <td style={{ padding: "10px 10px", borderBottom: "1px solid rgba(148,163,184,0.10)" }}>
                    {r.nextEligibleBonusPayoutDate ? String(r.nextEligibleBonusPayoutDate).slice(0, 10) : "—"}
                  </td>
                  <td style={{ padding: "10px 10px", borderBottom: "1px solid rgba(148,163,184,0.10)" }}>{r.bonusPaid ? "yes" : "no"}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div style={{ marginTop: 10, color: "rgba(226,232,240,0.62)", fontSize: 12, lineHeight: 1.45 }}>
        Note: "consecutive clean" is currently computed as the streak of recent Express jobs that are not DISPUTED. If Express penalties/strike models are added, this
        should be upgraded to use those signals.
      </div>
    </div>
  );
}

