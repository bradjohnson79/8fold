"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { lgsFetch } from "@/lib/api";
import { HelpTooltip } from "@/components/HelpTooltip";
import { helpText } from "@/lib/helpText";
import { formatNumber, toNumber } from "@/lib/formatters";

type FunnelData = {
  total_leads: number;
  emails_sent: number;
  bounces: number;
  replies: number;
  sends_today: number;
  replies_today: number;
  signups: number;
  active_contractors: number;
  active_job_posters: number;
  bounce_rate: number;
  reply_rate: number;
  conversion_rate: number;
};

function normalizeFunnelData(value: Partial<FunnelData> | null | undefined): FunnelData {
  return {
    total_leads: toNumber(value?.total_leads),
    emails_sent: toNumber(value?.emails_sent),
    bounces: toNumber(value?.bounces),
    replies: toNumber(value?.replies),
    sends_today: toNumber(value?.sends_today),
    replies_today: toNumber(value?.replies_today),
    signups: toNumber(value?.signups),
    active_contractors: toNumber(value?.active_contractors),
    active_job_posters: toNumber(value?.active_job_posters),
    bounce_rate: toNumber(value?.bounce_rate),
    reply_rate: toNumber(value?.reply_rate),
    conversion_rate: toNumber(value?.conversion_rate),
  };
}

export default function DashboardPage() {
  const [data, setData] = useState<FunnelData | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    lgsFetch<FunnelData>("/api/lgs/funnel")
      .then((r) => {
        if (r.ok && r.data) setData(normalizeFunnelData(r.data));
        else setErr(r.error ?? "Failed to load");
      })
      .catch((e) => setErr(String(e)));
  }, []);

  if (err) return <p style={{ color: "#f87171" }}>{err}</p>;
  if (!data) return <p>Loading…</p>;

  return (
    <div>
      <h1 style={{ marginBottom: "1.5rem" }}>
        8Fold LGS Dashboard <HelpTooltip text={helpText.dashboard} />
      </h1>

      <div
        style={{
          padding: "1.5rem",
          background: "#1e293b",
          borderRadius: 8,
          marginBottom: "2rem",
        }}
      >
        <h2 style={{ marginBottom: "1rem", fontSize: "1.125rem" }}>
          Core Metrics <HelpTooltip text={helpText.dashboard} />
        </h2>
        <div style={{ display: "grid", gap: "0.5rem", fontFamily: "monospace" }}>
          <Row label="Total Leads" value={data.total_leads} />
          <Row label="Emails Sent" value={data.emails_sent} />
          <Row label="Bounces" value={data.bounces} />
          <Row label="Replies" value={data.replies} />
          <Row label="Sends Today" value={data.sends_today} />
          <Row label="Replies Today" value={data.replies_today} />
          <Row label="Contractor Signups" value={data.signups} />
          <Row label="Active Contractors" value={data.active_contractors} />
          <Row label="Active Job Posters" value={data.active_job_posters} />
        </div>
        <div style={{ marginTop: "1rem", display: "flex", gap: "1.5rem", flexWrap: "wrap" }}>
          <span style={{ color: "#94a3b8" }}>Bounce Rate: {data.bounce_rate}%</span>
          <span style={{ color: "#94a3b8" }}>Reply Rate: {data.reply_rate}%</span>
          <span style={{ color: "#94a3b8" }}>Conversion Rate: {data.conversion_rate}%</span>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: "1rem", marginBottom: "2rem" }}>
        <Card title="Total Leads" value={data.total_leads} />
        <Card title="Emails Sent" value={data.emails_sent} />
        <Card title="Bounces" value={data.bounces} />
        <Card title="Replies" value={data.replies} />
        <Card title="Sends Today" value={data.sends_today} />
        <Card title="Replies Today" value={data.replies_today} />
        <Card title="Signups" value={data.signups} />
        <Card title="Active Contractors" value={data.active_contractors} />
        <Card title="Active Job Posters" value={data.active_job_posters} />
        <Card title="Bounce Rate" value={data.bounce_rate ?? 0} suffix="%" />
        <Card title="Reply Rate" value={data.reply_rate ?? 0} suffix="%" />
        <Card title="Conversion Rate" value={data.conversion_rate ?? 0} suffix="%" />
      </div>

      <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap" }}>
        <Link href="/leads" style={{ padding: "0.75rem 1.25rem", background: "#1e293b", borderRadius: 8 }}>
          Contractor Leads
        </Link>
        <Link href="/leads/import" style={{ padding: "0.75rem 1.25rem", background: "#1e293b", borderRadius: 8 }}>
          Import Contractor Websites
        </Link>
        <Link href="/discovery" style={{ padding: "0.75rem 1.25rem", background: "#1e293b", borderRadius: 8 }}>
          Discovery
        </Link>
        <Link href="/messages" style={{ padding: "0.75rem 1.25rem", background: "#1e293b", borderRadius: 8 }}>
          Messages
        </Link>
        <Link href="/reports/pipeline" style={{ padding: "0.75rem 1.25rem", background: "#1e293b", borderRadius: 8 }}>
          Pipeline Report
        </Link>
        <Link href="/reports/investor" style={{ padding: "0.75rem 1.25rem", background: "#1e293b", borderRadius: 8 }}>
          Investor Snapshot
        </Link>
        <Link href="/settings/senders" style={{ padding: "0.75rem 1.25rem", background: "#1e293b", borderRadius: 8 }}>
          Sender Pool
        </Link>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: number }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: "2rem" }}>
      <span style={{ color: "#94a3b8" }}>{label}</span>
      <span style={{ fontWeight: 600 }}>{formatNumber(value)}</span>
    </div>
  );
}

function Card({ title, value, suffix = "" }: { title: string; value: number; suffix?: string }) {
  const display = formatNumber(value);
  return (
    <div style={{ padding: "1.25rem", background: "#1e293b", borderRadius: 8 }}>
      <div style={{ fontSize: "0.875rem", color: "#94a3b8", marginBottom: "0.25rem" }}>{title}</div>
      <div style={{ fontSize: "1.5rem", fontWeight: 600 }}>{display}{suffix}</div>
    </div>
  );
}
