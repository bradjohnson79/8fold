"use client";

import Link from "next/link";

export default function BrainPage() {
  return (
    <div style={{ maxWidth: 760 }}>
      <h1 style={{ marginBottom: "1rem" }}>Outreach Overview Retired</h1>
      <p style={{ color: "#94a3b8", lineHeight: 1.7, marginBottom: "1.5rem" }}>
        The legacy outreach brain view was removed in the simplicity reset. LGS now focuses on lead collection,
        email safety, message generation, sending, and outcome metrics.
      </p>
      <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
        <Link href="/outreach/queue" style={{ padding: "0.6rem 1rem", background: "#1e293b", border: "1px solid #334155", borderRadius: 8 }}>
          View Queue
        </Link>
        <Link href="/dashboard" style={{ padding: "0.6rem 1rem", background: "#1e293b", border: "1px solid #334155", borderRadius: 8 }}>
          View Dashboard
        </Link>
        <Link href="/leads" style={{ padding: "0.6rem 1rem", background: "#1e293b", border: "1px solid #334155", borderRadius: 8 }}>
          View Leads
        </Link>
      </div>
    </div>
  );
}
