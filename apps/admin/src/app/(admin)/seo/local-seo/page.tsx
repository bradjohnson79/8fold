"use client";

import { useCallback, useEffect, useState } from "react";

type PreviewData = {
  slug: string;
  canonicalUrl: string;
  metaTitle: string;
  metaDescription: string;
  templateType: string;
  exampleLayout: {
    h1: string;
    intro: string;
    sections: string[];
  };
};

type QueueEntry = {
  id: string;
  city: string;
  service: string;
  slug: string;
  status: string;
  requestedBy: string | null;
  createdAt: string;
  processedAt: string | null;
};

const card: React.CSSProperties = { border: "1px solid var(--border)", borderRadius: 16, padding: 20, background: "var(--card-bg)", marginBottom: 16 };
const input: React.CSSProperties = { padding: "10px 12px", borderRadius: 10, border: "1px solid var(--border)", background: "var(--input-bg)", color: "var(--text)", fontSize: 14, width: "100%", boxSizing: "border-box" as const };
const label: React.CSSProperties = { display: "block", fontSize: 12, fontWeight: 700, color: "var(--muted)", marginBottom: 6, textTransform: "uppercase" as const, letterSpacing: 0.5 };
const btn: React.CSSProperties = { padding: "10px 20px", borderRadius: 10, border: "none", background: "rgba(34,197,94,0.16)", color: "rgba(34,197,94,1)", fontWeight: 900, cursor: "pointer", fontSize: 14 };
const statusBadge = (s: string): React.CSSProperties => ({
  padding: "3px 10px", borderRadius: 20, fontSize: 11, fontWeight: 700,
  background: s === "published" ? "rgba(34,197,94,0.14)" : s === "error" ? "rgba(254,202,202,0.14)" : "rgba(148,163,184,0.12)",
  color: s === "published" ? "rgba(34,197,94,1)" : s === "error" ? "rgba(254,202,202,0.9)" : "var(--muted)",
});

