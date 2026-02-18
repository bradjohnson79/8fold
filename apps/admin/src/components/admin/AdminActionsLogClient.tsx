"use client";

import React, { useMemo, useState } from "react";

type Row = {
  id?: string;
  createdAt?: string;
  action?: string;
  outcome?: string | null;
  actorUserId?: string | null;
  actor?: { email?: string | null; name?: string | null } | null;
  metadata?: any;
};

type Severity = "INFO" | "OVERRIDE" | "FINANCIAL" | "SYSTEM";

function severityForAction(actionRaw: string): Severity {
  const a = String(actionRaw || "").toUpperCase();
  if (a.includes("REFUND") || a.includes("RELEASE") || a.includes("PAYOUT") || a.includes("TRANSFER")) return "FINANCIAL";
  if (a.includes("OVERRIDE") || a.includes("FORCE")) return "OVERRIDE";
  if (a.includes("SYSTEM") || a.includes("MONITOR") || a.includes("CRON")) return "SYSTEM";
  return "INFO";
}

function dayKey(iso: string): string {
  // iso like "2026-02-17T12:34:56.000Z"
  return String(iso || "").slice(0, 10) || "unknown";
}

function fmtWhen(iso: string | null | undefined): string {
  return iso ? String(iso).slice(0, 19).replace("T", " ") : "—";
}

function pill(text: string, tone: "slate" | "amber" | "red" | "green") {
  const colors =
    tone === "green"
      ? { bg: "rgba(34,197,94,0.14)", border: "rgba(34,197,94,0.35)", fg: "rgba(134,239,172,0.95)" }
      : tone === "amber"
        ? { bg: "rgba(251,191,36,0.14)", border: "rgba(251,191,36,0.35)", fg: "rgba(253,230,138,0.95)" }
        : tone === "red"
          ? { bg: "rgba(248,113,113,0.14)", border: "rgba(248,113,113,0.35)", fg: "rgba(254,202,202,0.95)" }
          : { bg: "rgba(2,6,23,0.25)", border: "rgba(148,163,184,0.14)", fg: "rgba(226,232,240,0.85)" };
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: "5px 9px",
        borderRadius: 999,
        border: `1px solid ${colors.border}`,
        background: colors.bg,
        color: colors.fg,
        fontSize: 12,
        fontWeight: 900,
        whiteSpace: "nowrap",
      }}
    >
      {text}
    </span>
  );
}

function toneForSeverity(s: Severity): "slate" | "amber" | "red" | "green" {
  if (s === "FINANCIAL") return "red";
  if (s === "OVERRIDE") return "amber";
  if (s === "SYSTEM") return "slate";
  return "slate";
}

