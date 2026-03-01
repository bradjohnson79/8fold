"use client";

import { useEffect, useMemo, useState } from "react";

type RevenueTab = "GATEWAY" | "INTEGRITY";

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

type GatewaySummaryResp = {
  dateRange: {
    preset: "24h" | "7d" | "30d" | "custom";
    start: string;
    end: string;
  };
  summary: {
    grossVolume: number;
    refundedAmount: number;
    transferVolume: number;
    netPlatformVolume: number;
    stripeFeeEstimate: number;
    chargeCount: number;
    transferCount: number;
    refundCount: number;
    transferBreakdown: {
      routerTotal: number;
      contractorTotal: number;
      unknownTotal: number;
    };
  };
  discrepancy: {
    hasDiscrepancy: boolean;
    delta: {
      grossMismatch: number;
      refundMismatch: number;
      transferMismatch: number;
      netMismatch: number;
    };
  };
};

type IntegrityStatus = "OPEN" | "ACKNOWLEDGED" | "RESOLVED" | "IGNORED";
type IntegritySeverity = "INFO" | "WARNING" | "CRITICAL";

type IntegrityRow = {
  id: string;
  alertType: string;
  severity: IntegritySeverity;
  status: IntegrityStatus;
  jobId: string | null;
  stripePaymentIntentId: string | null;
  stripeTransferId: string | null;
  internalTotalCents: number;
  stripeTotalCents: number;
  differenceCents: number;
  createdAt: string;
  updatedAt: string;
  resolvedAt: string | null;
  metadata: Record<string, unknown>;
};

type IntegrityListResp = {
  rows: IntegrityRow[];
  totalCount: number;
  page: number;
  pageSize: number;
  summary: {
    totalOpen: number;
    criticalOpen: number;
    warningOpen: number;
    lastRunAt: string | null;
  };
};

