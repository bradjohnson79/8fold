"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { lgsFetch } from "@/lib/api";
import { HelpTooltip } from "@/components/HelpTooltip";
import { helpText } from "@/lib/helpText";

type DashboardData = {
  totalContacts: number;
  pendingContacts: number;
  sentContacts: number;
  messagesPendingReview: number;
  queuePending: number;
  queueSent: number;
  queueFailed: number;
};

export default function OutreachPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    lgsFetch<DashboardData>("/api/lgs/outreach/dashboard")
      .then((r) => {
        if (r.ok && r.data) setData(r.data);
        else setErr(r.error ?? "Failed to load");
      })
      .catch((e) => setErr(String(e)));
  }, []);

  if (err) return <p style={{ color: "#f87171" }}>{err}</p>;
  if (!data) return <p>Loading…</p>;

  return (
    <div>
      <h1 style={{ marginBottom: "1.5rem" }}>
        Outreach Dashboard <HelpTooltip text={helpText.campaigns} />
      </h1>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: "1rem", marginBottom: "2rem" }}>
        <Card title="Total Contacts" value={data.totalContacts} />
        <Card title="Pending" value={data.pendingContacts} />
        <Card title="Sent" value={data.sentContacts} />
        <Card title="Pending Review" value={data.messagesPendingReview} />
        <Card title="Queue Pending" value={data.queuePending} />
        <Card title="Queue Sent" value={data.queueSent} />
        <Card title="Queue Failed" value={data.queueFailed} />
      </div>
      <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap" }}>
        <Link href="/outreach/import" style={{ padding: "0.75rem 1.25rem", background: "#1e293b", borderRadius: 8 }}>
          Import Contacts
        </Link>
        <Link href="/outreach/contacts" style={{ padding: "0.75rem 1.25rem", background: "#1e293b", borderRadius: 8 }}>
          Contacts
        </Link>
        <Link href="/outreach/review" style={{ padding: "0.75rem 1.25rem", background: "#1e293b", borderRadius: 8 }}>
          Email Review
        </Link>
        <Link href="/outreach/queue" style={{ padding: "0.75rem 1.25rem", background: "#1e293b", borderRadius: 8 }}>
          Queue Monitor
        </Link>
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
