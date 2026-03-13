"use client";

import { useCallback, useEffect, useState } from "react";

type LaunchOptIn = {
  id: string;
  firstName: string;
  email: string;
  city: string | null;
  state: string;
  source: string;
  status: string;
  createdAt: string;
};

const STATUS_OPTIONS = [
  { value: "new", label: "New" },
  { value: "contacted", label: "Contacted" },
  { value: "invited", label: "Invited" },
  { value: "converted", label: "Converted" },
];

type SortBy = "date" | "city" | "status";
type Order = "asc" | "desc";

const API = "/api/admin/v4/communications/launch-opt-ins";

export default function LaunchOptInsPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [optIns, setOptIns] = useState<LaunchOptIn[]>([]);
  const [sortBy, setSortBy] = useState<SortBy>("date");
  const [order, setOrder] = useState<Order>("desc");
  const [csvLoading, setCsvLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const url = `${API}?sortBy=${sortBy}&order=${order}`;
      const resp = await fetch(url, { cache: "no-store", credentials: "include" });
      const json = await resp.json().catch(() => null);
      if (!resp.ok || !json || json.ok !== true) {
        setError(String(json?.error?.message ?? json?.error ?? "Failed to load opt-ins"));
        return;
      }
      setOptIns(Array.isArray(json.data?.optIns) ? (json.data.optIns as LaunchOptIn[]) : []);
    } catch {
      setError("Failed to load opt-ins");
    } finally {
      setLoading(false);
    }
  }, [sortBy, order]);

  useEffect(() => {
    void load();
  }, [load]);

  const toggleSort = (col: SortBy) => {
    if (sortBy === col) {
      setOrder((o) => (o === "desc" ? "asc" : "desc"));
    } else {
      setSortBy(col);
      setOrder("desc");
    }
  };

  const formatDate = (iso: string | null): string => {
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
  };

  async function handleStatusChange(id: string, newStatus: string) {
    try {
      const resp = await fetch(`${API}/${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ status: newStatus }),
      });
      const json = await resp.json().catch(() => null);
      if (!resp.ok || !json?.ok) {
        console.error("Failed to update status", json);
        return;
      }
      setOptIns((prev) =>
        prev.map((o) => (o.id === id ? { ...o, status: newStatus } : o)),
      );
    } catch (e) {
      console.error("Failed to update status", e);
    }
  }

  async function handleExportCsv() {
    setCsvLoading(true);
    try {
      const resp = await fetch(`${API}?format=csv`, {
        cache: "no-store",
        credentials: "include",
      });
      if (!resp.ok) throw new Error("Export failed");
      const blob = await resp.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "launch-opt-ins.csv";
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error("CSV export failed", e);
    } finally {
      setCsvLoading(false);
    }
  }

  const SortHeader = ({ col, label }: { col: SortBy; label: string }) => (
    <th
      style={{ ...thStyle, cursor: "pointer" }}
      onClick={() => toggleSort(col)}
      title={`Sort by ${label}`}
    >
      {label}
      {sortBy === col && <span style={{ marginLeft: 4 }}>{order === "desc" ? "▼" : "▲"}</span>}
    </th>
  );

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 950 }}>Launch Opt-ins</h1>
          <p style={{ marginTop: 8, color: "rgba(226,232,240,0.72)" }}>
            Contractors who joined the launch list from the homepage.
          </p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ fontSize: 14, color: "rgba(226,232,240,0.7)", fontWeight: 700 }}>
            {optIns.length} opt-in{optIns.length !== 1 ? "s" : ""}
          </span>
          <button
            type="button"
            onClick={() => void handleExportCsv()}
            disabled={csvLoading || optIns.length === 0}
            style={buttonStyle}
          >
            {csvLoading ? "Exporting…" : "Export CSV"}
          </button>
        </div>
      </div>

      {loading && <div style={{ marginTop: 20, color: "rgba(226,232,240,0.6)" }}>Loading…</div>}
      {error && (
        <div style={{ marginTop: 20 }}>
          <div style={{ color: "rgba(254,202,202,0.95)", fontWeight: 700 }}>{error}</div>
          <button onClick={() => void load()} style={{ marginTop: 8, ...buttonStyle }}>
            Retry
          </button>
        </div>
      )}
      {!loading && !error && optIns.length === 0 && (
        <div style={{ marginTop: 20, color: "rgba(226,232,240,0.5)" }}>
          No launch opt-ins yet.
        </div>
      )}
      {!loading && !error && optIns.length > 0 && (
        <div style={{ marginTop: 24, overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={thStyle}>First Name</th>
                <th style={thStyle}>Email</th>
                <th style={thStyle}>City</th>
                <th style={thStyle}>State</th>
                <SortHeader col="status" label="Status" />
                <SortHeader col="date" label="Date" />
              </tr>
            </thead>
            <tbody>
              {optIns.map((o) => (
                <tr key={o.id}>
                  <td style={tdStyle}>{o.firstName}</td>
                  <td style={tdStyle}>{o.email}</td>
                  <td style={tdStyle}>{o.city ?? "—"}</td>
                  <td style={tdStyle}>{o.state}</td>
                  <td style={tdStyle}>
                    <select
                      value={o.status}
                      onChange={(e) => void handleStatusChange(o.id, e.target.value)}
                      style={{
                        ...selectStyle,
                        minWidth: 110,
                      }}
                    >
                      {STATUS_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td style={tdStyle}>{formatDate(o.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

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

const selectStyle: React.CSSProperties = {
  borderRadius: 8,
  border: "1px solid rgba(148,163,184,0.2)",
  background: "rgba(2,6,23,0.35)",
  color: "rgba(226,232,240,0.92)",
  padding: "6px 10px",
  fontSize: 13,
};
