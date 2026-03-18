"use client";

import { useEffect, useState, useCallback } from "react";
import { lgsFetch } from "@/lib/api";

type WorkerStatus = "running" | "idle" | "error" | "stopped" | "configured" | "future";

type Worker = {
  name: string;
  description: string;
  status: WorkerStatus;
  last_run: string;
  jobs_processed: number;
  detail: string;
  schedule: string;
};

type SystemStats = {
  active_workers: number;
  queue_depth: number;
  sent_today: number;
  pending_review: number;
  active_senders: number;
};

const STATUS_CONFIG: Record<WorkerStatus, { label: string; color: string; bg: string; dot: string }> = {
  running:    { label: "Running",    color: "#4ade80", bg: "#1e3a2f", dot: "#4ade80" },
  idle:       { label: "Idle",       color: "#94a3b8", bg: "#1e293b", dot: "#475569" },
  error:      { label: "Error",      color: "#f87171", bg: "#3b1a1a", dot: "#f87171" },
  stopped:    { label: "Stopped",    color: "#94a3b8", bg: "#1e293b", dot: "#475569" },
  configured: { label: "Configured", color: "#60a5fa", bg: "#1a2b3d", dot: "#60a5fa" },
  future:     { label: "Planned",    color: "#64748b", bg: "#1e293b", dot: "#334155" },
};

function StatCard({ title, value, color = "#f8fafc", sub }: { title: string; value: string | number; color?: string; sub?: string }) {
  return (
    <div style={{ padding: "1rem 1.25rem", background: "#1e293b", borderRadius: 8 }}>
      <div style={{ fontSize: "0.78rem", color: "#64748b", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "0.35rem" }}>{title}</div>
      <div style={{ fontSize: "1.4rem", fontWeight: 700, color }}>{typeof value === "number" ? value.toLocaleString() : value}</div>
      {sub && <div style={{ fontSize: "0.75rem", color: "#475569", marginTop: "0.2rem" }}>{sub}</div>}
    </div>
  );
}

function PulseDot({ color }: { color: string }) {
  return (
    <span style={{
      display: "inline-block",
      width: 8,
      height: 8,
      borderRadius: "50%",
      background: color,
      marginRight: 6,
      boxShadow: color !== "#334155" && color !== "#475569" ? `0 0 6px ${color}` : "none",
    }} />
  );
}

