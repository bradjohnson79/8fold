"use client";

import { useCallback, useEffect, useState } from "react";

type AdminUser = {
  id: string;
  email: string;
  role: string;
  status: "ACTIVE" | "SUSPENDED";
  createdAt: string | null;
  disabledAt: string | null;
};

const ROLE_COLORS: Record<string, string> = {
  SUPER_ADMIN: "rgba(251,191,36,0.9)",
  ADMIN: "rgba(96,165,250,0.9)",
  OPERATOR: "rgba(148,163,184,0.8)",
  STANDARD: "rgba(148,163,184,0.6)",
};

const ROLE_BG: Record<string, string> = {
  SUPER_ADMIN: "rgba(251,191,36,0.12)",
  ADMIN: "rgba(96,165,250,0.12)",
  OPERATOR: "rgba(148,163,184,0.12)",
  STANDARD: "rgba(148,163,184,0.08)",
};

function RoleBadge({ role }: { role: string }) {
  const upper = role.toUpperCase();
  return (
    <span style={{
      display: "inline-block",
      padding: "2px 8px",
      borderRadius: 6,
      fontSize: 11,
      fontWeight: 800,
      color: ROLE_COLORS[upper] ?? "rgba(148,163,184,0.8)",
      background: ROLE_BG[upper] ?? "rgba(148,163,184,0.08)",
      border: `1px solid ${ROLE_COLORS[upper] ?? "rgba(148,163,184,0.2)"}`,
      letterSpacing: "0.04em",
    }}>
      {upper.replace("_", " ")}
    </span>
  );
}

function StatusBadge({ status }: { status: string }) {
  const active = status === "ACTIVE";
  return (
    <span style={{
      display: "inline-block",
      padding: "2px 8px",
      borderRadius: 6,
      fontSize: 11,
      fontWeight: 800,
      color: active ? "rgba(52,211,153,0.95)" : "rgba(239,68,68,0.9)",
      background: active ? "rgba(52,211,153,0.1)" : "rgba(239,68,68,0.1)",
      border: `1px solid ${active ? "rgba(52,211,153,0.3)" : "rgba(239,68,68,0.3)"}`,
    }}>
      {active ? "Active" : "Suspended"}
    </span>
  );
}

const inputStyle: React.CSSProperties = {
  background: "rgba(2,6,23,0.5)",
  border: "1px solid rgba(148,163,184,0.2)",
  color: "rgba(226,232,240,0.92)",
  borderRadius: 8,
  padding: "8px 10px",
  fontSize: 13,
  width: "100%",
  boxSizing: "border-box",
};

const selectStyle: React.CSSProperties = { ...inputStyle };

function fmtDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

