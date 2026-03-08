"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type SubStatus = {
  status: string;
  message: string;
  latencyMs?: number;
  openTickets?: number;
  gaps?: number;
};

type SystemStatus = {
  database: SubStatus;
  stripe: SubStatus;
  support: SubStatus;
  dataCoverage: SubStatus;
  timestamp: string;
};

const STATUS_COLORS: Record<string, { bg: string; border: string; text: string }> = {
  ONLINE: { bg: "rgba(34,197,94,0.15)", border: "rgba(34,197,94,0.5)", text: "rgba(74,222,128,0.95)" },
  NORMAL: { bg: "rgba(34,197,94,0.15)", border: "rgba(34,197,94,0.5)", text: "rgba(74,222,128,0.95)" },
  IDLE: { bg: "rgba(56,189,248,0.15)", border: "rgba(56,189,248,0.5)", text: "rgba(125,211,252,0.95)" },
  BUSY: { bg: "rgba(234,179,8,0.15)", border: "rgba(234,179,8,0.5)", text: "rgba(253,224,71,0.95)" },
  ERROR: { bg: "rgba(239,68,68,0.15)", border: "rgba(239,68,68,0.5)", text: "rgba(252,165,165,0.95)" },
  OFFLINE: { bg: "rgba(148,163,184,0.15)", border: "rgba(148,163,184,0.4)", text: "rgba(148,163,184,0.8)" },
};

function getStatusColor(status: string) {
  return STATUS_COLORS[status] ?? STATUS_COLORS.OFFLINE;
}

function StatusBadge({ status }: { status: string }) {
  const c = getStatusColor(status);
  return (
    <span
      style={{
        display: "inline-block",
        padding: "3px 10px",
        borderRadius: 8,
        fontSize: 11,
        fontWeight: 900,
        letterSpacing: "0.05em",
        border: `1px solid ${c.border}`,
        background: c.bg,
        color: c.text,
      }}
    >
      {status}
    </span>
  );
}

function StatusCard({ title, sub }: { title: string; sub: SubStatus }) {
  const c = getStatusColor(sub.status);
  return (
    <div
      style={{
        border: `1px solid ${c.border}`,
        borderRadius: 14,
        padding: "20px 24px",
        background: "rgba(2,6,23,0.5)",
        display: "flex",
        flexDirection: "column",
        gap: 10,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontSize: 15, fontWeight: 800, color: "rgba(226,232,240,0.92)" }}>{title}</span>
        <StatusBadge status={sub.status} />
      </div>
      <div style={{ fontSize: 13, color: "rgba(226,232,240,0.72)" }}>{sub.message}</div>
      {sub.latencyMs != null && (
        <div style={{ fontSize: 11, color: "rgba(148,163,184,0.6)" }}>Latency: {sub.latencyMs}ms</div>
      )}
      {sub.openTickets != null && (
        <div style={{ fontSize: 11, color: "rgba(148,163,184,0.6)" }}>Open tickets: {sub.openTickets}</div>
      )}
      {sub.gaps != null && sub.gaps > 0 && (
        <div style={{ fontSize: 11, color: "rgba(148,163,184,0.6)" }}>Gaps: {sub.gaps}</div>
      )}
    </div>
  );
}

export default function SystemStatusPage() {
  const [data, setData] = useState<SystemStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async () => {
    try {
      const resp = await fetch("/api/admin/v4/system/status", { cache: "no-store" });
      const json = await resp.json().catch(() => null);
      if (!resp.ok || !json || json.ok !== true) {
        setError(String(json?.error?.message ?? json?.error ?? "Failed to load system status"));
        return;
      }
      setData(json.data as SystemStatus);
      setError(null);
      setLastRefresh(new Date());
    } catch {
      setError("Failed to load system status");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    intervalRef.current = setInterval(() => void load(), 30_000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [load]);

  function timeSinceRefresh(): string {
    if (!lastRefresh) return "";
    const diff = Math.round((Date.now() - lastRefresh.getTime()) / 1000);
    if (diff < 5) return "just now";
    return `${diff}s ago`;
  }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 950 }}>System Status</h1>
          <p style={{ marginTop: 8, color: "rgba(226,232,240,0.72)" }}>
            Real-time platform health diagnostics. Auto-refreshes every 30 seconds.
          </p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {lastRefresh && (
            <span style={{ fontSize: 12, color: "rgba(148,163,184,0.6)" }}>
              Updated {timeSinceRefresh()}
            </span>
          )}
          <button
            onClick={() => { setLoading(true); void load(); }}
            style={refreshButtonStyle}
            title="Refresh now"
          >
            ↻ Refresh
          </button>
        </div>
      </div>

      {loading && !data && <div style={{ marginTop: 20 }}>Loading system status...</div>}
      {error && (
        <div style={{ marginTop: 20, color: "rgba(254,202,202,0.95)", fontWeight: 900 }}>{error}</div>
      )}

      {data && (
        <div
          style={{
            marginTop: 20,
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
            gap: 16,
          }}
        >
          <StatusCard title="Database Connection" sub={data.database} />
          <StatusCard title="Stripe Integration" sub={data.stripe} />
          <StatusCard title="Support Queue" sub={data.support} />
          <StatusCard title="Data Coverage" sub={data.dataCoverage} />
        </div>
      )}

      {data?.timestamp && (
        <div style={{ marginTop: 16, fontSize: 11, color: "rgba(148,163,184,0.5)" }}>
          Server timestamp: {data.timestamp}
        </div>
      )}
    </div>
  );
}

const refreshButtonStyle: React.CSSProperties = {
  borderRadius: 10,
  border: "1px solid rgba(56,189,248,0.4)",
  background: "rgba(56,189,248,0.14)",
  color: "rgba(125,211,252,0.95)",
  padding: "7px 14px",
  fontWeight: 900,
  cursor: "pointer",
  fontSize: 13,
};
