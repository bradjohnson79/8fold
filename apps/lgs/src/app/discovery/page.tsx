"use client";

import { useEffect, useState, useRef } from "react";
import Link from "next/link";
import { HelpTooltip } from "@/components/HelpTooltip";
import { helpText } from "@/lib/helpText";

type DiscoveryLead = {
  id: string;
  email: string;
  business_name: string | null;
  contact_name: string | null;
  industry: string | null;
  domain: string | null;
  discovery_method: string | null;
  imported: boolean;
};

type RunData = {
  run: {
    id: string;
    status: string;
    domains_total: number;
    domains_processed: number;
    successful_domains: number;
    emails_found: number;
    contacts_found: number;
    domains_discarded: number;
    failed_domains: number;
    skipped_domains: number;
    emails_scraped: number;
    emails_pattern_generated: number;
    emails_verified: number;
    emails_imported: number;
    created_at: string | null;
  };
  leads: DiscoveryLead[];
};

type StatusData = {
  run_id: string;
  status: string;
  domains_total: number;
  domains_processed: number;
  successful_domains: number;
  emails_found: number;
  contacts_found: number;
  failed_domains: number;
  removed_domains: number;
  skipped_domains: number;
};

const POLL_INTERVAL_MS = 2000;

export default function DiscoveryPage() {
  const [file, setFile] = useState<File | null>(null);
  const [running, setRunning] = useState(false);
  const [runId, setRunId] = useState<string | null>(null);
  const [status, setStatus] = useState<StatusData | null>(null);
  const [runData, setRunData] = useState<RunData | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [err, setErr] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function loadRun(id: string) {
    fetch(`/api/lgs/discovery/runs/${id}`)
      .then((r) => r.json())
      .then((json) => {
        if (json.ok && json.data) setRunData(json.data);
        else setErr(json.error ?? "Failed to load run");
      })
      .catch((e) => setErr(String(e)));
  }

  function loadStatus(id: string) {
    fetch(`/api/lgs/discovery/runs/${id}/status`)
      .then((r) => r.json())
      .then((json) => {
        if (json.ok && json.data) setStatus(json.data);
      })
      .catch(() => {});
  }

  useEffect(() => {
    if (!runId || !running) return;
    loadStatus(runId);
    const interval = setInterval(() => {
      loadStatus(runId);
    }, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [runId, running]);

  useEffect(() => {
    if (status?.status === "complete" || status?.status === "failed") {
      setRunning(false);
      if (runId) loadRun(runId);
    }
  }, [status?.status, runId]);

  async function startDiscovery() {
    if (!file) {
      setErr("Choose a CSV or XLSX file first");
      return;
    }

    setRunning(true);
    setErr(null);
    setStatus(null);
    setRunData(null);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch("/api/lgs/discovery/bulk", {
        method: "POST",
        body: formData,
      });
      const json = await res.json().catch(() => ({}));
      if (res.ok && json.ok && json.data) {
        setRunId(json.data.run_id);
        setStatus({
          run_id: json.data.run_id,
          status: "running",
          domains_total: json.data.domains_total ?? 0,
          domains_processed: 0,
          successful_domains: 0,
          emails_found: 0,
          contacts_found: 0,
          failed_domains: 0,
          removed_domains: 0,
          skipped_domains: 0,
        });
      } else {
        setErr(json.error ?? "Discovery failed");
        setRunning(false);
      }
    } catch (e) {
      setErr(String(e));
      setRunning(false);
    }
  }

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectAll() {
    if (!runData) return;
    const notImported = runData.leads.filter((l) => !l.imported).map((l) => l.id);
    setSelected(new Set(notImported));
  }

  function unselectAll() {
    setSelected(new Set());
  }

  async function importSelected() {
    if (!runId || selected.size === 0) return;
    setImporting(true);
    setErr(null);
    try {
      const res = await fetch(`/api/lgs/discovery/runs/${runId}/import`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leadIds: Array.from(selected) }),
      });
      const json = await res.json().catch(() => ({}));
      if (res.ok && json.ok) {
        setSelected(new Set());
        loadRun(runId);
      } else {
        setErr(json.error ?? "Import failed");
      }
    } catch (e) {
      setErr(String(e));
    } finally {
      setImporting(false);
    }
  }

  const s = status ?? runData?.run;
  const domainsTotal = s?.domains_total ?? 0;
  const domainsProcessed = s?.domains_processed ?? 0;
  const progressPct = domainsTotal > 0 ? Math.round((domainsProcessed / domainsTotal) * 100) : 0;
  const isComplete = status?.status === "complete" || runData?.run?.status === "complete";

  const successRate =
    domainsProcessed > 0 && (s?.successful_domains ?? 0) > 0
      ? ((s!.successful_domains / domainsProcessed) * 100).toFixed(1)
      : "0";
  const emailRecoveryRate =
    domainsProcessed > 0 && (s?.successful_domains ?? 0) > 0 && (s?.emails_found ?? 0) > 0
      ? (((s!.emails_found ?? 0) / domainsProcessed) * 100).toFixed(1)
      : "0";

  return (
    <div>
      <h1 style={{ marginBottom: "1.5rem" }}>
        Bulk Domain Discovery <HelpTooltip text={helpText.discovery} />
      </h1>

      <div style={{ marginBottom: "2rem" }}>
        <h2 style={{ fontSize: "1rem", fontWeight: 600, marginBottom: "0.75rem" }}>
          Upload Domain File
        </h2>
        <div
          style={{
            padding: "1.5rem",
            background: "#1e293b",
            borderRadius: 8,
            border: "1px dashed #334155",
          }}
        >
          <div style={{ marginBottom: "0.75rem" }}>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,.xlsx,.xls"
              onChange={(e) => {
                const f = e.target.files?.[0];
                setFile(f ?? null);
                setErr(null);
              }}
              style={{ display: "none" }}
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={running}
              style={{
                padding: "0.5rem 1rem",
                background: "#334155",
                borderRadius: 6,
                cursor: running ? "not-allowed" : "pointer",
              }}
            >
              Choose CSV/XLSX
            </button>
          </div>
          <p style={{ fontSize: "0.875rem", color: "#94a3b8" }}>
            Supported formats: CSV, XLSX. Required column: <code>domain</code>
          </p>
          {file && (
            <p style={{ fontSize: "0.875rem", color: "#94a3b8", marginTop: "0.5rem" }}>
              Selected: {file.name}
            </p>
          )}
        </div>
        <div style={{ marginTop: "1rem" }}>
          <button
            onClick={startDiscovery}
            disabled={running || !file}
            style={{
              padding: "0.75rem 1.5rem",
              background: running || !file ? "#334155" : "#22c55e",
              color: running || !file ? "#64748b" : "#0f172a",
              fontWeight: 600,
              borderRadius: 8,
              cursor: running || !file ? "not-allowed" : "pointer",
            }}
          >
            {running ? "Discovery in progress…" : "Start Discovery"}
          </button>
        </div>
      </div>

      {err && <p style={{ color: "#f87171", marginBottom: "1rem" }}>{err}</p>}

      {(running || status || runData) && (
        <div style={{ marginBottom: "2rem" }}>
          <h2 style={{ fontSize: "1rem", fontWeight: 600, marginBottom: "1rem" }}>
            Discovery Progress
          </h2>
          <div
            style={{
              padding: "1.25rem",
              background: "#1e293b",
              borderRadius: 8,
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))",
              gap: "1rem",
            }}
          >
            <div>
              <div style={{ fontSize: "0.75rem", color: "#94a3b8" }}>Domains Processed</div>
              <div style={{ fontSize: "1.25rem", fontWeight: 600 }}>
                {domainsProcessed} / {domainsTotal}
              </div>
            </div>
            <div>
              <div style={{ fontSize: "0.75rem", color: "#94a3b8" }}>Successful Domains</div>
              <div style={{ fontSize: "1.25rem", fontWeight: 600 }}>{s?.successful_domains ?? 0}</div>
            </div>
            <div>
              <div style={{ fontSize: "0.75rem", color: "#94a3b8" }}>Emails Found</div>
              <div style={{ fontSize: "1.25rem", fontWeight: 600 }}>{s?.emails_found ?? 0}</div>
            </div>
            <div>
              <div style={{ fontSize: "0.75rem", color: "#94a3b8" }}>Contacts Found</div>
              <div style={{ fontSize: "1.25rem", fontWeight: 600 }}>{(s as { contacts_found?: number })?.contacts_found ?? 0}</div>
            </div>
            <div>
              <div style={{ fontSize: "0.75rem", color: "#94a3b8" }}>Failed Domains</div>
              <div style={{ fontSize: "1.25rem", fontWeight: 600 }}>{(s as { failed_domains?: number })?.failed_domains ?? 0}</div>
            </div>
            <div>
              <div style={{ fontSize: "0.75rem", color: "#94a3b8" }}>Removed Domains</div>
              <div style={{ fontSize: "1.25rem", fontWeight: 600 }}>
                {(s as { removed_domains?: number })?.removed_domains ??
                  (s as { domains_discarded?: number })?.domains_discarded ??
                  0}
              </div>
            </div>
            <div>
              <div style={{ fontSize: "0.75rem", color: "#94a3b8" }}>Skipped Domains</div>
              <div style={{ fontSize: "1.25rem", fontWeight: 600 }}>{s?.skipped_domains ?? 0}</div>
            </div>
          </div>

          <div style={{ marginTop: "1rem" }}>
            <div
              style={{
                height: 8,
                background: "#334155",
                borderRadius: 4,
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  height: "100%",
                  width: `${progressPct}%`,
                  background: "#22c55e",
                  transition: "width 0.3s ease",
                }}
              />
            </div>
            <div style={{ fontSize: "0.875rem", color: "#94a3b8", marginTop: "0.25rem" }}>
              {progressPct}%
            </div>
          </div>
        </div>
      )}

      {isComplete && runData && (
        <div style={{ marginBottom: "2rem" }}>
          <h2 style={{ fontSize: "1rem", fontWeight: 600, marginBottom: "1rem" }}>
            Discovery Complete
          </h2>
          <div
            style={{
              padding: "1.25rem",
              background: "#1e293b",
              borderRadius: 8,
              marginBottom: "1rem",
            }}
          >
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: "1rem", marginBottom: "1rem" }}>
              <div>
                <div style={{ fontSize: "0.75rem", color: "#94a3b8" }}>Domains Processed</div>
                <div style={{ fontSize: "1.25rem", fontWeight: 600 }}>{runData.run.domains_processed}</div>
              </div>
              <div>
                <div style={{ fontSize: "0.75rem", color: "#94a3b8" }}>Successful Domains</div>
                <div style={{ fontSize: "1.25rem", fontWeight: 600 }}>{runData.run.successful_domains}</div>
              </div>
              <div>
                <div style={{ fontSize: "0.75rem", color: "#94a3b8" }}>Emails Found</div>
                <div style={{ fontSize: "1.25rem", fontWeight: 600 }}>{runData.run.emails_found}</div>
              </div>
              <div>
                <div style={{ fontSize: "0.75rem", color: "#94a3b8" }}>Contacts Found</div>
                <div style={{ fontSize: "1.25rem", fontWeight: 600 }}>{runData.run.contacts_found ?? 0}</div>
              </div>
              <div>
                <div style={{ fontSize: "0.75rem", color: "#94a3b8" }}>Removed Domains</div>
                <div style={{ fontSize: "1.25rem", fontWeight: 600 }}>{runData.run.domains_discarded}</div>
              </div>
              <div>
                <div style={{ fontSize: "0.75rem", color: "#94a3b8" }}>Failed Domains</div>
                <div style={{ fontSize: "1.25rem", fontWeight: 600 }}>{runData.run.failed_domains ?? 0}</div>
              </div>
            </div>
            <div style={{ marginBottom: "1rem" }}>
              <span style={{ color: "#94a3b8" }}>Discovery Success Rate: </span>
              <strong>{successRate}%</strong>
            </div>
            <div style={{ marginBottom: "1rem" }}>
              <span style={{ color: "#94a3b8" }}>Email Recovery Rate: </span>
              <strong>{emailRecoveryRate}%</strong>
            </div>
            <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
              <Link
                href="/leads"
                style={{
                  padding: "0.5rem 1rem",
                  background: "#334155",
                  borderRadius: 6,
                  textDecoration: "none",
                  color: "#e2e8f0",
                }}
              >
                View Leads
              </Link>
              {runData.leads.some((l) => !l.imported) && (
                <button
                  onClick={async () => {
                    const ids = runData.leads.filter((l) => !l.imported).map((l) => l.id);
                    setSelected(new Set(ids));
                    setImporting(true);
                    setErr(null);
                    try {
                      const res = await fetch(`/api/lgs/discovery/runs/${runId}/import`, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ leadIds: ids }),
                      });
                      const json = await res.json().catch(() => ({}));
                      if (res.ok && json.ok) {
                        setSelected(new Set());
                        loadRun(runId!);
                      } else {
                        setErr(json.error ?? "Import failed");
                      }
                    } catch (e) {
                      setErr(String(e));
                    } finally {
                      setImporting(false);
                    }
                  }}
                  disabled={importing}
                  style={{
                    padding: "0.5rem 1rem",
                    background: "#22c55e",
                    color: "#0f172a",
                    borderRadius: 6,
                    cursor: importing ? "not-allowed" : "pointer",
                    fontWeight: 600,
                  }}
                >
                  {importing ? "Importing…" : "Import Verified Leads"}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {runData && runData.leads.length > 0 && (
        <div style={{ marginBottom: "2rem" }}>
          <h2 style={{ fontSize: "1rem", fontWeight: 600, marginBottom: "1rem" }}>
            Discovery Results
          </h2>
          <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", marginBottom: "1rem" }}>
            <button
              onClick={selectAll}
              style={{ padding: "0.5rem 1rem", background: "#334155", borderRadius: 4, cursor: "pointer" }}
            >
              Select All
            </button>
            <button
              onClick={unselectAll}
              style={{ padding: "0.5rem 1rem", background: "#334155", borderRadius: 4, cursor: "pointer" }}
            >
              Unselect All
            </button>
            <button
              onClick={importSelected}
              disabled={selected.size === 0 || importing}
              style={{
                padding: "0.5rem 1rem",
                background: selected.size > 0 && !importing ? "#22c55e" : "#334155",
                color: selected.size > 0 && !importing ? "#0f172a" : undefined,
                borderRadius: 4,
                cursor: selected.size === 0 || importing ? "not-allowed" : "pointer",
              }}
            >
              {importing ? "Importing…" : `Import Selected Leads (${selected.size})`}
            </button>
          </div>

          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid #334155", textAlign: "left" }}>
                  <th style={{ padding: "0.75rem" }}>Select</th>
                  <th style={{ padding: "0.75rem" }}>Company</th>
                  <th style={{ padding: "0.75rem" }}>Domain</th>
                  <th style={{ padding: "0.75rem" }}>Contact</th>
                  <th style={{ padding: "0.75rem" }}>Industry</th>
                  <th style={{ padding: "0.75rem" }}>Email</th>
                  <th style={{ padding: "0.75rem" }}>Email Safety</th>
                  <th style={{ padding: "0.75rem" }}>Method</th>
                  <th style={{ padding: "0.75rem" }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {runData.leads.map((l) => (
                  <tr key={l.id} style={{ borderBottom: "1px solid #334155" }}>
                    <td style={{ padding: "0.75rem" }}>
                      {!l.imported ? (
                        <input
                          type="checkbox"
                          checked={selected.has(l.id)}
                          onChange={() => toggleSelect(l.id)}
                        />
                      ) : (
                        "—"
                      )}
                    </td>
                    <td style={{ padding: "0.75rem" }}>{l.business_name ?? "—"}</td>
                    <td style={{ padding: "0.75rem" }}>{l.domain ?? "—"}</td>
                    <td style={{ padding: "0.75rem" }}>{l.contact_name ?? "—"}</td>
                    <td style={{ padding: "0.75rem" }}>{l.industry ?? "—"}</td>
                    <td style={{ padding: "0.75rem" }}>{l.email}</td>
                    <td style={{ padding: "0.75rem" }}>{l.imported ? "Valid" : "Pending"}</td>
                    <td style={{ padding: "0.75rem" }}>
                      {l.discovery_method === "scraped_email"
                        ? "scraped"
                        : l.discovery_method === "pattern_generated"
                          ? "pattern"
                          : l.discovery_method ?? "—"}
                    </td>
                    <td style={{ padding: "0.75rem" }}>{l.imported ? "Imported" : "Pending"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <p style={{ marginTop: "2rem" }}>
        <Link href="/leads" style={{ color: "#94a3b8" }}>
          ← Back to Leads
        </Link>
      </p>
    </div>
  );
}
