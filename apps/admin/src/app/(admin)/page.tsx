import Link from "next/link";
import { adminApiFetch } from "@/server/adminApiV4";

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

type JobRow = {
  id: string;
  title: string;
  status: string;
  country: string;
  province: string | null;
  city: string | null;
  trade: string;
  createdAt: string;
};

function money(cents: number) {
  return `$${(Number(cents || 0) / 100).toFixed(2)}`;
}

export default async function OverviewPage() {
  const [overview, jobs, disputes, support] = await Promise.all([
    adminApiFetch<Overview>("/api/admin/v4/overview").catch(() => null),
    adminApiFetch<{ jobs: JobRow[] }>("/api/admin/v4/jobs?limit=8").then((r) => r.jobs ?? []).catch(() => []),
    adminApiFetch<{ disputes: Array<{ id: string; status: string; disputeReason: string }> }>("/api/admin/v4/disputes?take=6")
      .then((r) => r.disputes ?? [])
      .catch(() => []),
    adminApiFetch<{ tickets: Array<{ id: string; status: string; priority: string; subject: string }> }>("/api/admin/v4/support/tickets?take=6")
      .then((r) => r.tickets ?? [])
      .catch(() => []),
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

      <div style={{ marginTop: 18, display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit,minmax(300px,1fr))" }}>
        <section style={panelStyle}>
          <div style={panelTitle}>Latest Jobs</div>
          {jobs.length === 0 ? <div style={emptyStyle}>No jobs found.</div> : null}
          {jobs.map((j) => (
            <div key={j.id} style={rowStyle}>
              <Link href={`/jobs/${encodeURIComponent(j.id)}`} style={linkStyle}>{j.title || j.id}</Link>
              <div style={metaStyle}>{j.status} · {j.trade} · {j.country}/{j.province || "-"}</div>
            </div>
          ))}
        </section>

        <section style={panelStyle}>
          <div style={panelTitle}>Open Disputes</div>
          {disputes.length === 0 ? <div style={emptyStyle}>No disputes.</div> : null}
          {disputes.map((d) => (
            <div key={d.id} style={rowStyle}>
              <Link href={`/disputes/${encodeURIComponent(d.id)}`} style={linkStyle}>{d.id}</Link>
              <div style={metaStyle}>{d.status} · {d.disputeReason}</div>
            </div>
          ))}
        </section>

        <section style={panelStyle}>
          <div style={panelTitle}>Open Support Tickets</div>
          {support.length === 0 ? <div style={emptyStyle}>No tickets.</div> : null}
          {support.map((t) => (
            <div key={t.id} style={rowStyle}>
              <Link href={`/support/${encodeURIComponent(t.id)}`} style={linkStyle}>{t.subject || t.id}</Link>
              <div style={metaStyle}>{t.status} · {t.priority}</div>
            </div>
          ))}
        </section>
      </div>
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

const panelStyle: React.CSSProperties = {
  border: "1px solid rgba(148,163,184,0.2)",
  borderRadius: 14,
  padding: 12,
  background: "rgba(2,6,23,0.3)",
};
const panelTitle: React.CSSProperties = { fontWeight: 900, marginBottom: 10 };
const rowStyle: React.CSSProperties = { padding: "8px 0", borderBottom: "1px solid rgba(148,163,184,0.1)" };
const emptyStyle: React.CSSProperties = { color: "rgba(226,232,240,0.72)", fontSize: 13 };
const metaStyle: React.CSSProperties = { color: "rgba(226,232,240,0.65)", fontSize: 12, marginTop: 4 };
const linkStyle: React.CSSProperties = { color: "rgba(125,211,252,0.95)", textDecoration: "none", fontWeight: 900 };
