"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { lgsFetch } from "@/lib/api";
import { HelpTooltip } from "@/components/HelpTooltip";
import { helpText } from "@/lib/helpText";

type VerificationLead = {
  id: string;
  email: string;
  verification_score: number | null;
  verification_status: string | null;
  verification_source: string | null;
  domain_reputation: string | null;
  email_bounced: boolean | null;
  created_at: string | null;
};

export default function VerificationPage() {
  const [leads, setLeads] = useState<VerificationLead[]>([]);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    lgsFetch<{ data: VerificationLead[] }>("/api/lgs/verification")
      .then((r) => {
        if (r.ok && r.data) setLeads((r.data as { data: VerificationLead[] }).data ?? []);
        else setErr(r.error ?? "Failed to load");
      })
      .catch((e) => setErr(String(e)));
  }, []);

  if (err) return <p style={{ color: "#f87171" }}>{err}</p>;

  return (
    <div>
      <h1 style={{ marginBottom: "1.5rem" }}>
        Email Verification <HelpTooltip text={helpText.verification} />
      </h1>
      <p style={{ color: "#94a3b8", marginBottom: "1.5rem" }}>
        Verification worker runs every 5 minutes. Only verified leads (score ≥ 85) are eligible for outreach.
      </p>
      <p style={{ marginBottom: "1.5rem" }}>
        <Link href="/leads" style={{ color: "#38bdf8" }}>
          View Contractor Leads
        </Link>
      </p>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ borderBottom: "1px solid #334155", textAlign: "left" }}>
              <th style={{ padding: "0.75rem" }}>Email</th>
              <th style={{ padding: "0.75rem" }}>Score</th>
              <th style={{ padding: "0.75rem" }}>Status</th>
              <th style={{ padding: "0.75rem" }}>Source</th>
              <th style={{ padding: "0.75rem" }}>Domain Reputation</th>
              <th style={{ padding: "0.75rem" }}>Bounced</th>
            </tr>
          </thead>
          <tbody>
            {leads.map((l) => (
              <tr key={l.id} style={{ borderBottom: "1px solid #334155" }}>
                <td style={{ padding: "0.75rem" }}>{l.email}</td>
                <td style={{ padding: "0.75rem" }}>{l.verification_score ?? "—"}</td>
                <td style={{ padding: "0.75rem" }}>{l.verification_status ?? "—"}</td>
                <td style={{ padding: "0.75rem" }}>{l.verification_source ?? "—"}</td>
                <td style={{ padding: "0.75rem" }}>{l.domain_reputation ?? "—"}</td>
                <td style={{ padding: "0.75rem" }}>{l.email_bounced ? "Yes" : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {leads.length === 0 && <p style={{ color: "#94a3b8", marginTop: "1rem" }}>No leads yet.</p>}
    </div>
  );
}
