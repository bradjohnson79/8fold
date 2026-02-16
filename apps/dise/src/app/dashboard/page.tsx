"use client";

import { useEffect, useState } from "react";
import { diseFetch } from "@/lib/api";

type DashboardData = {
  totalDirectories: number;
  pendingReview: number;
  submissionsReady: number;
  approvedBacklinks: number;
};

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    diseFetch<{ data: DashboardData }>("/api/dise/dashboard")
      .then((r) => {
        if (r.ok && r.data) setData((r.data as { data: DashboardData }).data);
        else setErr(r.error ?? "Failed to load");
      })
      .catch((e) => setErr(String(e)));
  }, []);

  if (err) return <p style={{ color: "#f87171" }}>{err}</p>;
  if (!data) return <p>Loading…</p>;

  return (
    <div>
      <h1 style={{ marginBottom: "1.5rem" }}>Dashboard</h1>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: "1rem" }}>
        <Card title="Total Directories" value={data.totalDirectories} />
        <Card title="Pending Review" value={data.pendingReview} />
        <Card title="Submissions Ready" value={data.submissionsReady} />
        <Card title="Approved Backlinks" value={data.approvedBacklinks} />
      </div>
    </div>
  );
}

function Card({ title, value }: { title: string; value: number }) {
  return (
    <div style={{ padding: "1.25rem", background: "#1e293b", borderRadius: 8 }}>
      <div style={{ fontSize: "0.875rem", color: "#94a3b8", marginBottom: "0.25rem" }}>{title}</div>
      <div style={{ fontSize: "1.5rem", fontWeight: 600 }}>{value}</div>
    </div>
  );
}