export default function AdminUsersPage() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [working, setWorking] = useState<string | null>(null);

  // Create form state
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [form, setForm] = useState({ email: "", role: "ADMIN", password: "" });

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const resp = await fetch("/api/admin/v4/admin-users", { cache: "no-store", credentials: "include" });
      const json = await resp.json().catch(() => null);
      if (!resp.ok || !json?.ok) {
        setError(String(json?.error?.message ?? json?.error ?? "Failed to load admin users"));
        return;
      }
      setUsers(Array.isArray(json.data?.users) ? json.data.users : []);
    } catch {
      setError("Failed to load admin users");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function handleAction(id: string, action: "SUSPEND" | "ACTIVATE" | "DELETE") {
    if (action === "DELETE" && !confirm("Permanently delete this admin account? This cannot be undone.")) return;
    setWorking(id + action);
    setActionError(null);
    setActionSuccess(null);
    try {
      let resp: Response;
      if (action === "DELETE") {
        resp = await fetch(`/api/admin/v4/admin-users/${encodeURIComponent(id)}`, {
          method: "DELETE",
          credentials: "include",
        });
      } else {
        resp = await fetch(`/api/admin/v4/admin-users/${encodeURIComponent(id)}`, {
          method: "PATCH",
          credentials: "include",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ action }),
        });
      }
      const json = await resp.json().catch(() => null);
      if (!resp.ok || !json?.ok) {
        setActionError(String(json?.error?.message ?? json?.error ?? "Action failed"));
        return;
      }
      setActionSuccess(action === "DELETE" ? "Admin deleted." : action === "SUSPEND" ? "Admin suspended." : "Admin reactivated.");
      await load();
    } catch {
      setActionError("Action failed");
    } finally {
      setWorking(null);
    }
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    setCreateError(null);
    try {
      const resp = await fetch("/api/admin/v4/admin-users", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: form.email, role: form.role, password: form.password }),
      });
      const json = await resp.json().catch(() => null);
      if (!resp.ok || !json?.ok) {
        setCreateError(String(json?.error?.message ?? json?.error ?? "Failed to create admin"));
        return;
      }
      setForm({ email: "", role: "ADMIN", password: "" });
      setShowCreate(false);
      setActionSuccess(`Admin created: ${form.email}`);
      await load();
    } catch {
      setCreateError("Failed to create admin");
    } finally {
      setCreating(false);
    }
  }

  return (
    <div>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 950, color: "rgba(226,232,240,0.98)" }}>
            Admin Users
          </h1>
          <p style={{ marginTop: 6, color: "rgba(226,232,240,0.55)", fontSize: 13 }}>
            Manage administrative access to the 8Fold control center.
          </p>
        </div>
        <button
          onClick={() => { setShowCreate(!showCreate); setCreateError(null); }}
          style={{
            flexShrink: 0,
            borderRadius: 8,
            border: "1px solid rgba(52,211,153,0.35)",
            background: "rgba(52,211,153,0.12)",
            color: "rgba(52,211,153,0.9)",
            padding: "8px 14px",
            fontSize: 12,
            fontWeight: 900,
            cursor: "pointer",
          }}
        >
          {showCreate ? "Cancel" : "+ Create Admin"}
        </button>
      </div>

      {/* Create form */}
      {showCreate && (
        <div style={{ marginTop: 16, borderRadius: 12, border: "1px solid rgba(52,211,153,0.2)", background: "rgba(15,23,42,0.6)", padding: 20 }}>
          <h3 style={{ margin: "0 0 14px", fontSize: 14, fontWeight: 900, color: "rgba(52,211,153,0.9)" }}>Create New Admin</h3>
          <form onSubmit={(e) => void handleCreate(e)} style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
            <div>
              <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "rgba(226,232,240,0.5)", marginBottom: 4 }}>Email</label>
              <input
                type="email"
                required
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                placeholder="admin@8fold.app"
                style={inputStyle}
              />
            </div>
            <div>
              <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "rgba(226,232,240,0.5)", marginBottom: 4 }}>Role</label>
              <select
                value={form.role}
                onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}
                style={selectStyle}
              >
                <option value="OPERATOR">OPERATOR</option>
                <option value="ADMIN">ADMIN</option>
                <option value="SUPER_ADMIN">SUPER_ADMIN</option>
              </select>
            </div>
            <div>
              <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "rgba(226,232,240,0.5)", marginBottom: 4 }}>Temporary Password</label>
              <input
                type="password"
                required
                minLength={8}
                value={form.password}
                onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                placeholder="Min. 8 characters"
                style={inputStyle}
              />
            </div>
            <div style={{ gridColumn: "1 / -1", display: "flex", gap: 10, alignItems: "center" }}>
              <button
                type="submit"
                disabled={creating}
                style={{
                  borderRadius: 8,
                  border: "1px solid rgba(52,211,153,0.35)",
                  background: creating ? "rgba(52,211,153,0.06)" : "rgba(52,211,153,0.15)",
                  color: "rgba(52,211,153,0.9)",
                  padding: "8px 20px",
                  fontSize: 12,
                  fontWeight: 900,
                  cursor: creating ? "not-allowed" : "pointer",
                  opacity: creating ? 0.6 : 1,
                }}
              >
                {creating ? "Creating…" : "Create Admin"}
              </button>
              {createError && (
                <span style={{ fontSize: 12, color: "rgba(254,202,202,0.9)", fontWeight: 700 }}>{createError}</span>
              )}
            </div>
          </form>
        </div>
      )}

      {/* Feedback banners */}
      {actionSuccess && (
        <div style={{ marginTop: 14, borderRadius: 8, background: "rgba(52,211,153,0.1)", border: "1px solid rgba(52,211,153,0.25)", padding: "10px 14px", fontSize: 13, color: "rgba(52,211,153,0.9)", fontWeight: 700 }}>
          {actionSuccess}
        </div>
      )}
      {actionError && (
        <div style={{ marginTop: 14, borderRadius: 8, background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.25)", padding: "10px 14px", fontSize: 13, color: "rgba(254,202,202,0.9)", fontWeight: 700 }}>
          {actionError}
        </div>
      )}

      {/* Table */}
      <div style={{ marginTop: 20, borderRadius: 14, border: "1px solid rgba(148,163,184,0.14)", background: "rgba(2,6,23,0.35)", overflow: "hidden" }}>
        {loading ? (
          <div style={{ padding: 32, textAlign: "center", color: "rgba(226,232,240,0.4)", fontSize: 13 }}>Loading admin users…</div>
        ) : error ? (
          <div style={{ padding: 32, textAlign: "center", color: "rgba(254,202,202,0.9)", fontSize: 13 }}>{error}</div>
        ) : users.length === 0 ? (
          <div style={{ padding: 32, textAlign: "center", color: "rgba(226,232,240,0.4)", fontSize: 13 }}>No admin users found.</div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid rgba(148,163,184,0.12)" }}>
                {["Email", "Role", "Status", "Created", "Actions"].map((h) => (
                  <th key={h} style={{
                    padding: "10px 14px",
                    textAlign: "left",
                    fontSize: 10,
                    fontWeight: 900,
                    color: "rgba(226,232,240,0.4)",
                    textTransform: "uppercase",
                    letterSpacing: "0.07em",
                    whiteSpace: "nowrap",
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {users.map((user, i) => (
                <tr
                  key={user.id}
                  style={{
                    borderBottom: i < users.length - 1 ? "1px solid rgba(148,163,184,0.08)" : "none",
                    background: i % 2 === 0 ? "transparent" : "rgba(148,163,184,0.02)",
                  }}
                >
                  <td style={{ padding: "12px 14px", fontSize: 13, color: "rgba(226,232,240,0.88)" }}>
                    {user.email}
                  </td>
                  <td style={{ padding: "12px 14px" }}>
                    <RoleBadge role={user.role} />
                  </td>
                  <td style={{ padding: "12px 14px" }}>
                    <StatusBadge status={user.status} />
                  </td>
                  <td style={{ padding: "12px 14px", fontSize: 12, color: "rgba(226,232,240,0.5)" }}>
                    {fmtDate(user.createdAt)}
                  </td>
                  <td style={{ padding: "12px 14px" }}>
                    <div style={{ display: "flex", gap: 6 }}>
                      {user.status === "ACTIVE" ? (
                        <ActionBtn
                          label="Suspend"
                          disabled={!!working}
                          color="rgba(239,68,68,0.85)"
                          bg="rgba(239,68,68,0.1)"
                          border="rgba(239,68,68,0.3)"
                          onClick={() => void handleAction(user.id, "SUSPEND")}
                        />
                      ) : (
                        <ActionBtn
                          label="Activate"
                          disabled={!!working}
                          color="rgba(52,211,153,0.9)"
                          bg="rgba(52,211,153,0.1)"
                          border="rgba(52,211,153,0.3)"
                          onClick={() => void handleAction(user.id, "ACTIVATE")}
                        />
                      )}
                      <ActionBtn
                        label="Delete"
                        disabled={!!working}
                        color="rgba(148,163,184,0.7)"
                        bg="rgba(148,163,184,0.08)"
                        border="rgba(148,163,184,0.2)"
                        onClick={() => void handleAction(user.id, "DELETE")}
                      />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Legend */}
      <div style={{ marginTop: 16, display: "flex", gap: 16, flexWrap: "wrap" }}>
        {[["SUPER_ADMIN", "Gold"], ["ADMIN", "Blue"], ["OPERATOR", "Grey"]].map(([role, color]) => (
          <div key={role} style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <RoleBadge role={role} />
            <span style={{ fontSize: 11, color: "rgba(226,232,240,0.4)" }}>{color}</span>
          </div>
        ))}
        <div style={{ flex: 1, fontSize: 11, color: "rgba(226,232,240,0.35)", textAlign: "right" }}>
          Suspend/Activate and Delete require SUPER_ADMIN role
        </div>
      </div>
    </div>
  );
}

function ActionBtn({
  label,
  onClick,
  disabled,
  color,
  bg,
  border,
}: {
  label: string;
  onClick: () => void;
  disabled: boolean;
  color: string;
  bg: string;
  border: string;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        borderRadius: 6,
        border: `1px solid ${border}`,
        background: bg,
        color,
        padding: "4px 10px",
        fontSize: 11,
        fontWeight: 800,
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.5 : 1,
        whiteSpace: "nowrap",
      }}
    >
      {label}
    </button>
  );
}
