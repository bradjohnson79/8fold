"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";

type DeliveryLogRow = {
  id: string;
  notificationId: string | null;
  notificationType: string;
  recipientUserId: string;
  recipientEmail: string | null;
  channel: string;
  status: string;
  errorMessage: string | null;
  eventId: string | null;
  dedupeKey: string | null;
  isTest: boolean;
  createdAt: string;
};

const PAGE_SIZE = 50;

function statusColor(status: string) {
  if (status === "DELIVERED") return { bg: "rgba(34,197,94,0.15)", color: "#86efac", border: "rgba(34,197,94,0.3)" };
  if (status === "FAILED") return { bg: "rgba(239,68,68,0.15)", color: "#fca5a5", border: "rgba(239,68,68,0.3)" };
  return { bg: "rgba(148,163,184,0.12)", color: "rgba(226,232,240,0.8)", border: "rgba(148,163,184,0.25)" };
}

function channelColor(channel: string) {
  if (channel === "EMAIL") return { bg: "rgba(56,189,248,0.12)", color: "rgba(125,211,252,0.9)", border: "rgba(56,189,248,0.3)" };
  return { bg: "rgba(167,139,250,0.12)", color: "rgba(196,181,253,0.9)", border: "rgba(167,139,250,0.3)" };
}

function Pill({ label, colors }: { label: string; colors: { bg: string; color: string; border: string } }) {
  return (
    <span
      style={{
        display: "inline-block",
        padding: "2px 8px",
        borderRadius: 999,
        fontSize: 11,
        fontWeight: 900,
        background: colors.bg,
        color: colors.color,
        border: `1px solid ${colors.border}`,
      }}
    >
      {label}
    </span>
  );
}

