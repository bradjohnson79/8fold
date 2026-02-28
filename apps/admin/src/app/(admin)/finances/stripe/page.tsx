"use client";

import { useEffect, useMemo, useState } from "react";

type ReconciliationRow = {
  jobId: string;
  status: string;
  difference: number;
  internalTotals: { chargeCents: number; escrowHeldCents: number; refundCents: number; transferCents: number };
  stripeTotals: { paymentIntentCents: number; chargeCents: number; refundCents: number; transferCents: number };
};

type ReconciliationResp = {
  rows: ReconciliationRow[];
  totalCount: number;
  page: number;
  pageSize: number;
  mismatchCount: number;
  health: {
    lastWebhook: { id: string; type: string; receivedAt: string } | null;
    lastSync: { id: string; mode: string; createdAt: string; durationMs: number } | null;
  };
};

type ReconciliationDetailResp = {
  result: ReconciliationRow;
  ledgerEntries: Array<any>;
  snapshots: {
    paymentIntents: Array<any>;
    charges: Array<any>;
    refunds: Array<any>;
    transfers: Array<any>;
  };
};

const PAGE_SIZE = 25;

function money(cents: number): string {
  return `$${(Number(cents || 0) / 100).toFixed(2)}`;
}

function isoDate(input: Date): string {
  return input.toISOString().slice(0, 10);
}

function toQuery(params: Record<string, string | null | undefined>): string {
  const u = new URL("http://internal");
  for (const [k, v] of Object.entries(params)) {
    if (!v) continue;
    u.searchParams.set(k, v);
  }
  const q = u.searchParams.toString();
  return q ? `?${q}` : "";
}

function statusColor(status: string): React.CSSProperties {
  const s = String(status).toUpperCase();
  if (s === "MATCHED") return { color: "rgba(134,239,172,0.98)", borderColor: "rgba(34,197,94,0.35)" };
  if (s === "MISSING_CHARGE" || s === "MISSING_TRANSFER") {
    return { color: "rgba(254,202,202,0.98)", borderColor: "rgba(239,68,68,0.35)" };
  }
  if (s === "UNDERPAID" || s === "OVERPAID") {
    return { color: "rgba(254,240,138,0.98)", borderColor: "rgba(234,179,8,0.35)" };
  }
  return { color: "rgba(226,232,240,0.95)", borderColor: "rgba(148,163,184,0.35)" };
}

