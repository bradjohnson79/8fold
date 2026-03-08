"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";

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

const COLORS: Record<string, { dot: string; text: string }> = {
  ONLINE: { dot: "#22c55e", text: "rgba(74,222,128,0.95)" },
  NORMAL: { dot: "#22c55e", text: "rgba(74,222,128,0.95)" },
  IDLE: { dot: "#38bdf8", text: "rgba(125,211,252,0.95)" },
  BUSY: { dot: "#eab308", text: "rgba(253,224,71,0.95)" },
  ERROR: { dot: "#ef4444", text: "rgba(252,165,165,0.95)" },
  OFFLINE: { dot: "#94a3b8", text: "rgba(148,163,184,0.8)" },
};

function getColor(status: string) {
  return COLORS[status] ?? COLORS.OFFLINE;
}

function StatusDot({ status, label, message }: { status: string; label: string; message: string }) {
  const c = getColor(status);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
      <span
        style={{
          width: 8,
          height: 8,
          borderRadius: "50%",
          background: c.dot,
          flexShrink: 0,
          boxShadow: `0 0 6px ${c.dot}60`,
        }}
      />
      <span style={{ fontSize: 12, fontWeight: 800, color: "rgba(226,232,240,0.85)", whiteSpace: "nowrap" }}>
        {label}
      </span>
      <span style={{ fontSize: 11, color: c.text, fontWeight: 700, whiteSpace: "nowrap" }}>
        {status}
      </span>
      <span
        style={{
          fontSize: 11,
          color: "rgba(148,163,184,0.6)",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {message}
      </span>
    </div>
  );
}

export default function CompactSystemStatus() {
  const [data, setData] = useState<SystemStatus | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async () => {
    try {
      const resp = await fetch("/api/admin/v4/system/status", { cache: "no-store" });
      const json = await resp.json().catch(() => null);
      if (resp.ok && json?.ok === true) {
        setData(json.data as SystemStatus);
      }
    } catch { /* silent */ }
  }, []);

  useEffect(() => {
    void load();
    intervalRef.current = setInterval(() => void load(), 30_000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [load]);

  if (!data) return null;

  return (
    <div
      style={{
        marginTop: 20,
        border: "1px solid rgba(148,163,184,0.15)",
        borderRadius: 14,
        padding: "14px 18px",
        background: "rgba(2,6,23,0.3)",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <span style={{ fontSize: 13, fontWeight: 900, color: "rgba(226,232,240,0.75)" }}>System Status</span>
        <Link
          href="/system/status"
          style={{ fontSize: 11, color: "rgba(125,211,252,0.8)", textDecoration: "none", fontWeight: 700 }}
        >
          View Details →
        </Link>
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          gap: "8px 24px",
        }}
      >
        <StatusDot status={data.database.status} label="Database" message={data.database.message} />
        <StatusDot status={data.stripe.status} label="Stripe" message={data.stripe.message} />
        <StatusDot status={data.support.status} label="Support" message={data.support.message} />
        <StatusDot status={data.dataCoverage.status} label="Coverage" message={data.dataCoverage.message} />
      </div>
    </div>
  );
}
