"use client";

import Link from "next/link";

export default function OutreachSettingsPage() {
  return (
    <div style={{ maxWidth: 760 }}>
      <h1 style={{ marginBottom: "1rem" }}>Legacy Outreach Settings Retired</h1>
      <p style={{ color: "#94a3b8", lineHeight: 1.7, marginBottom: "1.5rem" }}>
        Score-based queue tuning and brain controls were removed in the simplicity reset. The active LGS controls
        now live in sender management, warmup, verification, and the core leads workflow.
      </p>
      <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
        <Link href="/settings" style={{ padding: "0.6rem 1rem", background: "#1e293b", border: "1px solid #334155", borderRadius: 8 }}>
          General Settings
        </Link>
        <Link href="/settings/senders" style={{ padding: "0.6rem 1rem", background: "#1e293b", border: "1px solid #334155", borderRadius: 8 }}>
          Sender Settings
        </Link>
        <Link href="/verification" style={{ padding: "0.6rem 1rem", background: "#1e293b", border: "1px solid #334155", borderRadius: 8 }}>
          Verification
        </Link>
      </div>
    </div>
  );
}