export function AdminActionsLogClient({ rows }: { rows: Row[] }) {
  const [filterAction, setFilterAction] = useState("");
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [collapsedDays, setCollapsedDays] = useState<Record<string, boolean>>({});

  const actionOptions = useMemo(() => {
    const set = new Set<string>();
    for (const r of rows) {
      const a = String(r.action ?? "").trim();
      if (a) set.add(a);
    }
    return Array.from(set).sort();
  }, [rows]);

  const filtered = useMemo(() => {
    const f = filterAction.trim();
    if (!f) return rows;
    return rows.filter((r) => String(r.action ?? "") === f);
  }, [rows, filterAction]);

  const grouped = useMemo(() => {
    const out: Record<string, Row[]> = {};
    for (const r of filtered) {
      const d = dayKey(String(r.createdAt ?? ""));
      (out[d] ||= []).push(r);
    }
    return Object.entries(out).sort(([a], [b]) => (a < b ? 1 : -1));
  }, [filtered]);

  return (
    <div>
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <div style={{ color: "rgba(226,232,240,0.72)", fontSize: 12, fontWeight: 900 }}>Filter</div>
        <select
          value={filterAction}
          onChange={(e) => setFilterAction(e.target.value)}
          style={{
            background: "rgba(2,6,23,0.35)",
            border: "1px solid rgba(148,163,184,0.14)",
            color: "rgba(226,232,240,0.92)",
            borderRadius: 12,
            padding: "7px 10px",
            fontSize: 13,
          }}
          aria-label="Filter by action type"
        >
          <option value="">All actions</option>
          {actionOptions.map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </select>
        <div style={{ color: "rgba(226,232,240,0.60)", fontSize: 12 }}>{filtered.length} events</div>
      </div>

      <div style={{ marginTop: 10, display: "grid", gap: 12 }}>
        {grouped.length === 0 ? (
          <div style={{ color: "rgba(226,232,240,0.65)" }}>No audit log entries found.</div>
        ) : (
          grouped.map(([day, dayRows]) => {
            const collapsed = collapsedDays[day] ?? false;
            return (
              <div
                key={day}
                style={{
                  border: "1px solid rgba(148,163,184,0.12)",
                  borderRadius: 14,
                  background: "rgba(2,6,23,0.22)",
                }}
              >
                <button
                  type="button"
                  onClick={() => setCollapsedDays((m) => ({ ...m, [day]: !collapsed }))}
                  style={{
                    width: "100%",
                    textAlign: "left",
                    border: "none",
                    background: "transparent",
                    color: "rgba(226,232,240,0.92)",
                    fontWeight: 950,
                    padding: "10px 12px",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 10,
                  }}
                >
                  <span>
                    {day} <span style={{ color: "rgba(226,232,240,0.55)", fontWeight: 800 }}>({dayRows.length})</span>
                  </span>
                  <span style={{ color: "rgba(226,232,240,0.55)", fontWeight: 800 }}>{collapsed ? "Show" : "Hide"}</span>
                </button>

                {collapsed ? null : (
                  <div style={{ padding: "0 12px 10px 12px", overflowX: "auto" }}>
                    <table style={{ width: "100%", borderCollapse: "separate", borderSpacing: 0 }}>
                      <thead>
                        <tr>
                          {["When", "Severity", "Action", "Actor", "Outcome", "Metadata"].map((h) => (
                            <th
                              key={h}
                              style={{
                                textAlign: "left",
                                fontSize: 12,
                                color: "rgba(226,232,240,0.70)",
                                fontWeight: 900,
                                padding: "10px 10px",
                                borderBottom: "1px solid rgba(148,163,184,0.10)",
                                whiteSpace: "nowrap",
                              }}
                            >
                              {h}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {dayRows.map((r) => {
                          const id = String(r.id ?? `${r.createdAt}-${r.action}`);
                          const sev = severityForAction(String(r.action ?? ""));
                          const actor = r.actor?.email ?? r.actor?.name ?? r.actorUserId ?? "—";
                          const isOpen = expanded[id] ?? false;
                          return (
                            <tr key={id}>
                              <td style={tdStyle}>{fmtWhen(r.createdAt)}</td>
                              <td style={tdStyle}>{pill(sev, toneForSeverity(sev))}</td>
                              <td style={tdStyle}>
                                <code style={{ color: "rgba(226,232,240,0.82)" }}>{String(r.action ?? "—")}</code>
                              </td>
                              <td style={tdStyle}>{String(actor)}</td>
                              <td style={tdStyle}>{String(r.outcome ?? "—")}</td>
                              <td style={tdStyle}>
                                <button
                                  type="button"
                                  onClick={() => setExpanded((m) => ({ ...m, [id]: !isOpen }))}
                                  style={{
                                    ...miniButtonStyle,
                                    background: isOpen ? "rgba(34,197,94,0.12)" : "rgba(2,6,23,0.25)",
                                    borderColor: isOpen ? "rgba(34,197,94,0.35)" : "rgba(148,163,184,0.14)",
                                    color: isOpen ? "rgba(134,239,172,0.95)" : "rgba(226,232,240,0.85)",
                                  }}
                                >
                                  {isOpen ? "Hide" : "View"}
                                </button>
                                {isOpen ? (
                                  <pre
                                    style={{
                                      marginTop: 8,
                                      marginBottom: 0,
                                      padding: 10,
                                      borderRadius: 12,
                                      border: "1px solid rgba(148,163,184,0.14)",
                                      background: "rgba(2,6,23,0.35)",
                                      color: "rgba(226,232,240,0.75)",
                                      fontSize: 12,
                                      whiteSpace: "pre-wrap",
                                      wordBreak: "break-word",
                                      maxWidth: 760,
                                    }}
                                  >
                                    {JSON.stringify(r.metadata ?? null, null, 2)}
                                  </pre>
                                ) : null}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

const tdStyle: React.CSSProperties = {
  padding: "10px 10px",
  borderBottom: "1px solid rgba(148,163,184,0.06)",
  color: "rgba(226,232,240,0.90)",
  fontSize: 13,
  whiteSpace: "nowrap",
  verticalAlign: "top",
};

const miniButtonStyle: React.CSSProperties = {
  borderRadius: 12,
  padding: "7px 10px",
  fontSize: 12,
  fontWeight: 900,
  cursor: "pointer",
  border: "1px solid rgba(148,163,184,0.14)",
};

