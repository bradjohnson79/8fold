"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { lgsFetch } from "@/lib/api";
import { HelpTooltip } from "@/components/HelpTooltip";
import { helpText } from "@/lib/helpText";

type FunnelData = {
  leads: number;
  verified_leads?: number;
  emails_sent: number;
  emails_sent_today?: number;
  emails_sent_week?: number;
  responses: number;
  signups: number;
  active_contractors: number;
  messages_generated?: number;
  messages_approved?: number;
  bounce_rate?: number;
  verification_rate?: number;
  outreach_conversion_rate?: number;
  discovery_success_rate?: number;
};

export default function DashboardPage() {
  const [data, setData] = useState<FunnelData | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    lgsFetch<FunnelData>("/api/lgs/funnel")
      .then((r) => {
        if (r.ok && r.data) setData(r.data);
        else setErr(r.error ?? "Failed to load");
      })
      .catch((e) => setErr(String(e)));
  }, []);

  if (err) return <p style={{ color: "#f87171" }}>{err}</p>;
  if (!data) return <p>Loading…</p>;

  const responseRate = data.emails_sent > 0 ? ((data.responses / data.emails_sent) * 100).toFixed(1) : "0";
  const signupRate = data.emails_sent > 0 ? ((data.signups / data.emails_sent) * 100).toFixed(1) : "0";
  const activationRate = data.signups > 0 ? ((data.active_contractors / data.signups) * 100).toFixed(0) : "0";

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
          Lead Funnel <HelpTooltip text={helpText.dashboard} />
        </h2>
        <div style={{ display: "grid", gap: "0.5rem", fontFamily: "monospace" }}>
          <Row label="Total Leads" value={data.leads} />
          <Row label="Verified Leads" value={data.verified_leads ?? 0} />
          <Row label="Messages Generated" value={data.messages_generated ?? 0} />
          <Row label="Messages Approved" value={data.messages_approved ?? 0} />
          <Row label="Emails Sent" value={data.emails_sent} />
          <Row label="Replies" value={data.responses} />
          <Row label="Contractor Signups" value={data.signups} />
          <Row label="Active Contractors" value={data.active_contractors} />
        </div>
        <div style={{ marginTop: "1rem", display: "flex", gap: "1.5rem", flexWrap: "wrap" }}>
          <span style={{ color: "#94a3b8" }}>Response Rate: {responseRate}%</span>
          <span style={{ color: "#94a3b8" }}>Signup Rate: {signupRate}%</span>
          <span style={{ color: "#94a3b8" }}>Activation Rate: {activationRate}%</span>
          {data.emails_sent_today != null && (
            <span style={{ color: "#94a3b8" }}>Emails Today: {data.emails_sent_today}</span>
          )}
          {data.emails_sent_week != null && (
            <span style={{ color: "#94a3b8" }}>Emails This Week: {data.emails_sent_week}</span>
          )}
          {data.bounce_rate != null && (
            <span style={{ color: "#94a3b8" }}>Bounce Rate: {data.bounce_rate}%</span>
          )}
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: "1rem", marginBottom: "2rem" }}>
        <Card title="Total Leads" value={data.leads} />
        <Card title="Verified Leads" value={data.verified_leads ?? 0} />
        <Card title="Messages Generated" value={data.messages_generated ?? 0} />
        <Card title="Messages Approved" value={data.messages_approved ?? 0} />
        <Card title="Emails Sent" value={data.emails_sent} />
        <Card title="Emails Today" value={data.emails_sent_today ?? 0} />
        <Card title="Emails This Week" value={data.emails_sent_week ?? 0} />
        <Card title="Responses" value={data.responses} />
        <Card title="Signups" value={data.signups} />
        <Card title="Active Contractors" value={data.active_contractors} />
        <Card title="Bounce Rate" value={data.bounce_rate ?? 0} suffix="%" />
        <Card title="Verification Rate" value={data.verification_rate ?? 0} suffix="%" />
        <Card title="Outreach Conversion" value={data.outreach_conversion_rate ?? 0} suffix="%" />
        <Card title="Discovery Success" value={data.discovery_success_rate ?? 0} suffix="%" />
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
      <span style={{ fontWeight: 600 }}>{value.toLocaleString()}</span>
    </div>
  );
}

function Card({ title, value, suffix = "" }: { title: string; value: number; suffix?: string }) {
  const display = typeof value === "number" ? value.toLocaleString() : String(value);
  return (
    <div style={{ padding: "1.25rem", background: "#1e293b", borderRadius: 8 }}>
      <div style={{ fontSize: "0.875rem", color: "#94a3b8", marginBottom: "0.25rem" }}>{title}</div>
      <div style={{ fontSize: "1.5rem", fontWeight: 600 }}>{display}{suffix}</div>
    </div>
  );
}