export default function StripeGatewayPage() {
  const now = useMemo(() => new Date(), []);
  const [fromDate, setFromDate] = useState(isoDate(new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)));
  const [toDate, setToDate] = useState(isoDate(now));
  const [status, setStatus] = useState("");
  const [jobId, setJobId] = useState("");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [data, setData] = useState<ReconciliationResp | null>(null);
  const [expandedJobId, setExpandedJobId] = useState<string | null>(null);
  const [details, setDetails] = useState<Record<string, ReconciliationDetailResp>>({});

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const query = toQuery({
        from: fromDate ? new Date(`${fromDate}T00:00:00.000Z`).toISOString() : null,
        to: toDate ? new Date(`${toDate}T23:59:59.999Z`).toISOString() : null,
        status: status || null,
        jobId: jobId || null,
        page: String(page),
        pageSize: String(PAGE_SIZE),
      });
      const resp = await fetch(`/api/admin/v4/stripe/reconciliation${query}`, { cache: "no-store", credentials: "include" });
      const json = await resp.json().catch(() => null);
      if (!resp.ok || !json?.ok) {
        const msg = String(json?.error?.message ?? "Failed to load Stripe reconciliation");
        setError(`Admin API Error (${resp.status}) Endpoint: /api/admin/v4/stripe/reconciliation - ${msg}`);
        return;
      }
      setData(json.data as ReconciliationResp);
    } catch {
      setError("Failed to load Stripe reconciliation");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fromDate, toDate, status, page]);

  const runSync = async () => {
    setSyncing(true);
    setSyncMessage(null);
    setError(null);
    try {
      const resp = await fetch("/api/admin/v4/stripe/sync/range", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          from: new Date(`${fromDate}T00:00:00.000Z`).toISOString(),
          to: new Date(`${toDate}T23:59:59.999Z`).toISOString(),
        }),
      });
      const json = await resp.json().catch(() => null);
      if (!resp.ok || !json?.ok) {
        const msg = String(json?.error?.message ?? "Sync failed");
        setError(`Admin API Error (${resp.status}) Endpoint: /api/admin/v4/stripe/sync/range - ${msg}`);
        return;
      }
      const result = json.data as any;
      setSyncMessage(
        `Sync complete · inserted ${result?.totals?.inserted ?? 0}, updated ${result?.totals?.updated ?? 0}, skipped ${result?.totals?.skipped ?? 0} · ${result?.durationMs ?? 0}ms`,
      );
      await load();
    } catch {
      setError("Stripe sync failed");
    } finally {
      setSyncing(false);
    }
  };

  const loadDetails = async (id: string) => {
    if (details[id]) {
      setExpandedJobId(expandedJobId === id ? null : id);
      return;
    }
    try {
      const resp = await fetch(`/api/admin/v4/stripe/reconciliation/${encodeURIComponent(id)}`, {
        cache: "no-store",
        credentials: "include",
      });
      const json = await resp.json().catch(() => null);
      if (!resp.ok || !json?.ok) {
        const msg = String(json?.error?.message ?? "Failed to load details");
        setError(`Admin API Error (${resp.status}) Endpoint: /api/admin/v4/stripe/reconciliation/:jobId - ${msg}`);
        return;
      }
      setDetails((prev) => ({ ...prev, [id]: json.data as ReconciliationDetailResp }));
      setExpandedJobId(expandedJobId === id ? null : id);
    } catch {
      setError("Failed to load reconciliation details");
    }
  };

  const totalPages = Math.max(1, Math.ceil(Number(data?.totalCount ?? 0) / PAGE_SIZE));

  return (
    <div>
      <h1 style={{ margin: 0, fontSize: 22, fontWeight: 950 }}>Stripe Gateway</h1>
      <p style={{ marginTop: 8, color: "rgba(226,232,240,0.72)" }}>
        Read-only Stripe synchronization + reconciliation against internal ledger authority.
      </p>

      <div style={{ marginTop: 14, display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 10 }}>
        <div style={cardStyle}>
          <div style={cardTitleStyle}>Date Range</div>
          <div style={{ marginTop: 8, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <input type="date" value={fromDate} onChange={(e) => { setFromDate(e.target.value); setPage(1); }} style={inputStyle} />
            <span style={{ color: "rgba(226,232,240,0.7)" }}>to</span>
            <input type="date" value={toDate} onChange={(e) => { setToDate(e.target.value); setPage(1); }} style={inputStyle} />
          </div>
          <div style={{ marginTop: 8, display: "flex", gap: 8 }}>
            <button onClick={() => void runSync()} disabled={syncing} style={buttonStyle}>
              {syncing ? "Syncing..." : "Sync Now"}
            </button>
            <button onClick={() => void load()} disabled={loading} style={secondaryButtonStyle}>
              Refresh
            </button>
          </div>
        </div>

        <div style={cardStyle}>
          <div style={cardTitleStyle}>Stripe Health</div>
          <div style={{ marginTop: 8, fontSize: 13, color: "rgba(226,232,240,0.88)" }}>
            <div>Last webhook: {data?.health?.lastWebhook?.receivedAt ? String(data.health.lastWebhook.receivedAt).slice(0, 19).replace("T", " ") : "-"}</div>
            <div style={{ marginTop: 4 }}>Last sync: {data?.health?.lastSync?.createdAt ? String(data.health.lastSync.createdAt).slice(0, 19).replace("T", " ") : "-"}</div>
            <div style={{ marginTop: 4 }}>Mismatches in page: {data?.mismatchCount ?? 0}</div>
          </div>
        </div>

        <div style={cardStyle}>
          <div style={cardTitleStyle}>Reconciliation Filters</div>
          <div style={{ marginTop: 8, display: "grid", gap: 8 }}>
            <select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} style={inputStyle}>
              <option value="">All statuses</option>
              <option value="MATCHED">MATCHED</option>
              <option value="MISSING_CHARGE">MISSING_CHARGE</option>
              <option value="MISSING_TRANSFER">MISSING_TRANSFER</option>
              <option value="UNDERPAID">UNDERPAID</option>
              <option value="OVERPAID">OVERPAID</option>
              <option value="MISMATCH">MISMATCH</option>
            </select>
            <input
              value={jobId}
              onChange={(e) => setJobId(e.target.value)}
              placeholder="Filter by Job ID"
              style={inputStyle}
            />
            <button
              onClick={() => {
                setPage(1);
                void load();
              }}
              style={secondaryButtonStyle}
            >
              Apply Filters
            </button>
          </div>
        </div>
      </div>

      {error ? <div style={{ marginTop: 12, color: "rgba(254,202,202,0.95)", fontWeight: 900 }}>{error}</div> : null}
      {syncMessage ? <div style={{ marginTop: 12, color: "rgba(134,239,172,0.95)", fontWeight: 900 }}>{syncMessage}</div> : null}

      <div style={{ marginTop: 16, overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              {["Job", "Status", "Internal Net", "Stripe Net", "Difference", "Actions"].map((h) => (
                <th key={h} style={thStyle}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} style={tdStyle}>Loading...</td></tr>
            ) : null}
            {!loading && (data?.rows?.length ?? 0) === 0 ? (
              <tr><td colSpan={6} style={tdStyle}>No reconciliation rows.</td></tr>
            ) : null}
            {(data?.rows ?? []).map((row) => {
              const internalNet = row.internalTotals.chargeCents - row.internalTotals.refundCents - row.internalTotals.transferCents;
              const stripeNet = row.stripeTotals.chargeCents - row.stripeTotals.refundCents - row.stripeTotals.transferCents;
              const detail = details[row.jobId];
              const expanded = expandedJobId === row.jobId;
              return (
                <>
                  <tr key={row.jobId}>
                    <td style={tdStyle}>{row.jobId}</td>
                    <td style={tdStyle}>
                      <span style={{ ...pillStyle, ...statusColor(row.status) }}>{row.status}</span>
                    </td>
                    <td style={tdStyle}>{money(internalNet)}</td>
                    <td style={tdStyle}>{money(stripeNet)}</td>
                    <td style={tdStyle}>{money(row.difference)}</td>
                    <td style={tdStyle}>
                      <button style={secondaryButtonStyle} onClick={() => void loadDetails(row.jobId)}>
                        {expanded ? "Hide" : "Expand"}
                      </button>
                    </td>
                  </tr>
                  {expanded ? (
                    <tr key={`${row.jobId}:expanded`}>
                      <td colSpan={6} style={{ ...tdStyle, background: "rgba(2,6,23,0.35)" }}>
                        {!detail ? (
                          <div>Loading details...</div>
                        ) : (
                          <div style={{ display: "grid", gap: 8 }}>
                            <div style={{ fontWeight: 900 }}>Ledger entries: {detail.ledgerEntries.length}</div>
                            <div style={{ fontSize: 12, color: "rgba(226,232,240,0.7)" }}>
                              Snapshots — PI: {detail.snapshots.paymentIntents.length}, Charges: {detail.snapshots.charges.length}, Refunds:{" "}
                              {detail.snapshots.refunds.length}, Transfers: {detail.snapshots.transfers.length}
                            </div>
                            <pre style={preStyle}>{JSON.stringify(detail.result, null, 2)}</pre>
                          </div>
                        )}
                      </td>
                    </tr>
                  ) : null}
                </>
              );
            })}
          </tbody>
        </table>
      </div>

      <div style={{ marginTop: 14, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ fontSize: 12, color: "rgba(226,232,240,0.65)" }}>
          Page {page} / {totalPages} · Total {data?.totalCount ?? 0}
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))} style={secondaryButtonStyle}>Prev</button>
          <button disabled={page >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))} style={secondaryButtonStyle}>Next</button>
        </div>
      </div>
    </div>
  );
}

