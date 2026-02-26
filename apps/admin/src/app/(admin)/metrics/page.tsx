"use client";

import { useCallback, useEffect, useState } from "react";

type MetricsData = {
  revenue: { monthCents: number; lifetimeCents: number };
  jobThroughput: { totalJobs: number; completedJobs: number };
  contractorActivation: { total: number; active: number };
  disputeRates: { total: number; open: number };
};

function money(cents: number) {
  return `$${(Number(cents || 0) / 100).toFixed(2)}`;
}

export default function MetricsPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<MetricsData | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const resp = await fetch("/api/admin/v4/metrics", { cache: "no-store" });
      const json = await resp.json().catch(() => null);
      if (!resp.ok || !json || json.ok !== true) {
        setError(String(json?.error?.message ?? json?.error ?? "Failed to load metrics"));
        return;
      }
      setData((json.data ?? null) as MetricsData | null);
    } catch {
      setError("Failed to load metrics");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div>
      <h1 style={{ margin: 0, fontSize: 22, fontWeight: 950 }}>Metrics</h1>
      <p style={{ marginTop: 8, color: "rgba(226,232,240,0.72)" }}>Revenue, throughput, activation, and dispute rate metrics from Admin V4.</p>

      {loading ? <div style={{ marginTop: 14 }}>Loading metrics...</div> : null}
      {error ? (
        <div style={{ marginTop: 14 }}>
          <div style={{ color: "rgba(254,202,202,0.95)", fontWeight: 900 }}>{error}</div>
          <button onClick={() => void load()} style={{ marginTop: 8 }}>Retry</button>
        </div>
      ) : null}
      {!loading && !error && !data ? <div style={{ marginTop: 14 }}>No metrics available.</div> : null}

      {!loading && !error && data ? (
        <div style={{ marginTop: 14, display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit,minmax(240px,1fr))" }}>
          <Card title="Revenue">
            <div>Month: {money(data.revenue.monthCents)}</div>
            <div>Lifetime: {money(data.revenue.lifetimeCents)}</div>
          </Card>
          <Card title="Job Throughput">
            <div>Total jobs: {data.jobThroughput.totalJobs}</div>
            <div>Completed jobs: {data.jobThroughput.completedJobs}</div>
          </Card>
          <Card title="Contractor Activation">
            <div>Total contractors: {data.contractorActivation.total}</div>
            <div>Active contractors: {data.contractorActivation.active}</div>
          </Card>
          <Card title="Dispute Rates">
            <div>Total disputes: {data.disputeRates.total}</div>
            <div>Open disputes: {data.disputeRates.open}</div>
          </Card>
        </div>
      ) : null}
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ border: "1px solid rgba(148,163,184,0.2)", borderRadius: 14, padding: 12, background: "rgba(2,6,23,0.3)" }}>
      <div style={{ fontWeight: 900, marginBottom: 8 }}>{title}</div>
      <div style={{ color: "rgba(226,232,240,0.9)", fontSize: 14, display: "grid", gap: 6 }}>{children}</div>
    </div>
  );
}
