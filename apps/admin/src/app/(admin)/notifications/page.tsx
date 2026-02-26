"use client";

import { useCallback, useEffect, useState } from "react";

type NotificationRow = {
  id: string;
  priority: string;
  title: string;
  message: string;
  type: string;
  entityType: string;
  entityId: string;
  read: boolean;
  createdAt: string;
};

export default function NotificationsPage() {
  const [priority, setPriority] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<NotificationRow[]>([]);

  const load = useCallback(async (p?: string) => {
    setLoading(true);
    setError(null);
    try {
      const query = p ? `?priority=${encodeURIComponent(p)}` : "";
      const resp = await fetch(`/api/admin/v4/notifications${query}`, { cache: "no-store" });
      const json = await resp.json().catch(() => null);
      if (!resp.ok || !json || json.ok !== true) {
        setError(String(json?.error?.message ?? json?.error ?? "Failed to load notifications"));
        return;
      }
      setRows(Array.isArray(json.data?.notifications) ? (json.data.notifications as NotificationRow[]) : []);
    } catch {
      setError("Failed to load notifications");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(priority);
  }, [priority, load]);

  async function markRead(id: string) {
    await fetch(`/api/admin/v4/notifications/${encodeURIComponent(id)}/read`, { method: "POST" });
    await load(priority);
  }

  return (
    <div>
      <h1 style={{ margin: 0, fontSize: 22, fontWeight: 950 }}>Notifications</h1>
      <p style={{ marginTop: 8, color: "rgba(226,232,240,0.72)" }}>System alerts and critical events.</p>

      <div style={{ marginTop: 12, display: "flex", gap: 8, alignItems: "center" }}>
        <label style={{ fontSize: 12, color: "rgba(226,232,240,0.72)", fontWeight: 900 }}>Priority</label>
        <select value={priority} onChange={(e) => setPriority(e.target.value)} style={inputStyle}>
          <option value="">All</option>
          <option value="LOW">LOW</option>
          <option value="NORMAL">NORMAL</option>
          <option value="HIGH">HIGH</option>
          <option value="CRITICAL">CRITICAL</option>
        </select>
      </div>

      {loading ? <div style={{ marginTop: 12 }}>Loading notifications...</div> : null}
      {error ? (
        <div style={{ marginTop: 12 }}>
          <div style={{ color: "rgba(254,202,202,0.95)", fontWeight: 900 }}>{error}</div>
          <button onClick={() => void load(priority)} style={{ marginTop: 8 }}>Retry</button>
        </div>
      ) : null}
      {!loading && !error && rows.length === 0 ? <div style={{ marginTop: 12 }}>No notifications found.</div> : null}

      {!loading && !error && rows.length > 0 ? (
        <div style={{ marginTop: 14, display: "grid", gap: 10 }}>
          {rows.map((n) => (
            <div key={n.id} style={{ border: "1px solid rgba(148,163,184,0.2)", borderRadius: 12, padding: 12, background: "rgba(2,6,23,0.3)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                <div>
                  <div style={{ fontWeight: 900 }}>{n.title}</div>
                  <div style={{ fontSize: 13, color: "rgba(226,232,240,0.85)", marginTop: 4 }}>{n.message}</div>
                  <div style={{ fontSize: 12, color: "rgba(226,232,240,0.6)", marginTop: 6 }}>
                    {n.priority} · {n.type} · {n.entityType}:{n.entityId}
                  </div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: 12, color: "rgba(226,232,240,0.65)" }}>{n.createdAt?.slice(0, 19).replace("T", " ")}</div>
                  {!n.read ? (
                    <button onClick={() => void markRead(n.id)} style={buttonStyle}>Mark Read</button>
                  ) : (
                    <div style={{ marginTop: 8, fontSize: 12, color: "rgba(134,239,172,0.95)", fontWeight: 900 }}>Read</div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  borderRadius: 10,
  border: "1px solid rgba(148,163,184,0.2)",
  background: "rgba(2,6,23,0.35)",
  color: "rgba(226,232,240,0.92)",
  padding: "8px 10px",
};

const buttonStyle: React.CSSProperties = {
  marginTop: 8,
  borderRadius: 10,
  border: "1px solid rgba(56,189,248,0.4)",
  background: "rgba(56,189,248,0.14)",
  color: "rgba(125,211,252,0.95)",
  fontWeight: 900,
  padding: "6px 10px",
  cursor: "pointer",
};