export default function SystemMonitorPage() {
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [system, setSystem] = useState<SystemStats | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  const fetchData = useCallback(() => {
    lgsFetch("/api/lgs/workers")
      .then((r) => {
        const raw = r as unknown as { ok: boolean; data?: Worker[]; system?: SystemStats; error?: string };
        if (raw.ok) {
          setWorkers(raw.data ?? []);
          setSystem(raw.system ?? null);
          setLastRefresh(new Date());
        } else setErr(raw.error ?? "Failed to load");
      })
      .catch((e) => setErr(String(e)))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 15000); // refresh every 15s
    return () => clearInterval(interval);
  }, [fetchData]);

  const activeCount = workers.filter((w) => w.status === "running").length;
  const healthScore =
    workers.length > 0
      ? Math.round(
          (workers.filter((w) => w.status === "running" || w.status === "idle" || w.status === "configured").length /
            workers.length) *
            100
        )
      : 0;

  if (err) return <p style={{ color: "#f87171", padding: "2rem" }}>{err}</p>;

  return (
    <div>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1.5rem" }}>
        <div>
          <h1 style={{ margin: 0, marginBottom: "0.3rem" }}>System Monitor</h1>
          <p style={{ color: "#64748b", fontSize: "0.85rem", margin: 0 }}>
            Background worker health · auto-refreshes every 15s
            {lastRefresh && (
              <span style={{ marginLeft: "0.75rem", color: "#475569" }}>
                · Updated {lastRefresh.toLocaleTimeString()}
              </span>
            )}
          </p>
        </div>
        <button
          type="button"
          onClick={() => { setLoading(true); fetchData(); }}
          style={{
            padding: "0.4rem 0.9rem",
            background: "#334155",
            border: "none",
            borderRadius: 7,
            color: "#f8fafc",
            cursor: "pointer",
            fontSize: "0.85rem",
          }}
        >
          ↻ Refresh
        </button>
      </div>

      {/* System health summary cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: "1rem", marginBottom: "2rem" }}>
        <StatCard
          title="Active Workers"
          value={loading ? "…" : activeCount}
          color={activeCount > 0 ? "#4ade80" : "#94a3b8"}
          sub={`of ${workers.length} total`}
        />
        <StatCard
          title="System Health"
          value={loading ? "…" : `${healthScore}%`}
          color={healthScore >= 80 ? "#4ade80" : healthScore >= 50 ? "#facc15" : "#f87171"}
        />
        <StatCard
          title="Queue Depth"
          value={loading ? "…" : system?.queue_depth ?? 0}
          sub="emails pending"
        />
        <StatCard
          title="Sent Today"
          value={loading ? "…" : system?.sent_today ?? 0}
          color="#60a5fa"
        />
        <StatCard
          title="Pending Review"
          value={loading ? "…" : system?.pending_review ?? 0}
          sub="messages to approve"
        />
        <StatCard
          title="Active Senders"
          value={loading ? "…" : system?.active_senders ?? 0}
          sub="Gmail accounts"
        />
      </div>

      {/* Workers table */}
      {loading ? (
        <p style={{ color: "#94a3b8" }}>Loading workers…</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
          {workers.map((w) => {
            const cfg = STATUS_CONFIG[w.status] ?? STATUS_CONFIG.idle;
            return (
              <div
                key={w.name}
                style={{
                  padding: "1.25rem 1.5rem",
                  background: cfg.bg,
                  borderRadius: 9,
                  border: `1px solid ${w.status === "running" ? "#2d5a3d" : "#1e293b"}`,
                  display: "grid",
                  gridTemplateColumns: "2fr 1fr 1fr 1fr",
                  gap: "1rem",
                  alignItems: "center",
                }}
              >
                {/* Worker info */}
                <div>
                  <div style={{ display: "flex", alignItems: "center", marginBottom: "0.3rem" }}>
                    <PulseDot color={cfg.dot} />
                    <span style={{ fontWeight: 600 }}>{w.name}</span>
                  </div>
                  <div style={{ fontSize: "0.8rem", color: "#64748b", marginLeft: 14 }}>{w.description}</div>
                  {w.detail && (
                    <div style={{ fontSize: "0.78rem", color: "#475569", marginLeft: 14, marginTop: "0.2rem", fontFamily: "monospace" }}>
                      {w.detail}
                    </div>
                  )}
                </div>

                {/* Status */}
                <div>
                  <div style={{ fontSize: "0.75rem", color: "#475569", marginBottom: "0.25rem" }}>Status</div>
                  <span style={{
                    display: "inline-block",
                    padding: "0.2rem 0.6rem",
                    borderRadius: 4,
                    fontSize: "0.8rem",
                    fontWeight: 600,
                    color: cfg.color,
                    background: cfg.color + "22",
                  }}>
                    {cfg.label}
                  </span>
                </div>

                {/* Last run */}
                <div>
                  <div style={{ fontSize: "0.75rem", color: "#475569", marginBottom: "0.25rem" }}>Last Run</div>
                  <div style={{ fontSize: "0.875rem", color: "#94a3b8" }}>{w.last_run}</div>
                  <div style={{ fontSize: "0.75rem", color: "#475569", marginTop: "0.15rem" }}>{w.schedule}</div>
                </div>

                {/* Jobs */}
                <div>
                  <div style={{ fontSize: "0.75rem", color: "#475569", marginBottom: "0.25rem" }}>Jobs Processed</div>
                  <div style={{ fontSize: "1.1rem", fontWeight: 600 }}>{w.jobs_processed.toLocaleString()}</div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Setup note */}
      <div style={{ marginTop: "2rem", padding: "1rem 1.25rem", background: "#1e293b", borderRadius: 8, fontSize: "0.82rem", color: "#64748b" }}>
        <strong style={{ color: "#94a3b8" }}>Worker Commands</strong>
        <div style={{ fontFamily: "monospace", marginTop: "0.5rem", display: "flex", flexDirection: "column", gap: "0.3rem" }}>
          <span>Outreach: <code style={{ color: "#38bdf8" }}>DOTENV_CONFIG_PATH=apps/api/.env.local pnpm exec tsx apps/api/scripts/lgs-outreach-worker.ts</code></span>
          <span>Discovery: triggered via Import Contractor Websites</span>
        </div>
        <div style={{ marginTop: "0.5rem" }}>See <code>docs/LGS_SETUP.md</code> for full setup instructions.</div>
      </div>
    </div>
  );
}
