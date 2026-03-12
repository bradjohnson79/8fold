"use client";

import { useCallback, useEffect, useState } from "react";

type Announcement = {
  id: string;
  title: string;
  message: string;
  audienceType: string;
  status: string;
  recipientCount: number;
  createdBy: string;
  sentAt: string | null;
  createdAt: string;
};

const AUDIENCE_OPTIONS = [
  { value: "contractors", label: "Contractors" },
  { value: "routers", label: "Routers (Waitlist)" },
  { value: "job_posters", label: "Job Posters (Waitlist)" },
  { value: "all", label: "All (Platform + Waitlist)" },
];

const AUDIENCE_LABEL: Record<string, string> = {
  contractors: "Contractors",
  routers: "Routers",
  job_posters: "Job Posters",
  all: "All",
};

const API = "/api/admin/v4/communications/announcements";

export default function AnnouncementsPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [form, setForm] = useState({ title: "", message: "", audienceType: "contractors" });
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const resp = await fetch(API, { cache: "no-store", credentials: "include" });
      const json = await resp.json().catch(() => null);
      if (!resp.ok || !json || json.ok !== true) {
        setError(String(json?.error?.message ?? json?.error ?? "Failed to load announcements"));
        return;
      }
      setAnnouncements(Array.isArray(json.data?.announcements) ? (json.data.announcements as Announcement[]) : []);
    } catch {
      setError("Failed to load announcements");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const setField = (field: keyof typeof form) => (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>,
  ) => {
    setForm((prev) => ({ ...prev, [field]: e.target.value }));
    setSubmitError(null);
    setSubmitSuccess(null);
  };

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    if (!form.title.trim() || !form.message.trim()) {
      setSubmitError("Title and message are required.");
      return;
    }
    setSubmitting(true);
    setSubmitError(null);
    setSubmitSuccess(null);
    try {
      const resp = await fetch(API, {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "include",
        body: JSON.stringify(form),
      });
      const json = await resp.json().catch(() => null);
      if (!resp.ok || !json?.ok) {
        setSubmitError(String(json?.error?.message ?? json?.error ?? "Failed to send announcement"));
        return;
      }
      const count = json.data?.recipientCount ?? 0;
      setSubmitSuccess(`Announcement sent to ${count} recipient${count !== 1 ? "s" : ""}.`);
      setForm({ title: "", message: "", audienceType: "contractors" });
      await load();
    } catch {
      setSubmitError("Network error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  function formatDate(iso: string | null): string {
    if (!iso) return "—";
    try {
      return new Date(iso).toLocaleString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
      });
    } catch {
      return iso;
    }
  }

  return (
    <div>
      <h1 style={{ margin: 0, fontSize: 22, fontWeight: 950 }}>Announcements</h1>
      <p style={{ marginTop: 8, color: "rgba(226,232,240,0.72)" }}>
        Broadcast messages to contractors, waitlist subscribers, or everyone.
      </p>

      {/* Compose form */}
      <div style={{ marginTop: 20, padding: "20px 24px", background: "rgba(2,6,23,0.45)", borderRadius: 12, border: "1px solid rgba(148,163,184,0.15)", maxWidth: 700 }}>
        <h2 style={{ margin: "0 0 16px", fontSize: 16, fontWeight: 800, color: "rgba(226,232,240,0.9)" }}>
          Compose New Announcement
        </h2>
        <form onSubmit={(e) => void handleSend(e)} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {/* Title */}
          <div>
            <label style={labelStyle}>Title / Subject</label>
            <input
              type="text"
              required
              placeholder="e.g. Phase 2 Launch Update"
              value={form.title}
              onChange={setField("title")}
              style={{ ...inputStyle, width: "100%" }}
            />
          </div>

          {/* Message */}
          <div>
            <label style={labelStyle}>Message</label>
            <textarea
              required
              placeholder="Write your announcement here. Each new line becomes a separate paragraph in the email."
              value={form.message}
              onChange={setField("message")}
              rows={6}
              style={{ ...inputStyle, width: "100%", resize: "vertical" }}
            />
          </div>

          {/* Audience */}
          <div>
            <label style={labelStyle}>Audience</label>
            <select
              value={form.audienceType}
              onChange={setField("audienceType")}
              style={{ ...inputStyle, width: "100%" }}
            >
              {AUDIENCE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>

          {submitError && (
            <div style={{ color: "rgba(254,202,202,0.95)", fontWeight: 700, fontSize: 13 }}>{submitError}</div>
          )}
          {submitSuccess && (
            <div style={{ color: "rgba(134,239,172,0.95)", fontWeight: 700, fontSize: 13 }}>{submitSuccess}</div>
          )}

          <div>
            <button type="submit" disabled={submitting} style={buttonStyle}>
              {submitting ? "Sending…" : "Send Now"}
            </button>
          </div>
        </form>
      </div>

      {/* Past announcements table */}
      <div style={{ marginTop: 32 }}>
        <h2 style={{ margin: "0 0 12px", fontSize: 16, fontWeight: 800, color: "rgba(226,232,240,0.9)" }}>
          Sent Announcements
        </h2>

        {loading && <div style={{ color: "rgba(226,232,240,0.6)" }}>Loading…</div>}
        {error && (
          <div>
            <div style={{ color: "rgba(254,202,202,0.95)", fontWeight: 700 }}>{error}</div>
            <button onClick={() => void load()} style={{ marginTop: 8, ...buttonStyle }}>Retry</button>
          </div>
        )}
        {!loading && !error && announcements.length === 0 && (
          <div style={{ color: "rgba(226,232,240,0.5)" }}>No announcements sent yet.</div>
        )}
        {!loading && !error && announcements.length > 0 && (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  {["Title", "Audience", "Recipients", "Date"].map((h) => (
                    <th key={h} style={thStyle}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {announcements.map((a) => (
                  <tr key={a.id}>
                    <td style={{ ...tdStyle, maxWidth: 280 }}>
                      <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontWeight: 700 }}>
                        {a.title}
                      </div>
                    </td>
                    <td style={tdStyle}>
                      <span style={{ display: "inline-block", padding: "3px 8px", borderRadius: 6, background: "rgba(56,189,248,0.12)", color: "rgba(125,211,252,0.9)", fontSize: 12, fontWeight: 700 }}>
                        {AUDIENCE_LABEL[a.audienceType] ?? a.audienceType}
                      </span>
                    </td>
                    <td style={tdStyle}>{a.recipientCount.toLocaleString()}</td>
                    <td style={tdStyle}>{formatDate(a.sentAt ?? a.createdAt)}</td>
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

const inputStyle: React.CSSProperties = {
  borderRadius: 10,
  border: "1px solid rgba(148,163,184,0.2)",
  background: "rgba(2,6,23,0.35)",
  color: "rgba(226,232,240,0.92)",
  padding: "9px 12px",
  fontSize: 14,
};

const buttonStyle: React.CSSProperties = {
  borderRadius: 10,
  border: "1px solid rgba(56,189,248,0.4)",
  background: "rgba(56,189,248,0.14)",
  color: "rgba(125,211,252,0.95)",
  padding: "9px 18px",
  fontWeight: 900,
  cursor: "pointer",
  fontSize: 14,
};

const labelStyle: React.CSSProperties = {
  display: "block",
  color: "rgba(226,232,240,0.7)",
  fontSize: 12,
  fontWeight: 700,
  marginBottom: 6,
  letterSpacing: "0.04em",
  textTransform: "uppercase",
};

const thStyle: React.CSSProperties = {
  textAlign: "left",
  borderBottom: "1px solid rgba(148,163,184,0.2)",
  padding: "8px 10px",
  fontSize: 12,
  color: "rgba(226,232,240,0.7)",
};

const tdStyle: React.CSSProperties = {
  borderBottom: "1px solid rgba(148,163,184,0.1)",
  padding: "10px 10px",
  color: "rgba(226,232,240,0.9)",
  fontSize: 13,
};