const cardStyle: React.CSSProperties = {
  border: "1px solid rgba(148,163,184,0.2)",
  borderRadius: 12,
  padding: 12,
  background: "rgba(2,6,23,0.25)",
};

const cardTitleStyle: React.CSSProperties = {
  fontSize: 12,
  color: "rgba(226,232,240,0.72)",
  fontWeight: 900,
  textTransform: "uppercase",
  letterSpacing: 0.6,
};

const inputStyle: React.CSSProperties = {
  borderRadius: 10,
  border: "1px solid rgba(148,163,184,0.2)",
  background: "rgba(2,6,23,0.35)",
  color: "rgba(226,232,240,0.92)",
  padding: "8px 10px",
  minHeight: 36,
};

const buttonStyle: React.CSSProperties = {
  borderRadius: 10,
  border: "1px solid rgba(16,185,129,0.45)",
  background: "rgba(16,185,129,0.18)",
  color: "rgba(110,231,183,0.98)",
  fontWeight: 900,
  padding: "8px 12px",
  cursor: "pointer",
};

const secondaryButtonStyle: React.CSSProperties = {
  borderRadius: 10,
  border: "1px solid rgba(148,163,184,0.2)",
  background: "rgba(2,6,23,0.35)",
  color: "rgba(226,232,240,0.92)",
  fontWeight: 900,
  padding: "8px 12px",
  cursor: "pointer",
};

const thStyle: React.CSSProperties = {
  textAlign: "left",
  borderBottom: "1px solid rgba(148,163,184,0.2)",
  padding: "8px 10px",
  fontSize: 12,
  color: "rgba(226,232,240,0.7)",
};

const tdStyle: React.CSSProperties = {
  borderBottom: "1px solid rgba(148,163,184,0.12)",
  padding: "8px 10px",
  color: "rgba(226,232,240,0.9)",
  fontSize: 13,
  verticalAlign: "top",
};

const pillStyle: React.CSSProperties = {
  border: "1px solid rgba(148,163,184,0.28)",
  borderRadius: 999,
  padding: "3px 8px",
  fontSize: 11,
  fontWeight: 900,
};

const preStyle: React.CSSProperties = {
  whiteSpace: "pre-wrap",
  wordBreak: "break-word",
  background: "rgba(2,6,23,0.45)",
  border: "1px solid rgba(148,163,184,0.2)",
  borderRadius: 10,
  padding: 10,
  margin: 0,
  fontSize: 12,
};
