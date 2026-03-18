"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { lgsFetch } from "@/lib/api";

type Contact = {
  id: string;
  name: string | null;
  jobPosition: string | null;
  tradeCategory: string | null;
  location: string | null;
  email: string;
  website: string | null;
  notes: string | null;
  status: string;
  createdAt: string;
};

export default function ContactsPage() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [total, setTotal] = useState(0);
  const [err, setErr] = useState<string | null>(null);
  const [generating, setGenerating] = useState<string | null>(null);

  function load() {
    lgsFetch<{ data: Contact[]; total: number }>("/api/lgs/outreach/contacts")
      .then((r) => {
        if (r.ok && r.data) {
          const d = r.data as { data: Contact[]; total: number };
          setContacts(d.data ?? []);
          setTotal(d.total ?? 0);
        } else setErr(r.error ?? "Failed to load");
      })
      .catch((e) => setErr(String(e)));
  }

  useEffect(() => load(), []);

  async function generate(contactId: string) {
    setGenerating(contactId);
    const r = await lgsFetch(`/api/lgs/outreach/contacts/${contactId}/generate`, { method: "POST" });
    setGenerating(null);
    if (r.ok) load();
    else setErr(r.error ?? "Generate failed");
  }

  if (err) return <p style={{ color: "#f87171" }}>{err}</p>;

  return (
    <div>
      <h1 style={{ marginBottom: "1.5rem" }}>Contacts ({total})</h1>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ borderBottom: "1px solid #334155" }}>
              <th style={{ textAlign: "left", padding: "0.5rem" }}>Name</th>
              <th style={{ textAlign: "left", padding: "0.5rem" }}>Email</th>
              <th style={{ textAlign: "left", padding: "0.5rem" }}>Trade</th>
              <th style={{ textAlign: "left", padding: "0.5rem" }}>Location</th>
              <th style={{ textAlign: "left", padding: "0.5rem" }}>Status</th>
              <th style={{ textAlign: "left", padding: "0.5rem" }}>Action</th>
            </tr>
          </thead>
          <tbody>
            {contacts.map((c) => (
              <tr key={c.id} style={{ borderBottom: "1px solid #334155" }}>
                <td style={{ padding: "0.5rem" }}>{c.name ?? "—"}</td>
                <td style={{ padding: "0.5rem" }}>{c.email}</td>
                <td style={{ padding: "0.5rem" }}>{c.tradeCategory ?? "—"}</td>
                <td style={{ padding: "0.5rem" }}>{c.location ?? "—"}</td>
                <td style={{ padding: "0.5rem" }}>{c.status}</td>
                <td style={{ padding: "0.5rem" }}>
                  {c.status !== "invalid_email" && (
                    <button
                      onClick={() => generate(c.id)}
                      disabled={generating === c.id}
                      style={{ padding: "0.25rem 0.5rem", background: "#334155", borderRadius: 4, cursor: generating === c.id ? "not-allowed" : "pointer", fontSize: "0.875rem" }}
                    >
                      {generating === c.id ? "…" : "Generate"}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {contacts.length === 0 && <p style={{ color: "#94a3b8", marginTop: "1rem" }}>No contacts. Import first.</p>}
      <p style={{ marginTop: "2rem" }}>
        <Link href="/outreach" style={{ color: "#94a3b8" }}>← Back to Outreach</Link>
      </p>
    </div>
  );
}
