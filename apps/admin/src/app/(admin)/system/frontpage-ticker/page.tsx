"use client";

import { useCallback, useEffect, useState } from "react";

type TickerMessage = {
  id: string;
  message: string;
  isActive: boolean;
  displayOrder: number;
  intervalSeconds: number;
};

export default function FrontpageTickerPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [messages, setMessages] = useState<TickerMessage[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ message: "", displayOrder: 1, intervalSeconds: 6 });
  const [addForm, setAddForm] = useState({ message: "", displayOrder: 1, intervalSeconds: 6 });
  const [showAdd, setShowAdd] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const resp = await fetch("/api/admin/v4/system/frontpage-ticker", { cache: "no-store" });
      const json = await resp.json().catch(() => null);
      if (!resp.ok || !json || json.ok !== true) {
        setError(String(json?.error?.message ?? json?.error ?? "Failed to load ticker messages"));
        return;
      }
      setMessages(Array.isArray(json.data?.messages) ? (json.data.messages as TickerMessage[]) : []);
    } catch {
      setError("Failed to load ticker messages");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function addMessage(e: React.FormEvent) {
    e.preventDefault();
    setSubmitError(null);
    if (!addForm.message.trim()) {
      setSubmitError("Message cannot be empty.");
      return;
    }
    try {
      const resp = await fetch("/api/admin/v4/system/frontpage-ticker", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          message: addForm.message.trim(),
          isActive: true,
          displayOrder: addForm.displayOrder,
          intervalSeconds: addForm.intervalSeconds,
        }),
      });
      const json = await resp.json().catch(() => null);
      if (!resp.ok) {
        setSubmitError(String(json?.error?.message ?? json?.error ?? "Failed to add message"));
        return;
      }
      setAddForm({ message: "", displayOrder: 1, intervalSeconds: 6 });
      setShowAdd(false);
      await load();
    } catch {
      setSubmitError("Failed to add message");
    }
  }

  async function saveEdit(id: string) {
    setSubmitError(null);
    if (!editForm.message.trim()) {
      setSubmitError("Message cannot be empty.");
      return;
    }
    try {
      const resp = await fetch(`/api/admin/v4/system/frontpage-ticker/${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          message: editForm.message.trim(),
          displayOrder: editForm.displayOrder,
          intervalSeconds: editForm.intervalSeconds,
        }),
      });
      if (!resp.ok) {
        const json = await resp.json().catch(() => null);
        setSubmitError(String(json?.error?.message ?? json?.error ?? "Failed to update"));
        return;
      }
      setEditingId(null);
      await load();
    } catch {
      setSubmitError("Failed to update message");
    }
  }

  async function toggleActive(m: TickerMessage) {
    await fetch(`/api/admin/v4/system/frontpage-ticker/${encodeURIComponent(m.id)}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ isActive: !m.isActive }),
    });
    await load();
  }

  async function deleteMessage(id: string) {
    if (!confirm("Delete this ticker message?")) return;
    await fetch(`/api/admin/v4/system/frontpage-ticker/${encodeURIComponent(id)}`, { method: "DELETE" });
    await load();
  }

  function startEdit(m: TickerMessage) {
    setEditingId(m.id);
    setEditForm({ message: m.message, displayOrder: m.displayOrder, intervalSeconds: m.intervalSeconds });
    setSubmitError(null);
  }

  return (
    <div>
      <h1 style={{ margin: 0, fontSize: 22, fontWeight: 950 }}>Frontpage Ticker</h1>
      <p style={{ marginTop: 8, color: "rgba(226,232,240,0.72)" }}>
        Manage the rotating announcement banner on the public homepage. Maximum 5 messages.
      </p>

      {messages.length < 5 && (
        <div style={{ marginTop: 12 }}>
          {!showAdd ? (
            <button style={buttonStyle} onClick={() => { setShowAdd(true); setSubmitError(null); }}>
              + Add Message
            </button>
          ) : (
            <form onSubmit={addMessage} style={{ display: "flex", flexDirection: "column", gap: 8, maxWidth: 600 }}>
              <textarea
                value={addForm.message}
                onChange={(e) => setAddForm((v) => ({ ...v, message: e.target.value }))}
                placeholder="Ticker message text"
                rows={2}
                style={{ ...inputStyle, width: "100%", resize: "vertical" }}
              />
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <label style={labelStyle}>Order</label>
                <input
                  type="number"
                  min={1}
                  max={5}
                  value={addForm.displayOrder}
                  onChange={(e) => setAddForm((v) => ({ ...v, displayOrder: Number(e.target.value) }))}
                  style={{ ...inputStyle, width: 60 }}
                />
                <label style={labelStyle}>Interval (s)</label>
                <input
                  type="number"
                  min={1}
                  max={120}
                  value={addForm.intervalSeconds}
                  onChange={(e) => setAddForm((v) => ({ ...v, intervalSeconds: Number(e.target.value) }))}
                  style={{ ...inputStyle, width: 70 }}
                />
                <button type="submit" style={buttonStyle}>Save</button>
                <button type="button" style={dangerButtonStyle} onClick={() => { setShowAdd(false); setSubmitError(null); }}>
                  Cancel
                </button>
              </div>
            </form>
          )}
        </div>
      )}

      {submitError && (
        <div style={{ marginTop: 8, color: "rgba(254,202,202,0.95)", fontWeight: 900 }}>{submitError}</div>
      )}

      {loading && <div style={{ marginTop: 12 }}>Loading ticker messages...</div>}
      {error && (
        <div style={{ marginTop: 12 }}>
          <div style={{ color: "rgba(254,202,202,0.95)", fontWeight: 900 }}>{error}</div>
          <button onClick={() => void load()} style={{ marginTop: 8 }}>Retry</button>
        </div>
      )}
      {!loading && !error && messages.length === 0 && <div style={{ marginTop: 12 }}>No ticker messages configured.</div>}

      {!loading && !error && messages.length > 0 && (
        <div style={{ marginTop: 12, overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                {["Order", "Message", "Interval", "Active", "Actions"].map((h) => (
                  <th key={h} style={thStyle}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {messages.map((m) => (
                <tr key={m.id}>
                  {editingId === m.id ? (
                    <>
                      <td style={tdStyle}>
                        <input
                          type="number"
                          min={1}
                          max={5}
                          value={editForm.displayOrder}
                          onChange={(e) => setEditForm((v) => ({ ...v, displayOrder: Number(e.target.value) }))}
                          style={{ ...inputStyle, width: 50 }}
                        />
                      </td>
                      <td style={tdStyle}>
                        <textarea
                          value={editForm.message}
                          onChange={(e) => setEditForm((v) => ({ ...v, message: e.target.value }))}
                          rows={2}
                          style={{ ...inputStyle, width: "100%", resize: "vertical" }}
                        />
                      </td>
                      <td style={tdStyle}>
                        <input
                          type="number"
                          min={1}
                          max={120}
                          value={editForm.intervalSeconds}
                          onChange={(e) => setEditForm((v) => ({ ...v, intervalSeconds: Number(e.target.value) }))}
                          style={{ ...inputStyle, width: 60 }}
                        />
                      </td>
                      <td style={tdStyle}>
                        <button style={buttonStyle} onClick={() => void toggleActive(m)}>
                          {m.isActive ? "Active" : "Inactive"}
                        </button>
                      </td>
                      <td style={tdStyle}>
                        <div style={{ display: "flex", gap: 6 }}>
                          <button style={buttonStyle} onClick={() => void saveEdit(m.id)}>Save</button>
                          <button style={dangerButtonStyle} onClick={() => setEditingId(null)}>Cancel</button>
                        </div>
                      </td>
                    </>
                  ) : (
                    <>
                      <td style={tdStyle}>{m.displayOrder}</td>
                      <td style={{ ...tdStyle, maxWidth: 400 }}>
                        <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {m.message}
                        </div>
                      </td>
                      <td style={tdStyle}>{m.intervalSeconds}s</td>
                      <td style={tdStyle}>
                        <button style={buttonStyle} onClick={() => void toggleActive(m)}>
                          {m.isActive ? "Active" : "Inactive"}
                        </button>
                      </td>
                      <td style={tdStyle}>
                        <div style={{ display: "flex", gap: 6 }}>
                          <button style={buttonStyle} onClick={() => startEdit(m)}>Edit</button>
                          <button style={dangerButtonStyle} onClick={() => void deleteMessage(m.id)}>Delete</button>
                        </div>
                      </td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
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
  borderRadius: 10,
  border: "1px solid rgba(56,189,248,0.4)",
  background: "rgba(56,189,248,0.14)",
  color: "rgba(125,211,252,0.95)",
  padding: "7px 10px",
  fontWeight: 900,
  cursor: "pointer",
};

const dangerButtonStyle: React.CSSProperties = {
  borderRadius: 10,
  border: "1px solid rgba(248,113,113,0.4)",
  background: "rgba(248,113,113,0.14)",
  color: "rgba(252,165,165,0.95)",
  padding: "7px 10px",
  fontWeight: 900,
  cursor: "pointer",
};

const labelStyle: React.CSSProperties = {
  color: "rgba(226,232,240,0.7)",
  fontSize: 13,
  fontWeight: 700,
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
  padding: "8px 10px",
  color: "rgba(226,232,240,0.9)",
  fontSize: 13,
};