export default function NotificationLogsPage() {
  const [rows, setRows] = useState<DeliveryLogRow[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [channel, setChannel] = useState("");
  const [status, setStatus] = useState("");
  const [type, setType] = useState("");
  const [showTest, setShowTest] = useState(false);

  const filters = useMemo(() => ({ channel, status, type, showTest, page }), [channel, status, type, showTest, page]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ page: String(filters.page), pageSize: String(PAGE_SIZE) });
      if (filters.channel) params.set("channel", filters.channel);
      if (filters.status) params.set("status", filters.status);
      if (filters.type) params.set("type", filters.type);
      if (filters.showTest) params.set("isTest", "true");

      const resp = await fetch(`/api/admin/v4/notification-delivery-logs?${params}`, {
        cache: "no-store",
        credentials: "include",
      });
      const json = await resp.json().catch(() => null);
      if (!resp.ok || !json?.ok) throw new Error(json?.error ?? "Failed to load logs");
      setRows(Array.isArray(json.rows) ? json.rows : []);
      setTotalCount(Number(json.totalCount ?? 0));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load logs");
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => { void load(); }, [load]);

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  return (
    <div>
      <div style={{ marginBottom: 4 }}>
        <Link href="/notifications" style={{ color: "rgba(148,163,184,0.8)", textDecoration: "none", fontSize: 13 }}>
          ← Notifications
        </Link>
      </div>
      <h1 style={{ margin: 0, fontSize: 22, fontWeight: 950 }}>Delivery Logs</h1>
      <p style={{ marginTop: 6, color: "rgba(226,232,240,0.7)", marginBottom: 16 }}>
        Every email and in-app notification delivery attempt. Test sends are hidden by default.
      </p>

      {/* Filters */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center", marginBottom: 14 }}>
        <select
          value={channel}
          onChange={(e) => { setChannel(e.target.value); setPage(1); }}
          style={selectStyle}
        >
          <option value="">All Channels</option>
          <option value="EMAIL">EMAIL</option>
          <option value="IN_APP">IN_APP</option>
        </select>

        <select
          value={status}
          onChange={(e) => { setStatus(e.target.value); setPage(1); }}
          style={selectStyle}
        >
          <option value="">All Statuses</option>
          <option value="DELIVERED">DELIVERED</option>
          <option value="FAILED">FAILED</option>
          <option value="SKIPPED">SKIPPED</option>
        </select>

        <input
          value={type}
          onChange={(e) => { setType(e.target.value.toUpperCase()); setPage(1); }}
          placeholder="Filter by type..."
          style={{ ...selectStyle, minWidth: 200 }}
        />

        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 900, color: "rgba(226,232,240,0.8)", cursor: "pointer" }}>
          <input
            type="checkbox"
            checked={showTest}
            onChange={(e) => { setShowTest(e.target.checked); setPage(1); }}
          />
          Show test sends
        </label>

        <button onClick={() => void load()} style={btnStyle}>Refresh</button>
      </div>

      {loading && <div style={{ color: "rgba(226,232,240,0.6)" }}>Loading logs...</div>}
      {error && <div style={{ color: "rgba(254,202,202,0.9)", fontWeight: 900 }}>{error}</div>}

      {!loading && !error && rows.length === 0 && (
        <div style={{ color: "rgba(226,232,240,0.55)", fontSize: 13 }}>No delivery log entries found.</div>
      )}

      {!loading && !error && rows.length > 0 && (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr>
                {["Time", "Type", "Recipient", "Channel", "Status", "Event ID", "Error"].map((h) => (
                  <th
                    key={h}
                    style={{
                      textAlign: "left",
                      padding: "8px 10px",
                      border: "1px solid rgba(148,163,184,0.15)",
                      background: "rgba(15,23,42,0.5)",
                      color: "rgba(148,163,184,0.85)",
                      fontWeight: 900,
                      fontSize: 11,
                      whiteSpace: "nowrap",
                    }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const sc = statusColor(row.status);
                const cc = channelColor(row.channel);
                const time = row.createdAt?.slice(0, 19).replace("T", " ") ?? "—";
                const eventIdShort = row.eventId ? row.eventId.slice(0, 8) + "…" : "—";
                return (
                  <tr
                    key={row.id}
                    style={{
                      background: row.isTest ? "rgba(250,204,21,0.04)" : "transparent",
                    }}
                  >
                    <td style={tdStyle}>
                      <span style={{ fontFamily: "monospace", fontSize: 11 }}>{time}</span>
                      {row.isTest && (
                        <span
                          style={{
                            marginLeft: 6,
                            fontSize: 9,
                            background: "rgba(250,204,21,0.18)",
                            color: "#fbbf24",
                            border: "1px solid rgba(250,204,21,0.35)",
                            borderRadius: 999,
                            padding: "1px 4px",
                            fontWeight: 900,
                          }}
                        >
                          TEST
                        </span>
                      )}
                    </td>
                    <td style={tdStyle}>
                      <span style={{ fontFamily: "monospace", fontSize: 11, color: "rgba(125,211,252,0.85)" }}>
                        {row.notificationType}
                      </span>
                    </td>
                    <td style={tdStyle}>
                      <div style={{ fontSize: 11 }}>
                        {row.recipientEmail && (
                          <div style={{ color: "rgba(226,232,240,0.85)" }}>{row.recipientEmail}</div>
                        )}
                        <div style={{ color: "rgba(148,163,184,0.7)", fontFamily: "monospace", fontSize: 10 }}>
                          {row.recipientUserId.slice(0, 10)}…
                        </div>
                      </div>
                    </td>
                    <td style={tdStyle}>
                      <Pill label={row.channel} colors={cc} />
                    </td>
                    <td style={tdStyle}>
                      <Pill label={row.status} colors={sc} />
                    </td>
                    <td style={tdStyle}>
                      <span
                        style={{ fontFamily: "monospace", fontSize: 11, color: "rgba(148,163,184,0.7)" }}
                        title={row.eventId ?? ""}
                      >
                        {eventIdShort}
                      </span>
                    </td>
                    <td style={tdStyle}>
                      {row.errorMessage ? (
                        <span
                          title={row.errorMessage}
                          style={{ color: "#fca5a5", fontSize: 11, cursor: "help" }}
                        >
                          {row.errorMessage.slice(0, 40)}{row.errorMessage.length > 40 ? "…" : ""}
                        </span>
                      ) : (
                        <span style={{ color: "rgba(148,163,184,0.4)" }}>—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <div style={{ marginTop: 14, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ color: "rgba(226,232,240,0.55)", fontSize: 12 }}>
          Page {page} / {totalPages} · Total {totalCount}
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1} style={btnStyle}>
            Prev
          </button>
          <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages} style={btnStyle}>
            Next
          </button>
        </div>
      </div>
    </div>
  );
}

const selectStyle: React.CSSProperties = {
  borderRadius: 8,
  border: "1px solid rgba(148,163,184,0.2)",
  background: "rgba(15,23,42,0.5)",
  color: "rgba(226,232,240,0.9)",
  padding: "6px 10px",
  fontSize: 12,
};

const btnStyle: React.CSSProperties = {
  padding: "6px 12px",
  borderRadius: 8,
  border: "1px solid rgba(56,189,248,0.35)",
  background: "rgba(56,189,248,0.1)",
  color: "rgba(125,211,252,0.9)",
  fontWeight: 900,
  fontSize: 12,
  cursor: "pointer",
};

const tdStyle: React.CSSProperties = {
  padding: "8px 10px",
  border: "1px solid rgba(148,163,184,0.1)",
  verticalAlign: "top",
};
