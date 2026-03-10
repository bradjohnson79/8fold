"use client";

import React, { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { JobsBulkActionBar } from "@/components/admin/JobsBulkActionBar";
import { DeleteConfirmModal } from "@/components/admin/DeleteConfirmModal";
import { AdminToast } from "@/components/admin/AdminToast";

type Party = { id: string; name: string | null; email: string | null; role: string | null };
type PaymentState = { label: string; secured: boolean; captured: boolean; paid: boolean; rawPaymentStatus: string | null; rawPayoutStatus: string | null };
type JobRow = {
  id: string;
  title: string;
  statusRaw: string;
  displayStatus: string;
  isMock: boolean;
  country: string;
  regionCode: string | null;
  city: string | null;
  createdAt: string;
  updatedAt: string;
  amountCents: number;
  paymentState: PaymentState;
  jobPoster: Party | null;
  router: Party | null;
  contractor: Party | null;
  archived: boolean;
  cancelRequestPending?: boolean;
};

const thStyle: React.CSSProperties = {
  textAlign: "left",
  fontSize: 12,
  color: "rgba(226,232,240,0.70)",
  fontWeight: 900,
  padding: "10px 10px",
  borderBottom: "1px solid rgba(148,163,184,0.12)",
  whiteSpace: "nowrap",
};

const tdStyle: React.CSSProperties = {
  padding: "10px 10px",
  borderBottom: "1px solid rgba(148,163,184,0.08)",
  color: "rgba(226,232,240,0.90)",
  fontSize: 13,
  verticalAlign: "top",
};

function statusPill(label: string) {
  const upper = label.toUpperCase();
  const tone = upper.includes("REJECT") || upper.includes("FLAG") ? "rgba(248,113,113,0.12)" : "rgba(2,6,23,0.25)";
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: "6px 10px",
        borderRadius: 999,
        border: "1px solid rgba(148,163,184,0.14)",
        background: tone,
        fontSize: 12,
        fontWeight: 900,
      }}
    >
      {upper}
    </span>
  );
}

function paymentPill(state: PaymentState) {
  const tone = state.label === "PAID" ? "rgba(34,197,94,0.14)" : state.label === "CAPTURED" ? "rgba(56,189,248,0.14)" : "rgba(251,191,36,0.14)";
  return (
    <span
      title={`payment=${state.rawPaymentStatus ?? "n/a"} payout=${state.rawPayoutStatus ?? "n/a"}`}
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: "6px 10px",
        borderRadius: 999,
        border: "1px solid rgba(148,163,184,0.14)",
        background: tone,
        fontSize: 12,
        fontWeight: 900,
      }}
    >
      {state.label}
    </span>
  );
}

function currency(cents: number) {
  return `$${(Number(cents || 0) / 100).toFixed(2)}`;
}

function person(party: Party | null) {
  if (!party) return "—";
  return (
    <div>
      <div>{party.name ?? "—"}</div>
      <div style={{ color: "rgba(226,232,240,0.55)", fontSize: 12 }}>{party.email ?? "—"}</div>
    </div>
  );
}

type Props = {
  rows: JobRow[];
  loadError: string | null;
};