type IntegrityDetailResp = {
  alert: IntegrityRow;
  reconciliation: ReconciliationRow | null;
  ledgerEntries: Array<any>;
  snapshots: {
    paymentIntents: Array<any>;
    charges: Array<any>;
    refunds: Array<any>;
    transfers: Array<any>;
  };
  jsonDiff: Record<string, unknown>;
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

function severityStyle(severity: IntegritySeverity): React.CSSProperties {
  if (severity === "CRITICAL") {
    return { color: "rgba(254,202,202,0.98)", borderColor: "rgba(239,68,68,0.45)", background: "rgba(239,68,68,0.18)" };
  }
  if (severity === "WARNING") {
    return { color: "rgba(254,240,138,0.98)", borderColor: "rgba(234,179,8,0.4)", background: "rgba(234,179,8,0.15)" };
  }
  return { color: "rgba(191,219,254,0.98)", borderColor: "rgba(59,130,246,0.35)", background: "rgba(59,130,246,0.14)" };
}

function statusStyle(status: IntegrityStatus): React.CSSProperties {
  if (status === "OPEN") return { color: "rgba(248,113,113,0.95)", borderColor: "rgba(239,68,68,0.4)" };
  if (status === "ACKNOWLEDGED") return { color: "rgba(250,204,21,0.95)", borderColor: "rgba(234,179,8,0.4)" };
  if (status === "RESOLVED") return { color: "rgba(134,239,172,0.98)", borderColor: "rgba(34,197,94,0.4)" };
  return { color: "rgba(203,213,225,0.95)", borderColor: "rgba(148,163,184,0.35)" };
}

export default function RevenueIntegrityPage() {
  const now = useMemo(() => new Date(), []);
  const [tab, setTab] = useState<RevenueTab>("INTEGRITY");

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
  const [gatewayRangePreset, setGatewayRangePreset] = useState<"24h" | "7d" | "30d" | "custom">("7d");
  const [gatewaySummary, setGatewaySummary] = useState<GatewaySummaryResp | null>(null);
  const [gatewaySummaryLoading, setGatewaySummaryLoading] = useState(false);
  const [gatewaySummaryError, setGatewaySummaryError] = useState<string | null>(null);

  const [integrityStatus, setIntegrityStatus] = useState<"" | IntegrityStatus>("OPEN");
  const [integritySeverity, setIntegritySeverity] = useState<"" | IntegritySeverity>("");
  const [integrityAlertType, setIntegrityAlertType] = useState("");
  const [integrityJobId, setIntegrityJobId] = useState("");
  const [integrityPage, setIntegrityPage] = useState(1);
  const [integrityLoading, setIntegrityLoading] = useState(false);
  const [integrityRunning, setIntegrityRunning] = useState(false);
  const [integrityError, setIntegrityError] = useState<string | null>(null);
  const [integrityMessage, setIntegrityMessage] = useState<string | null>(null);
  const [integrityData, setIntegrityData] = useState<IntegrityListResp | null>(null);
  const [integrityExpandedId, setIntegrityExpandedId] = useState<string | null>(null);
  const [integrityDetails, setIntegrityDetails] = useState<Record<string, IntegrityDetailResp>>({});
  const [actionBusy, setActionBusy] = useState<Record<string, boolean>>({});

  const loadGateway = async () => {
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

  const loadGatewaySummary = async () => {
    setGatewaySummaryLoading(true);
    setGatewaySummaryError(null);
    try {
      const query = toQuery({
        dateRange: gatewayRangePreset,
        start: gatewayRangePreset === "custom" ? new Date(`${fromDate}T00:00:00.000Z`).toISOString() : null,
        end: gatewayRangePreset === "custom" ? new Date(`${toDate}T23:59:59.999Z`).toISOString() : null,
      });
      const resp = await fetch(`/api/admin/v4/finance/stripe-gateway${query}`, { cache: "no-store", credentials: "include" });
      const json = await resp.json().catch(() => null);
      if (!resp.ok || !json?.ok) {
        const msg = String(json?.error?.message ?? "Failed to load Stripe gateway summary");
        setGatewaySummaryError(`Admin API Error (${resp.status}) Endpoint: /api/admin/v4/finance/stripe-gateway - ${msg}`);
        return;
      }
      setGatewaySummary(json.data as GatewaySummaryResp);
    } catch {
      setGatewaySummaryError("Failed to load Stripe gateway summary");
    } finally {
      setGatewaySummaryLoading(false);
    }
  };

  const loadIntegrity = async () => {
    setIntegrityLoading(true);
    setIntegrityError(null);
    try {
      const query = toQuery({
        page: String(integrityPage),
        pageSize: String(PAGE_SIZE),
        status: integrityStatus || null,
        severity: integritySeverity || null,
        alertType: integrityAlertType || null,
        jobId: integrityJobId || null,
      });
      const resp = await fetch(`/api/admin/v4/stripe/integrity${query}`, { cache: "no-store", credentials: "include" });
      const json = await resp.json().catch(() => null);
      if (!resp.ok || !json?.ok) {
        const msg = String(json?.error?.message ?? "Failed to load integrity alerts");
        setIntegrityError(`Admin API Error (${resp.status}) Endpoint: /api/admin/v4/stripe/integrity - ${msg}`);
        return;
      }
      setIntegrityData(json.data as IntegrityListResp);
    } catch {
      setIntegrityError("Failed to load integrity alerts");
    } finally {
      setIntegrityLoading(false);
    }
  };

  useEffect(() => {
    if (tab !== "GATEWAY") return;
    void loadGateway();
    void loadGatewaySummary();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, fromDate, toDate, status, page, gatewayRangePreset]);

  useEffect(() => {
    if (tab !== "INTEGRITY") return;
    void loadIntegrity();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, integrityStatus, integritySeverity, integrityAlertType, integrityPage]);

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
      await loadGateway();
      await loadGatewaySummary();
    } catch {
      setError("Stripe sync failed");
    } finally {
      setSyncing(false);
    }
  };

  const loadGatewayDetails = async (id: string) => {
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

  const runIntegrityCheck = async () => {
    setIntegrityRunning(true);
    setIntegrityMessage(null);
    setIntegrityError(null);
    try {
      const resp = await fetch("/api/admin/v4/stripe/integrity", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ maxJobs: 100 }),
      });
      const json = await resp.json().catch(() => null);
      if (!resp.ok || !json?.ok) {
        const msg = String(json?.error?.message ?? "Integrity run failed");
        setIntegrityError(`Admin API Error (${resp.status}) Endpoint: /api/admin/v4/stripe/integrity - ${msg}`);
        return;
      }
      const run = json.data as any;
      setIntegrityMessage(
        `Integrity run complete · scanned ${run?.jobsScanned ?? 0}, checked ${run?.jobsChecked ?? 0}, created ${run?.alertsCreated ?? 0}, dupes ${run?.duplicateAlertsSkipped ?? 0}, ${run?.durationMs ?? 0}ms`,
      );
      await loadIntegrity();
    } catch {
      setIntegrityError("Integrity run failed");
    } finally {
      setIntegrityRunning(false);
    }
  };

  const loadIntegrityDetails = async (id: string) => {
    if (integrityDetails[id]) {
      setIntegrityExpandedId(integrityExpandedId === id ? null : id);
      return;
    }
    try {
      const resp = await fetch(`/api/admin/v4/stripe/integrity/${encodeURIComponent(id)}`, {
        cache: "no-store",
        credentials: "include",
      });
      const json = await resp.json().catch(() => null);
      if (!resp.ok || !json?.ok) {
        const msg = String(json?.error?.message ?? "Failed to load integrity details");
        setIntegrityError(`Admin API Error (${resp.status}) Endpoint: /api/admin/v4/stripe/integrity/:id - ${msg}`);
        return;
      }
      setIntegrityDetails((prev) => ({ ...prev, [id]: json.data as IntegrityDetailResp }));
      setIntegrityExpandedId(integrityExpandedId === id ? null : id);
    } catch {
      setIntegrityError("Failed to load integrity details");
    }
  };

  const updateAlertStatus = async (id: string, nextStatus: Exclude<IntegrityStatus, "OPEN">) => {
    const key = `${id}:${nextStatus}`;
    setActionBusy((prev) => ({ ...prev, [key]: true }));
    setIntegrityError(null);
    try {
      const resp = await fetch(`/api/admin/v4/stripe/integrity/${encodeURIComponent(id)}/status`, {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status: nextStatus }),
      });
      const json = await resp.json().catch(() => null);
      if (!resp.ok || !json?.ok) {
        const msg = String(json?.error?.message ?? "Failed to update alert");
        setIntegrityError(`Admin API Error (${resp.status}) Endpoint: /api/admin/v4/stripe/integrity/:id/status - ${msg}`);
        return;
      }
      await loadIntegrity();
    } catch {
      setIntegrityError("Failed to update integrity alert status");
    } finally {
      setActionBusy((prev) => ({ ...prev, [key]: false }));
    }
  };

  const totalPages = Math.max(1, Math.ceil(Number(data?.totalCount ?? 0) / PAGE_SIZE));
  const integrityPages = Math.max(1, Math.ceil(Number(integrityData?.totalCount ?? 0) / PAGE_SIZE));

  return (
    <div>
      <h1 style={{ margin: 0, fontSize: 22, fontWeight: 950 }}>Revenue</h1>
      <p style={{ marginTop: 8, color: "rgba(226,232,240,0.72)" }}>
        Stripe remains external truth. Ledger remains internal truth. Integrity checks only detect and alert.
      </p>

      <div style={{ marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button
          onClick={() => setTab("INTEGRITY")}
          style={{ ...secondaryButtonStyle, ...(tab === "INTEGRITY" ? selectedTabButtonStyle : null) }}
        >
          Integrity
        </button>
        <button
          onClick={() => setTab("GATEWAY")}
          style={{ ...secondaryButtonStyle, ...(tab === "GATEWAY" ? selectedTabButtonStyle : null) }}
        >
          Stripe Gateway
        </button>
      </div>

      {tab === "GATEWAY" ? (
        <div>
          <div style={{ marginTop: 14, display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 10 }}>
            <div style={cardStyle}>
              <div style={cardTitleStyle}>Date Range</div>
              <div style={{ marginTop: 8 }}>
                <select
                  value={gatewayRangePreset}
                  onChange={(e) => setGatewayRangePreset(e.target.value as "24h" | "7d" | "30d" | "custom")}
                  style={{ ...inputStyle, width: "100%" }}
                >
                  <option value="24h">Last 24 Hours</option>
                  <option value="7d">Last 7 Days</option>
                  <option value="30d">Last 30 Days</option>
                  <option value="custom">Custom Range</option>
                </select>
              </div>
              <div style={{ marginTop: 8, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                <input
                  type="date"
                  value={fromDate}
                  disabled={gatewayRangePreset !== "custom"}
                  onChange={(e) => { setFromDate(e.target.value); setPage(1); }}
                  style={inputStyle}
                />
                <span style={{ color: "rgba(226,232,240,0.7)" }}>to</span>
                <input
                  type="date"
                  value={toDate}
                  disabled={gatewayRangePreset !== "custom"}
                  onChange={(e) => { setToDate(e.target.value); setPage(1); }}
                  style={inputStyle}
                />
              </div>
              <div style={{ marginTop: 8, display: "flex", gap: 8 }}>
                <button onClick={() => void runSync()} disabled={syncing} style={buttonStyle}>
                  {syncing ? "Syncing..." : "Sync Now"}
                </button>
                <button
                  onClick={() => {
                    void loadGateway();
                    void loadGatewaySummary();
                  }}
                  disabled={loading || gatewaySummaryLoading}
                  style={secondaryButtonStyle}
                >
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
              <div style={cardTitleStyle}>Read-Only Stripe Summary</div>
              {gatewaySummaryLoading ? (
                <div style={{ marginTop: 8, fontSize: 13, color: "rgba(226,232,240,0.72)" }}>Loading summary...</div>
              ) : (
                <div style={{ marginTop: 8, fontSize: 13, color: "rgba(226,232,240,0.88)" }}>
                  <div>Gross: {money(gatewaySummary?.summary?.grossVolume ?? 0)}</div>
                  <div style={{ marginTop: 4 }}>Refunds: {money(gatewaySummary?.summary?.refundedAmount ?? 0)}</div>
                  <div style={{ marginTop: 4 }}>Transfers: {money(gatewaySummary?.summary?.transferVolume ?? 0)}</div>
                  <div style={{ marginTop: 4 }}>Net Platform: {money(gatewaySummary?.summary?.netPlatformVolume ?? 0)}</div>
                  <div style={{ marginTop: 4 }}>Fee Est.: {money(gatewaySummary?.summary?.stripeFeeEstimate ?? 0)}</div>
                  <div style={{ marginTop: 4 }}>
                    Discrepancy: {gatewaySummary?.discrepancy?.hasDiscrepancy ? "YES" : "NO"}
                  </div>
                </div>
              )}
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
                    void loadGateway();
                    void loadGatewaySummary();
                  }}
                  style={secondaryButtonStyle}
                >
                  Apply Filters
                </button>
              </div>
            </div>
          </div>

          {error ? <div style={{ marginTop: 12, color: "rgba(254,202,202,0.95)", fontWeight: 900 }}>{error}</div> : null}
          {gatewaySummaryError ? (
            <div style={{ marginTop: 12, color: "rgba(254,202,202,0.95)", fontWeight: 900 }}>{gatewaySummaryError}</div>
          ) : null}
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
                          <button style={secondaryButtonStyle} onClick={() => void loadGatewayDetails(row.jobId)}>
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
      ) : null}

      {tab === "INTEGRITY" ? (
        <div>
          <div style={{ marginTop: 14, display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 10 }}>
            <div style={cardStyle}>
              <div style={cardTitleStyle}>Open Alerts</div>
              <div style={metricValueStyle}>{integrityData?.summary?.totalOpen ?? 0}</div>
              <div style={subtleTextStyle}>Last run: {integrityData?.summary?.lastRunAt ? String(integrityData.summary.lastRunAt).slice(0, 19).replace("T", " ") : "-"}</div>
            </div>
            <div style={cardStyle}>
              <div style={cardTitleStyle}>Critical</div>
              <div style={{ ...metricValueStyle, color: "rgba(248,113,113,0.95)" }}>{integrityData?.summary?.criticalOpen ?? 0}</div>
              <div style={subtleTextStyle}>Immediate investigation required</div>
            </div>
            <div style={cardStyle}>
              <div style={cardTitleStyle}>Warnings</div>
              <div style={{ ...metricValueStyle, color: "rgba(250,204,21,0.95)" }}>{integrityData?.summary?.warningOpen ?? 0}</div>
              <div style={subtleTextStyle}>Review and acknowledge</div>
            </div>
            <div style={cardStyle}>
              <div style={cardTitleStyle}>Runner</div>
              <div style={{ marginTop: 8, display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button onClick={() => void runIntegrityCheck()} disabled={integrityRunning} style={buttonStyle}>
                  {integrityRunning ? "Running..." : "Run Integrity Check"}
                </button>
                <button onClick={() => void loadIntegrity()} disabled={integrityLoading} style={secondaryButtonStyle}>Refresh</button>
              </div>
              <div style={{ ...subtleTextStyle, marginTop: 8 }}>Batch size max 100 · timeout 10s · async alert-only</div>
            </div>
          </div>

          <div style={{ marginTop: 12, display: "flex", flexWrap: "wrap", gap: 8 }}>
            <select value={integrityStatus} onChange={(e) => { setIntegrityStatus((e.target.value || "") as any); setIntegrityPage(1); }} style={inputStyle}>
              <option value="">All Statuses</option>
              <option value="OPEN">OPEN</option>
              <option value="ACKNOWLEDGED">ACKNOWLEDGED</option>
              <option value="RESOLVED">RESOLVED</option>
              <option value="IGNORED">IGNORED</option>
            </select>
            <select value={integritySeverity} onChange={(e) => { setIntegritySeverity((e.target.value || "") as any); setIntegrityPage(1); }} style={inputStyle}>
              <option value="">All Severities</option>
              <option value="CRITICAL">CRITICAL</option>
              <option value="WARNING">WARNING</option>
              <option value="INFO">INFO</option>
            </select>
            <input
              value={integrityAlertType}
              onChange={(e) => setIntegrityAlertType(e.target.value.toUpperCase())}
              placeholder="Alert Type"
              style={{ ...inputStyle, minWidth: 240 }}
            />
            <input
              value={integrityJobId}
              onChange={(e) => setIntegrityJobId(e.target.value)}
              placeholder="Job ID"
              style={{ ...inputStyle, minWidth: 220 }}
            />
            <button onClick={() => { setIntegrityPage(1); void loadIntegrity(); }} style={secondaryButtonStyle}>Apply Filters</button>
          </div>

          {integrityError ? <div style={{ marginTop: 12, color: "rgba(254,202,202,0.95)", fontWeight: 900 }}>{integrityError}</div> : null}
          {integrityMessage ? <div style={{ marginTop: 12, color: "rgba(134,239,172,0.95)", fontWeight: 900 }}>{integrityMessage}</div> : null}

          <div style={{ marginTop: 16, overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  {["Severity", "Alert Type", "Job ID", "Difference", "Created At", "Status", "Actions"].map((h) => (
                    <th key={h} style={thStyle}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {integrityLoading ? (
                  <tr><td colSpan={7} style={tdStyle}>Loading alerts...</td></tr>
                ) : null}
                {!integrityLoading && (integrityData?.rows?.length ?? 0) === 0 ? (
                  <tr><td colSpan={7} style={tdStyle}>No integrity alerts.</td></tr>
                ) : null}
                {(integrityData?.rows ?? []).map((row) => {
                  const detail = integrityDetails[row.id];
                  const expanded = integrityExpandedId === row.id;
                  return (
                    <>
                      <tr key={row.id}>
                        <td style={tdStyle}>
                          <span style={{ ...pillStyle, ...severityStyle(row.severity) }}>{row.severity}</span>
                        </td>
                        <td style={tdStyle}><code>{row.alertType}</code></td>
                        <td style={tdStyle}>
                          {row.jobId ? (
                            <a href={`/jobs/${encodeURIComponent(row.jobId)}`} style={{ color: "rgba(125,211,252,0.95)", textDecoration: "none", fontWeight: 900 }}>
                              {row.jobId}
                            </a>
                          ) : (
                            "-"
                          )}
                        </td>
                        <td style={tdStyle}>{money(row.differenceCents)}</td>
                        <td style={tdStyle}>{String(row.createdAt ?? "").slice(0, 19).replace("T", " ")}</td>
                        <td style={tdStyle}>
                          <span style={{ ...pillStyle, ...statusStyle(row.status) }}>{row.status}</span>
                        </td>
                        <td style={tdStyle}>
                          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                            <button
                              style={miniButtonStyle}
                              disabled={row.status === "ACKNOWLEDGED" || actionBusy[`${row.id}:ACKNOWLEDGED`] === true}
                              onClick={() => void updateAlertStatus(row.id, "ACKNOWLEDGED")}
                            >
                              Acknowledge
                            </button>
                            <button
                              style={miniButtonStyle}
                              disabled={row.status === "RESOLVED" || actionBusy[`${row.id}:RESOLVED`] === true}
                              onClick={() => void updateAlertStatus(row.id, "RESOLVED")}
                            >
                              Resolve
                            </button>
                            <button
                              style={miniButtonStyle}
                              disabled={row.status === "IGNORED" || actionBusy[`${row.id}:IGNORED`] === true}
                              onClick={() => void updateAlertStatus(row.id, "IGNORED")}
                            >
                              Ignore
                            </button>
                            <button style={miniButtonStyle} onClick={() => void loadIntegrityDetails(row.id)}>
                              {expanded ? "Hide" : "View Stripe Snapshot"}
                            </button>
                            <button style={miniButtonStyle} onClick={() => void loadIntegrityDetails(row.id)}>
                              View Ledger Entries
                            </button>
                          </div>
                        </td>
                      </tr>
                      {expanded ? (
                        <tr key={`${row.id}:detail`}>
                          <td colSpan={7} style={{ ...tdStyle, background: "rgba(2,6,23,0.35)" }}>
                            {!detail ? (
                              <div>Loading detail...</div>
                            ) : (
                              <div style={{ display: "grid", gap: 10 }}>
                                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 10 }}>
                                  <div style={innerCardStyle}>
                                    <div style={cardTitleStyle}>Internal Totals</div>
                                    <pre style={preStyle}>{JSON.stringify(detail.reconciliation?.internalTotals ?? {}, null, 2)}</pre>
                                  </div>
                                  <div style={innerCardStyle}>
                                    <div style={cardTitleStyle}>Stripe Totals</div>
                                    <pre style={preStyle}>{JSON.stringify(detail.reconciliation?.stripeTotals ?? {}, null, 2)}</pre>
                                  </div>
                                  <div style={innerCardStyle}>
                                    <div style={cardTitleStyle}>Snapshot Counts</div>
                                    <div style={{ fontSize: 13, color: "rgba(226,232,240,0.85)", marginTop: 8 }}>
                                      PI: {detail.snapshots.paymentIntents.length}<br />
                                      Charges: {detail.snapshots.charges.length}<br />
                                      Refunds: {detail.snapshots.refunds.length}<br />
                                      Transfers: {detail.snapshots.transfers.length}<br />
                                      Ledger: {detail.ledgerEntries.length}
                                    </div>
                                  </div>
                                </div>
                                <div>
                                  <div style={cardTitleStyle}>JSON Diff View</div>
                                  <pre style={preStyle}>{JSON.stringify(detail.jsonDiff, null, 2)}</pre>
                                </div>
                                <details>
                                  <summary style={{ cursor: "pointer", color: "rgba(226,232,240,0.88)", fontWeight: 900 }}>Stripe Snapshots JSON</summary>
                                  <pre style={{ ...preStyle, marginTop: 8 }}>{JSON.stringify(detail.snapshots, null, 2)}</pre>
                                </details>
                                <details>
                                  <summary style={{ cursor: "pointer", color: "rgba(226,232,240,0.88)", fontWeight: 900 }}>Ledger Entries JSON</summary>
                                  <pre style={{ ...preStyle, marginTop: 8 }}>{JSON.stringify(detail.ledgerEntries, null, 2)}</pre>
                                </details>
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
              Page {integrityPage} / {integrityPages} · Total {integrityData?.totalCount ?? 0}
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button disabled={integrityPage <= 1} onClick={() => setIntegrityPage((p) => Math.max(1, p - 1))} style={secondaryButtonStyle}>Prev</button>
              <button disabled={integrityPage >= integrityPages} onClick={() => setIntegrityPage((p) => Math.min(integrityPages, p + 1))} style={secondaryButtonStyle}>Next</button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

const cardStyle: React.CSSProperties = {
  border: "1px solid rgba(148,163,184,0.2)",
  borderRadius: 12,
  padding: 12,
  background: "rgba(2,6,23,0.25)",
};

const innerCardStyle: React.CSSProperties = {
  border: "1px solid rgba(148,163,184,0.14)",
  borderRadius: 10,
  padding: 10,
  background: "rgba(2,6,23,0.35)",
};

const cardTitleStyle: React.CSSProperties = {
  fontSize: 12,
  color: "rgba(226,232,240,0.72)",
  fontWeight: 900,
  textTransform: "uppercase",
  letterSpacing: 0.6,
};

const metricValueStyle: React.CSSProperties = {
  marginTop: 8,
  fontSize: 28,
  lineHeight: 1,
  fontWeight: 950,
  color: "rgba(226,232,240,0.95)",
};

const subtleTextStyle: React.CSSProperties = {
  marginTop: 8,
  fontSize: 12,
  color: "rgba(226,232,240,0.65)",
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

const selectedTabButtonStyle: React.CSSProperties = {
  borderColor: "rgba(56,189,248,0.45)",
  color: "rgba(125,211,252,0.98)",
  background: "rgba(56,189,248,0.16)",
};

const miniButtonStyle: React.CSSProperties = {
  borderRadius: 8,
  border: "1px solid rgba(148,163,184,0.2)",
  background: "rgba(2,6,23,0.4)",
  color: "rgba(226,232,240,0.92)",
  fontWeight: 800,
  fontSize: 12,
  padding: "6px 8px",
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
