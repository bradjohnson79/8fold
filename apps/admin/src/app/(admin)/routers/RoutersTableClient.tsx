"use client";

import React, { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { BulkActionBar } from "@/components/admin/BulkActionBar";
import { DeleteConfirmModal } from "@/components/admin/DeleteConfirmModal";
import { EditUserModal } from "@/components/admin/EditUserModal";
import { AdminToast } from "@/components/admin/AdminToast";

type UserRow = {
  id: string;
  role: "ROUTER";
  name: string | null;
  email: string | null;
  phone: string | null;
  country: string | null;
  regionCode: string | null;
  city: string | null;
  status: string;
  createdAt: string;
  badges: string[];
};

type Props = {
  rows: UserRow[];
  totalCount: number;
  page: number;
  pageSize: number;
  q: string;
  status: string;
  error: string | null;
};

function formatBadgeLabel(badge: string): string {
  const b = String(badge ?? "").trim().toUpperCase();
  if (!b) return "UNKNOWN";
  if (b === "STRIPE_VERIFIED") return "Stripe Verified";
  if (b === "STRIPE_CONNECTED_PENDING_VERIFICATION") return "Stripe Pending Verification";
  if (b === "STRIPE_NOT_CONNECTED") return "Stripe Not Connected";
  if (b === "PROFILE_SYNCED") return "Profile Synced";
  if (b === "PROFILE_CANONICAL_ONLY") return "Profile Canonical Only";
  if (b === "PROFILE_V4_ONLY") return "Profile V4 Only";
  if (b === "PROFILE_MISSING") return "Profile Missing";
  if (b === "SENIOR") return "Senior Router";
  return b.replace(/_/g, " ");
}

const ACTION_LABELS: Record<string, string> = {
  suspend_1w: "suspended for 1 week",
  suspend_1m: "suspended for 1 month",
  suspend_3m: "suspended for 3 months",
  suspend_6m: "suspended for 6 months",
  archive: "archived",
  delete: "deleted",
};

const tdStyle: React.CSSProperties = {
  padding: "10px 10px",
  borderBottom: "1px solid rgba(148,163,184,0.08)",
  color: "rgba(226,232,240,0.90)",
  fontSize: 13,
  verticalAlign: "top",
};

const linkStyle: React.CSSProperties = {
  color: "rgba(191,219,254,0.95)",
  textDecoration: "none",
  fontWeight: 900,
};

const pagerLinkStyle: React.CSSProperties = {
  border: "1px solid rgba(148,163,184,0.14)",
  borderRadius: 12,
  padding: "8px 10px",
  color: "rgba(191,219,254,0.95)",
  textDecoration: "none",
  fontWeight: 900,
};

function qs(sp: Record<string, string | undefined>): string {
  const u = new URL("http://internal");
  for (const [k, v] of Object.entries(sp)) {
    if (v == null) continue;
    const s = String(v).trim();
    if (!s) continue;
    u.searchParams.set(k, s);
  }
  const out = u.searchParams.toString();
  return out ? `?${out}` : "";
}

export function RoutersTableClient({ rows, totalCount, page, pageSize, q, status, error }: Props) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [toast, setToast] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [editUser, setEditUser] = useState<UserRow | null>(null);

  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));

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

  async function executeBulkAction(action: string) {
    const ids = Array.from(selected);
    try {
      const resp = await fetch("/api/admin/v4/users/bulk-action", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ids, action }),
      });
      const json = await resp.json().catch(() => null);
      const success = json?.data?.success ?? 0;
      const label = ACTION_LABELS[action] ?? action;
      setToast(`${success} ${success === 1 ? "account" : "accounts"} ${label}`);
      setSelected(new Set());
      router.refresh();
    } catch {
      setToast("Bulk action failed");
    }
  }

  function handleApply(action: string) {
    if (action === "edit") {
      if (selected.size !== 1) {
        setToast("Select exactly one user to edit");
        return;
      }
      const user = rows.find((r) => selected.has(r.id));
      if (user) setEditUser(user);
      return;
    }
    if (action === "archive" || action === "delete") {
      setPendingAction(action);
      return;
    }
    executeBulkAction(action);
  }

  return (
    <>
      <div style={{ marginTop: 12 }}>
        <BulkActionBar selectedCount={selected.size} onApply={handleApply} />
      </div>

      {error ? <div style={{ marginTop: 12, color: "rgba(254,202,202,0.95)", fontWeight: 900 }}>{error}</div> : null}

      <div style={{ marginTop: 12, overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "separate", borderSpacing: 0 }}>
          <thead>
            <tr>
              <th style={{ ...tdStyle, borderBottom: "1px solid rgba(148,163,184,0.12)", width: 40 }}>
                <input
                  type="checkbox"
                  checked={rows.length > 0 && selected.size === rows.length}
                  onChange={toggleAll}
                />
              </th>
              {["Name", "Email", "Phone", "Home Region", "Status", "Created", "Badges"].map((h) => (
                <th
                  key={h}
                  style={{
                    textAlign: "left",
                    fontSize: 12,
                    color: "rgba(226,232,240,0.70)",
                    fontWeight: 900,
                    padding: "10px 10px",
                    borderBottom: "1px solid rgba(148,163,184,0.12)",
                  }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {error ? (
              <tr>
                <td colSpan={8} style={{ padding: 12, color: "rgba(254,202,202,0.95)", fontWeight: 900 }}>
                  {error}
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={8} style={{ padding: 12, color: "rgba(226,232,240,0.65)" }}>
                  No routers found.
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={r.id}>
                  <td style={tdStyle}>
                    <input
                      type="checkbox"
                      checked={selected.has(r.id)}
                      onChange={() => toggleSelect(r.id)}
                    />
                  </td>
                  <td style={tdStyle}>
                    <a href={`/routers/${encodeURIComponent(r.id)}`} style={linkStyle}>
                      {r.name ?? "\u2014"}
                    </a>
                  </td>
                  <td style={tdStyle}>{r.email ?? "\u2014"}</td>
                  <td style={tdStyle}>{r.phone ?? "\u2014"}</td>
                  <td style={tdStyle}>{[r.city, r.regionCode, r.country].filter(Boolean).join(", ") || "\u2014"}</td>
                  <td style={tdStyle}>{r.status}</td>
                  <td style={tdStyle}>{r.createdAt.slice(0, 10)}</td>
                  <td style={tdStyle}>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      {(r.badges ?? []).map((b) => (
                        <span
                          key={b}
                          style={{
                            border: "1px solid rgba(148,163,184,0.2)",
                            borderRadius: 999,
                            padding: "4px 8px",
                            fontSize: 11,
                            fontWeight: 900,
                          }}
                        >
                          {formatBadgeLabel(b)}
                        </span>
                      ))}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div style={{ marginTop: 12, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ color: "rgba(226,232,240,0.65)", fontSize: 12 }}>
          Showing {(page - 1) * pageSize + (rows.length ? 1 : 0)}-{(page - 1) * pageSize + rows.length} of {totalCount}
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <a
            href={`/routers${qs({ q: q || undefined, status: status || undefined, page: String(Math.max(1, page - 1)), pageSize: String(pageSize) })}`}
            style={{ ...pagerLinkStyle, pointerEvents: page <= 1 ? "none" : "auto", opacity: page <= 1 ? 0.45 : 1 }}
          >
            &larr; Prev
          </a>
          <div style={{ color: "rgba(226,232,240,0.72)", fontSize: 12, fontWeight: 900 }}>
            Page {page} / {totalPages}
          </div>
          <a
            href={`/routers${qs({ q: q || undefined, status: status || undefined, page: String(Math.min(totalPages, page + 1)), pageSize: String(pageSize) })}`}
            style={{ ...pagerLinkStyle, pointerEvents: page >= totalPages ? "none" : "auto", opacity: page >= totalPages ? 0.45 : 1 }}
          >
            Next &rarr;
          </a>
        </div>
      </div>

      {pendingAction && (
        <DeleteConfirmModal
          action={pendingAction}
          count={selected.size}
          onConfirm={() => {
            executeBulkAction(pendingAction);
            setPendingAction(null);
          }}
          onCancel={() => setPendingAction(null)}
        />
      )}

      {editUser && (
        <EditUserModal
          user={editUser}
          onClose={() => setEditUser(null)}
          onSaved={() => {
            setEditUser(null);
            setSelected(new Set());
            setToast("Profile updated");
            router.refresh();
          }}
        />
      )}

      {toast && <AdminToast message={toast} onDismiss={() => setToast(null)} />}
    </>
  );
}
