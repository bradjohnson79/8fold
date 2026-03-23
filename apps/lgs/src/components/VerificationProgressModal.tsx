"use client";

export type VerificationProgress = {
  total: number;
  processed: number;
  valid?: number;
  verified: number;
  invalid: number;
  pending?: number;
  risky: number;
  catch_all: number;
  unknown: number;
  remaining: number;
  queue_pending: number;
  queue_processing: number;
};

type Props = {
  open: boolean;
  title: string;
  progress: VerificationProgress | null;
  summary: string | null;
  onClose: () => void;
};

export function VerificationProgressModal({ open, title, progress, summary, onClose }: Props) {
  if (!open) return null;

  const total = progress?.total ?? 0;
  const processed = progress?.processed ?? 0;
  const percent = total > 0 ? Math.round((processed / total) * 100) : 0;
  const done = total > 0 && (progress?.remaining ?? 0) === 0 && (progress?.queue_pending ?? 0) === 0 && (progress?.queue_processing ?? 0) === 0;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(2, 6, 23, 0.75)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        style={{
          width: "min(560px, 92vw)",
          background: "#0f172a",
          border: "1px solid #334155",
          borderRadius: 14,
          padding: "1.25rem",
          boxShadow: "0 20px 60px rgba(0,0,0,0.4)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.75rem" }}>
          <div>
            <h3 style={{ margin: 0, fontSize: "1.05rem", color: "#e2e8f0" }}>{title}</h3>
            <p style={{ margin: "0.35rem 0 0", color: "#94a3b8", fontSize: "0.85rem" }}>
              {done ? "Completed" : "Queued and processing in background"}
            </p>
          </div>
          <button
            onClick={onClose}
            style={{
              background: "transparent",
              color: "#94a3b8",
              border: "1px solid #475569",
              borderRadius: 8,
              padding: "0.35rem 0.7rem",
              cursor: "pointer",
            }}
          >
            Close
          </button>
        </div>

        {summary && (
          <div style={{ marginBottom: "0.9rem", color: "#cbd5e1", fontSize: "0.85rem" }}>{summary}</div>
        )}

        <div style={{ height: 10, background: "#1e293b", borderRadius: 999, overflow: "hidden", marginBottom: "0.75rem" }}>
          <div
            style={{
              width: `${percent}%`,
              height: "100%",
              background: done ? "linear-gradient(90deg, #16a34a, #4ade80)" : "linear-gradient(90deg, #2563eb, #38bdf8)",
              transition: "width 0.3s ease",
            }}
          />
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", color: "#94a3b8", fontSize: "0.82rem", marginBottom: "1rem" }}>
          <span>{processed} processed</span>
          <span>{total} total</span>
          <span>{percent}%</span>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: "0.75rem" }}>
          <Stat label="Valid" value={progress?.valid ?? progress?.verified ?? 0} color="#22c55e" />
          <Stat label="Invalid" value={progress?.invalid ?? 0} color="#ef4444" />
          <Stat label="Pending" value={progress?.pending ?? progress?.remaining ?? progress?.unknown ?? 0} color="#fbbf24" />
          <Stat label="Remaining" value={progress?.remaining ?? progress?.pending ?? 0} color="#38bdf8" />
          <Stat label="Queue Pending" value={progress?.queue_pending ?? 0} color="#a78bfa" />
          <Stat label="Processing" value={progress?.queue_processing ?? 0} color="#60a5fa" />
          <Stat label="Completed" value={done ? total : processed} color="#10b981" />
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div style={{ background: "#111827", border: `1px solid ${color}33`, borderRadius: 10, padding: "0.75rem" }}>
      <div style={{ color: "#64748b", fontSize: "0.75rem", marginBottom: "0.35rem", textTransform: "uppercase", letterSpacing: "0.04em" }}>
        {label}
      </div>
      <div style={{ color, fontWeight: 700, fontSize: "1rem" }}>{value}</div>
    </div>
  );
}
