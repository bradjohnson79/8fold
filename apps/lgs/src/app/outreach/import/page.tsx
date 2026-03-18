"use client";

import { useState } from "react";
import Link from "next/link";

export default function ImportPage() {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ imported: number; skipped: number; errors: string[] } | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) {
      setErr("Select a file");
      return;
    }
    setLoading(true);
    setErr(null);
    setResult(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/lgs/outreach/contacts/import", {
        method: "POST",
        body: formData,
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErr(json.error ?? "Import failed");
        return;
      }
      setResult({
        imported: json.imported ?? 0,
        skipped: json.skipped ?? 0,
        errors: json.errors ?? [],
      });
    } catch (e) {
      setErr(String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <h1 style={{ marginBottom: "1.5rem" }}>Import Contacts</h1>
      <p style={{ color: "#94a3b8", marginBottom: "1.5rem" }}>
        Upload CSV or Excel. Expected columns: name, job_position, trade_category, location, email, website, notes.
      </p>
      <form onSubmit={handleSubmit} style={{ marginBottom: "2rem" }}>
        <input
          type="file"
          accept=".csv,.xlsx,.xls"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          style={{ marginBottom: "1rem", display: "block" }}
        />
        <button
          type="submit"
          disabled={loading || !file}
          style={{ padding: "0.75rem 1.25rem", background: "#1e293b", borderRadius: 8, cursor: loading ? "not-allowed" : "pointer" }}
        >
          {loading ? "Importing…" : "Import"}
        </button>
      </form>
      {err && <p style={{ color: "#f87171", marginBottom: "1rem" }}>{err}</p>}
      {result && (
        <div style={{ padding: "1rem", background: "#1e293b", borderRadius: 8 }}>
          <p>Imported: {result.imported}</p>
          <p>Skipped: {result.skipped}</p>
          {result.errors.length > 0 && (
            <p style={{ color: "#fbbf24", marginTop: "0.5rem" }}>
              Errors: {result.errors.slice(0, 5).join("; ")}
              {result.errors.length > 5 ? ` (+${result.errors.length - 5} more)` : ""}
            </p>
          )}
        </div>
      )}
      <p style={{ marginTop: "2rem" }}>
        <Link href="/outreach" style={{ color: "#94a3b8" }}>← Back to Outreach</Link>
      </p>
    </div>
  );
}