export function JobsTableClient({ rows, loadError }: Props) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [toast, setToast] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<"archive" | "delete" | null>(null);
  const [applying, setApplying] = useState(false);

  const toggleSelect = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleAll = useCallback(() => {
    setSelected((prev) => (prev.size === rows.length ? new Set() : new Set(rows.map((r) => r.id))));
  }, [rows]);

  async function executeBulkAction(action: "archive" | "delete") {
    const ids = Array.from(selected);
    setApplying(true);
    try {
      const resp = await fetch("/api/admin/v4/super/jobs/bulk", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action, jobIds: ids }),
      });
      const json = await resp.json().catch(() => null);

      if (!resp.ok) {
        const msg = json?.error?.message ?? json?.message ?? `HTTP ${resp.status}`;
        if (resp.status === 403) {
          setToast("Requires Super Admin authorization");
        } else {
          setToast(msg);
        }
        setPendingAction(null);
        return;
      }

      const data = json?.data ?? {};
      const archived = data.archived ?? 0;
      const deleted = data.deleted ?? 0;
      const failed = data.failed ?? 0;

      if (action === "archive") {
        if (failed > 0 && archived > 0) {
          setToast(`${archived} archived, ${failed} failed`);
        } else if (failed > 0) {
          setToast(`${failed} failed`);
        } else {
          setToast(`${archived} job${archived === 1 ? "" : "s"} archived`);
        }
      } else {
        if (failed > 0 && deleted > 0) {
          const details = data.failedDetails ?? [];
          const reasons = details.slice(0, 2).map((f: { id: string; reason: string }) => `${f.id}: ${f.reason}`).join("; ");
          setToast(`${deleted} deleted, ${failed} failed. ${reasons}`);
        } else if (failed > 0) {
          const details = data.failedDetails ?? [];
          const first = details[0];
          setToast(first ? `${first.reason}` : `${failed} failed`);
        } else {
          setToast(`${deleted} job${deleted === 1 ? "" : "s"} deleted`);
        }
      }

      setSelected(new Set());
      setPendingAction(null);
      router.refresh();
    } catch {
      setToast("Bulk action failed");
      setPendingAction(null);
    } finally {
      setApplying(false);
    }
  }

  function handleApply(action: "archive" | "delete") {
    if (action === "delete") {
      setPendingAction("delete");
      return;
    }
    setPendingAction("archive");
  }

  function handleConfirmPending() {
    if (pendingAction) {
      executeBulkAction(pendingAction);
    }
  }

  return (
    <>
      {rows.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <JobsBulkActionBar selectedCount={selected.size} onApply={handleApply} />
        </div>
      )}

      {toast ? <AdminToast message={toast} onDismiss={() => setToast(null)} /> : null}

      {pendingAction && (
        <DeleteConfirmModal
          action={pendingAction}
          count={selected.size}
          onConfirm={handleConfirmPending}
          onCancel={() => setPendingAction(null)}
          entityLabel="job"
          entityPlural="jobs"
        />
      )}

      <div style={{ marginTop: 12, overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "separate", borderSpacing: 0 }}>
          <thead>
            <tr>
              <th style={{ ...thStyle, width: 40 }}>
                <input
                  type="checkbox"
                  checked={rows.length > 0 && selected.size === rows.length}
                  onChange={toggleAll}
                  disabled={rows.length === 0}
                />
              </th>
              {["Job ID", "Title", "Status", "Is Mock", "Location", "Created", "Updated", "Job Poster", "Router", "Contractor", "Price/Budget", "Payment"].map((h) => (
                <th key={h} style={thStyle}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loadError ? (
              <tr>
                <td colSpan={13} style={{ ...tdStyle, color: "rgba(254,202,202,0.95)", fontWeight: 900 }}>
                  {loadError}
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={13} style={tdStyle}>
                  No jobs found for current filters.
                </td>
              </tr>
            ) : (
              rows.map((j) => {
                const displayStatus = j.isMock ? "IN_PROGRESS" : j.displayStatus || j.statusRaw;
                return (
                  <tr key={j.id}>
                    <td style={tdStyle}>
                      <input
                        type="checkbox"
                        checked={selected.has(j.id)}
                        onChange={() => toggleSelect(j.id)}
                      />
                    </td>
                    <td style={tdStyle}>
                      <a href={`/jobs/${encodeURIComponent(j.id)}`} style={{ color: "rgba(191,219,254,0.95)", textDecoration: "none", fontWeight: 900 }}>
                        {j.id}
                      </a>
                    </td>
                    <td style={tdStyle}>{j.title}</td>
                    <td style={tdStyle}>
                      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                        {statusPill(displayStatus)}
                        {j.cancelRequestPending && (
                          <span
                            style={{
                              fontSize: 10,
                              fontWeight: 900,
                              letterSpacing: 0.4,
                              padding: "2px 7px",
                              borderRadius: 6,
                              background: "rgba(251,146,60,0.22)",
                              color: "rgba(253,186,116,0.95)",
                              border: "1px solid rgba(251,146,60,0.35)",
                              whiteSpace: "nowrap",
                            }}
                          >
                            Cancellation Requested
                          </span>
                        )}
                      </div>
                    </td>
                    <td style={tdStyle}>{j.isMock ? statusPill("MOCK") : "REAL"}</td>
                    <td style={tdStyle}>{[j.city, j.regionCode, j.country].filter(Boolean).join(", ") || "—"}</td>
                    <td style={tdStyle}>{j.createdAt.slice(0, 19).replace("T", " ")}</td>
                    <td style={tdStyle}>{j.updatedAt.slice(0, 19).replace("T", " ")}</td>
                    <td style={tdStyle}>{person(j.jobPoster)}</td>
                    <td style={tdStyle}>{person(j.router)}</td>
                    <td style={tdStyle}>{person(j.contractor)}</td>
                    <td style={tdStyle}>{currency(j.amountCents)}</td>
                    <td style={tdStyle}>{paymentPill(j.paymentState)}</td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
