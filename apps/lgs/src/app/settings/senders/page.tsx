"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { lgsFetch } from "@/lib/api";
import { HelpTooltip } from "@/components/HelpTooltip";
import { helpText } from "@/lib/helpText";

type Sender = {
  id: string;
  sender_email: string;
  sent_today: number;
  daily_limit: number;
  last_sent_at: string | null;
  status: string;
  warmup_status?: string;
  warmup_day?: number;
  daily_warmup_limit?: number;
  ready_for_outreach?: boolean;
};

const WARMUP_STATUS_COLORS: Record<string, string> = {
  not_started: "#475569",
  warming: "#f59e0b",
  ready: "#22c55e",
  paused: "#64748b",
};

export default function SendersPage() {
  const [senders, setSenders] = useState<Sender[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [editLimit, setEditLimit] = useState<number>(50);
  const [editStatus, setEditStatus] = useState<string>("active");

  const load = () => {
    // Load senders + warmup state in parallel
    Promise.all([
      lgsFetch<{ data: Sender[] }>("/api/lgs/senders"),
      fetch("/api/lgs/outreach/warmup").then((r) => r.json() as Promise<{ ok: boolean; data: Sender[] }>),
    ])
      .then(([sendersRes, warmupRes]) => {
        if (sendersRes.ok && sendersRes.data) {
          const base: Sender[] = Array.isArray(sendersRes.data) ? sendersRes.data : (sendersRes.data as { data?: Sender[] })?.data ?? [];
          const warmupMap: Record<string, Sender> = {};
          if (warmupRes.ok && Array.isArray(warmupRes.data)) {
            for (const w of warmupRes.data) warmupMap[w.id] = w;
          }
          setSenders(base.map((s) => ({ ...s, ...warmupMap[s.id] })));
        } else {
          setErr(sendersRes.error ?? "Failed to load");
        }
      })
      .catch((e) => setErr(String(e)));
  };

  useEffect(() => {
    load();
  }, []);

  const handleSave = async (id: string) => {
    const res = await lgsFetch<{ ok: boolean }>(`/api/lgs/senders/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ daily_limit: editLimit, status: editStatus }),
    });
    if (res.ok) {
      setEditing(null);
      load();
    } else {
      alert(res.error ?? "Update failed");
    }
  };

  const startEdit = (s: Sender) => {
    setEditing(s.id);
    setEditLimit(s.daily_limit);
    setEditStatus(s.status);
  };

  if (err) return <p style={{ color: "#f87171" }}>{err}</p>;

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem", flexWrap: "wrap", gap: "1rem" }}>
        <h1>Sender Pool <HelpTooltip text={helpText.senders} /></h1>
        <div style={{ display: "flex", gap: "0.5rem" }}>
          <Link href="/outreach/warmup" style={{ padding: "0.6rem 1rem", background: "#f59e0b22", border: "1px solid #f59e0b44", borderRadius: 8, fontSize: "0.875rem", color: "#f59e0b", textDecoration: "none" }}>
            Warmup Status →
          </Link>
          <Link href="/dashboard" style={{ padding: "0.6rem 1rem", background: "#1e293b", border: "1px solid #334155", borderRadius: 8, fontSize: "0.875rem", color: "#94a3b8", textDecoration: "none" }}>
            Dashboard
          </Link>
        </div>
      </div>

      <p style={{ color: "#94a3b8", marginBottom: "1.5rem" }}>
        Manage outreach sender accounts. Edit daily limit and status. Sent counts reset at midnight Pacific.
      </p>

      {senders.length === 0 ? (
        <p style={{ color: "#94a3b8" }}>No senders configured. Run the LGS sender pool migration.</p>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid #334155", textAlign: "left" }}>
                <th style={{ padding: "0.75rem" }}>Sender</th>
                <th style={{ padding: "0.75rem" }}>Sent Today</th>
                <th style={{ padding: "0.75rem" }}>Limit</th>
                <th style={{ padding: "0.75rem" }}>Warmup</th>
                <th style={{ padding: "0.75rem" }}>Last Sent</th>
                <th style={{ padding: "0.75rem" }}>Status</th>
                <th style={{ padding: "0.75rem" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {senders.map((s) => (
                <tr key={s.id} style={{ borderBottom: "1px solid #334155" }}>
                  <td style={{ padding: "0.75rem" }}>{s.sender_email}</td>
                  <td style={{ padding: "0.75rem" }}>{s.sent_today}</td>
                  <td style={{ padding: "0.75rem" }}>
                    {editing === s.id ? (
                      <input
                        type="number"
                        min={0}
                        max={500}
                        value={editLimit}
                        onChange={(e) => setEditLimit(parseInt(e.target.value, 10) || 0)}
                        style={{ width: 80, padding: "0.25rem 0.5rem", background: "#0f172a", border: "1px solid #334155", borderRadius: 4, color: "#f8fafc" }}
                      />
                    ) : (
                      s.daily_limit
                    )}
                  </td>
                  <td style={{ padding: "0.75rem" }}>
                    {s.warmup_status ? (
                      <span style={{
                        padding: "0.2rem 0.5rem",
                        borderRadius: 4,
                        fontSize: "0.75rem",
                        fontWeight: 600,
                        background: `${WARMUP_STATUS_COLORS[s.warmup_status] ?? "#475569"}22`,
                        color: WARMUP_STATUS_COLORS[s.warmup_status] ?? "#475569",
                      }}>
                        {s.warmup_status === "warming" ? `Day ${s.warmup_day}` : s.warmup_status === "ready" ? "✓ Ready" : s.warmup_status === "paused" ? "Paused" : "Not started"}
                      </span>
                    ) : "—"}
                  </td>
                  <td style={{ padding: "0.75rem" }}>
                    {s.last_sent_at ? new Date(s.last_sent_at).toLocaleString() : "—"}
                  </td>
                  <td style={{ padding: "0.75rem" }}>
                    {editing === s.id ? (
                      <select
                        value={editStatus}
                        onChange={(e) => setEditStatus(e.target.value)}
                        style={{ padding: "0.25rem 0.5rem", background: "#0f172a", border: "1px solid #334155", borderRadius: 4, color: "#f8fafc" }}
                      >
                        <option value="active">active</option>
                        <option value="paused">paused</option>
                        <option value="inactive">inactive</option>
                      </select>
                    ) : (
                      s.status
                    )}
                  </td>
                  <td style={{ padding: "0.75rem" }}>
                    {editing === s.id ? (
                      <>
                        <button
                          onClick={() => handleSave(s.id)}
                          style={{ marginRight: "0.5rem", padding: "0.25rem 0.75rem", background: "#22c55e", color: "#0f172a", border: "none", borderRadius: 4, cursor: "pointer" }}
                        >
                          Save
                        </button>
                        <button
                          onClick={() => setEditing(null)}
                          style={{ padding: "0.25rem 0.75rem", background: "#64748b", color: "#f8fafc", border: "none", borderRadius: 4, cursor: "pointer" }}
                        >
                          Cancel
                        </button>
                      </>
                    ) : (
                      <button
                        onClick={() => startEdit(s)}
                        style={{ padding: "0.25rem 0.75rem", background: "#1e293b", color: "#f8fafc", border: "1px solid #334155", borderRadius: 4, cursor: "pointer" }}
                      >
                        Edit
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