export default function LocalSeoPage() {
  const [city, setCity] = useState("");
  const [service, setService] = useState("");
  const [previewing, setPreviewing] = useState(false);
  const [queuing, setQueuing] = useState(false);
  const [preview, setPreview] = useState<PreviewData | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [queueSuccess, setQueueSuccess] = useState<string | null>(null);
  const [queueError, setQueueError] = useState<string | null>(null);
  const [queue, setQueue] = useState<QueueEntry[]>([]);
  const [queueLoading, setQueueLoading] = useState(true);

  const loadQueue = useCallback(async () => {
    setQueueLoading(true);
    try {
      const resp = await fetch("/api/admin/v4/seo/local-seo/queue?limit=50", { cache: "no-store" });
      const json = await resp.json().catch(() => null);
      if (json?.ok) setQueue(json.data?.queue ?? []);
    } catch { /* ignore */ }
    finally { setQueueLoading(false); }
  }, []);

  useEffect(() => { void loadQueue(); }, [loadQueue]);

  const generatePreview = async () => {
    if (!city.trim() || !service.trim()) return;
    setPreviewing(true);
    setPreview(null);
    setPreviewError(null);
    setQueueSuccess(null);
    setQueueError(null);
    try {
      const resp = await fetch("/api/admin/v4/seo/local-seo/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ city: city.trim(), service: service.trim() }),
      });
      const json = await resp.json().catch(() => null);
      if (!resp.ok || !json?.ok) { setPreviewError(json?.error?.message ?? "Preview failed"); }
      else { setPreview(json.data?.preview ?? null); }
    } catch { setPreviewError("Request failed"); }
    finally { setPreviewing(false); }
  };

  const approveAndQueue = async () => {
    if (!preview) return;
    setQueuing(true);
    setQueueError(null);
    setQueueSuccess(null);
    try {
      const resp = await fetch("/api/admin/v4/seo/local-seo/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ city: city.trim(), service: service.trim(), templateType: "city-service", previewData: preview }),
      });
      const json = await resp.json().catch(() => null);
      if (!resp.ok || !json?.ok) {
        setQueueError(json?.error?.message ?? "Failed to queue page");
      } else {
        setQueueSuccess(`Page /${preview.slug} queued successfully`);
        setPreview(null);
        setCity("");
        setService("");
        await loadQueue();
      }
    } catch { setQueueError("Request failed"); }
    finally { setQueuing(false); }
  };

  return (
    <div>
      <h1 style={{ margin: 0, fontSize: 22, fontWeight: 950 }}>Local SEO Generator</h1>
      <p style={{ marginTop: 8, color: "var(--muted)", maxWidth: 720 }}>
        Generate optimized city + service landing pages at scale. Preview before approving to prevent garbage pages.
      </p>

      <div style={card}>
        <div style={{ fontWeight: 900, marginBottom: 16 }}>Step 1 — Enter City & Service</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 14 }}>
          <div>
            <label style={label}>City</label>
            <input style={input} value={city} onChange={(e) => setCity(e.target.value)} placeholder="e.g. Vancouver" />
          </div>
          <div>
            <label style={label}>Service</label>
            <input style={input} value={service} onChange={(e) => setService(e.target.value)} placeholder="e.g. Handyman" />
          </div>
        </div>
        <button style={btn} onClick={() => void generatePreview()} disabled={previewing || !city.trim() || !service.trim()}>
          {previewing ? "Generating Preview…" : "Generate Preview"}
        </button>
        {previewError && <div style={{ marginTop: 10, color: "rgba(254,202,202,0.95)", fontWeight: 700 }}>{previewError}</div>}
      </div>

      {preview && (
        <div style={card}>
          <div style={{ fontWeight: 900, marginBottom: 16, color: "rgba(34,197,94,0.9)" }}>Step 2 — Review Preview</div>

          <div style={{ display: "grid", gap: 10, marginBottom: 16 }}>
            <div style={{ padding: 12, borderRadius: 10, background: "rgba(2,6,23,0.4)", border: "1px solid var(--border)" }}>
              <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 4, textTransform: "uppercase", fontWeight: 700 }}>Slug</div>
              <code style={{ fontSize: 14 }}>/{preview.slug}</code>
            </div>
            <div style={{ padding: 12, borderRadius: 10, background: "rgba(2,6,23,0.4)", border: "1px solid var(--border)" }}>
              <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 4, textTransform: "uppercase", fontWeight: 700 }}>Canonical URL</div>
              <code style={{ fontSize: 13 }}>{preview.canonicalUrl}</code>
            </div>
            <div style={{ padding: 12, borderRadius: 10, background: "rgba(2,6,23,0.4)", border: "1px solid var(--border)" }}>
              <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 4, textTransform: "uppercase", fontWeight: 700 }}>Meta Title</div>
              <div style={{ fontSize: 14 }}>{preview.metaTitle}</div>
            </div>
            <div style={{ padding: 12, borderRadius: 10, background: "rgba(2,6,23,0.4)", border: "1px solid var(--border)" }}>
              <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 4, textTransform: "uppercase", fontWeight: 700 }}>Meta Description</div>
              <div style={{ fontSize: 13, color: "var(--muted)" }}>{preview.metaDescription}</div>
            </div>
          </div>

          <div style={{ padding: 14, borderRadius: 12, border: "1px dashed rgba(148,163,184,0.2)", marginBottom: 16 }}>
            <div style={{ fontSize: 11, color: "var(--muted)", textTransform: "uppercase", fontWeight: 700, marginBottom: 10 }}>Example Page Layout</div>
            <h2 style={{ margin: "0 0 8px", fontSize: 18, fontWeight: 900 }}>{preview.exampleLayout.h1}</h2>
            <p style={{ margin: "0 0 12px", color: "var(--muted)", fontSize: 13 }}>{preview.exampleLayout.intro}</p>
            <div style={{ display: "flex", flexWrap: "wrap" as const, gap: 8 }}>
              {preview.exampleLayout.sections.map((s) => (
                <div key={s} style={{ padding: "6px 14px", borderRadius: 8, border: "1px solid var(--border)", fontSize: 12, color: "var(--muted)" }}>
                  {s}
                </div>
              ))}
            </div>
          </div>

          {queueError && <div style={{ marginBottom: 10, color: "rgba(254,202,202,0.95)", fontWeight: 700 }}>{queueError}</div>}
          <div style={{ display: "flex", gap: 10 }}>
            <button style={btn} onClick={() => void approveAndQueue()} disabled={queuing}>
              {queuing ? "Queueing…" : "Approve & Queue Generation"}
            </button>
            <button style={{ ...btn, background: "rgba(148,163,184,0.1)", color: "var(--muted)" }} onClick={() => setPreview(null)}>
              Discard
            </button>
          </div>
        </div>
      )}

      {queueSuccess && <div style={{ padding: 14, borderRadius: 12, background: "rgba(34,197,94,0.08)", border: "1px solid rgba(34,197,94,0.2)", color: "rgba(134,239,172,0.9)", fontWeight: 700, marginBottom: 16 }}>{queueSuccess}</div>}

      <div style={card}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <div style={{ fontWeight: 900 }}>Generation Queue</div>
          <button style={{ ...btn, padding: "6px 14px", fontSize: 12 }} onClick={() => void loadQueue()}>Refresh</button>
        </div>

        {queueLoading && <div style={{ color: "var(--muted)" }}>Loading queue…</div>}
        {!queueLoading && queue.length === 0 && <div style={{ color: "var(--muted)" }}>No pages queued yet.</div>}
        {!queueLoading && queue.length > 0 && (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: "1px solid var(--border)" }}>
                  {["Slug", "City", "Service", "Status", "Queued"].map((h) => (
                    <th key={h} style={{ textAlign: "left", padding: "6px 10px", color: "var(--muted)", fontWeight: 700, fontSize: 11, textTransform: "uppercase" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {queue.map((entry) => (
                  <tr key={entry.id} style={{ borderBottom: "1px solid rgba(148,163,184,0.08)" }}>
                    <td style={{ padding: "8px 10px", fontFamily: "monospace", fontSize: 12 }}>/{entry.slug}</td>
                    <td style={{ padding: "8px 10px" }}>{entry.city}</td>
                    <td style={{ padding: "8px 10px" }}>{entry.service}</td>
                    <td style={{ padding: "8px 10px" }}><span style={statusBadge(entry.status)}>{entry.status}</span></td>
                    <td style={{ padding: "8px 10px", color: "var(--muted)", fontSize: 12 }}>{new Date(entry.createdAt).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
