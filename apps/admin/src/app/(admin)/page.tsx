import { adminApiFetch } from "@/server/adminApiV4";
import OverviewCardsClient, { type OverviewCardsPayload } from "./OverviewCardsClient";
import CompactSystemStatus from "./CompactSystemStatus";

type Overview = {
  totalJobs: number;
  openJobs: number;
  activeAssignments: number;
  pendingPayouts: number;
  openDisputes: number;
  openSupportTickets: number;
  stripeRevenueMonth: number;
  stripeRevenueLifetime: number;
  integrityAlerts: number;
};

function money(cents: number) {
  return `$${(Number(cents || 0) / 100).toFixed(2)}`;
}

export default async function OverviewPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = (await searchParams) ?? {};
  const params = new URLSearchParams();
  for (const [key, rawValue] of Object.entries(sp)) {
    const value = String(Array.isArray(rawValue) ? rawValue[0] : rawValue ?? "").trim();
    if (!value) continue;
    params.set(key, value);
  }
  const cardsQuery = params.toString();

  const [overview, cardsPayload] = await Promise.all([
    adminApiFetch<Overview>("/api/admin/v4/overview").catch(() => null),
    adminApiFetch<OverviewCardsPayload>(`/api/admin/v4/overview/cards${cardsQuery ? `?${cardsQuery}` : ""}`).catch(() => null),
  ]);

  return (
    <div>
      <h1 style={{ margin: 0, fontSize: 22, fontWeight: 950 }}>Overview</h1>
      <p style={{ marginTop: 8, color: "rgba(226,232,240,0.72)" }}>Admin V4 Command Center.</p>

      {!overview ? (
        <div style={{ marginTop: 14, color: "rgba(254,202,202,0.95)", fontWeight: 900 }}>Failed to load overview metrics.</div>
      ) : null}

      {overview ? (
        <div style={{ marginTop: 14, display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))" }}>
          <Card title="Total Jobs" value={String(overview.totalJobs)} />
          <Card title="Open Jobs" value={String(overview.openJobs)} />
          <Card title="Active Assignments" value={String(overview.activeAssignments)} />
          <Card title="Pending Payouts" value={String(overview.pendingPayouts)} />
          <Card title="Open Disputes" value={String(overview.openDisputes)} />
          <Card title="Open Support" value={String(overview.openSupportTickets)} />
          <Card title="Revenue Month" value={money(overview.stripeRevenueMonth)} />
          <Card title="Revenue Lifetime" value={money(overview.stripeRevenueLifetime)} />
          <Card title="Integrity Alerts" value={String(overview.integrityAlerts)} />
        </div>
      ) : null}

      <CompactSystemStatus />

      <OverviewCardsClient payload={cardsPayload} />
    </div>
  );
}

function Card({ title, value }: { title: string; value: string }) {
  return (
    <div style={{ border: "1px solid rgba(148,163,184,0.2)", borderRadius: 14, padding: 12, background: "rgba(2,6,23,0.3)" }}>
      <div style={{ color: "rgba(226,232,240,0.65)", fontSize: 12, fontWeight: 900 }}>{title}</div>
      <div style={{ marginTop: 4, color: "rgba(226,232,240,0.95)", fontSize: 22, fontWeight: 950 }}>{value}</div>
    </div>
  );
}
