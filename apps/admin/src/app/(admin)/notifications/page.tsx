"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";

type NotificationRow = {
  id: string;
  priority: string;
  title: string;
  message: string;
  type: string;
  entityType: string;
  entityId: string | null;
  read: boolean;
  readAt?: string | null;
  createdAt: string;
};

type ListResp = {
  notifications: NotificationRow[];
  totalCount: number;
  unreadCount: number;
  page: number;
  pageSize: number;
};

type PreferenceRow = {
  type: string;
  inApp: boolean;
  email: boolean;
};

const PAGE_SIZE = 25;
const LIST_ENDPOINT = "/api/admin/v4/notifications";
const PREFS_ENDPOINT = "/api/admin/v4/notification-preferences";
const SMTP_STATUS_ENDPOINT = "/api/admin/v4/system/smtp-status";

type SmtpStatusData = {
  smtp: "online" | "error" | "unconfigured";
  smtpError: string | null;
  eventOutbox: "idle" | "backed_up";
  eventOutboxPendingCount: number;
  lastEmailSentAt: string | null;
  lastSmtpVerifiedAt: string | null;
  lastSmtpError: string | null;
};

function StatusDot({ status }: { status: "green" | "yellow" | "red" | "gray" }) {
  const color =
    status === "green"
      ? "#22c55e"
      : status === "yellow"
        ? "#eab308"
        : status === "red"
          ? "#ef4444"
          : "#6b7280";
  return (
    <span
      style={{
        display: "inline-block",
        width: 8,
        height: 8,
        borderRadius: "50%",
        background: color,
        boxShadow: `0 0 6px ${color}88`,
        marginRight: 6,
        flexShrink: 0,
      }}
    />
  );
}

function SmtpStatusPanel() {
  const [data, setData] = useState<SmtpStatusData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const resp = await fetch(SMTP_STATUS_ENDPOINT, { cache: "no-store", credentials: "include" });
      const json = await resp.json().catch(() => null);
      if (!resp.ok || !json?.ok) throw new Error(json?.error ?? "Failed");
      setData(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load status");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const smtpDot: "green" | "yellow" | "red" | "gray" = !data
    ? "gray"
    : data.smtp === "online"
      ? "green"
      : data.smtp === "error"
        ? "red"
        : "gray";

  const outboxDot: "green" | "yellow" | "red" | "gray" = !data
    ? "gray"
    : data.eventOutbox === "idle"
      ? "green"
      : "yellow";

  return (
    <div
      style={{
        border: "1px solid rgba(148,163,184,0.2)",
        borderRadius: 12,
        padding: "14px 16px",
        background: "rgba(2,6,23,0.4)",
        marginBottom: 16,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <div style={{ fontWeight: 900, fontSize: 14, color: "rgba(226,232,240,0.95)" }}>
          Notification System Status
        </div>
        <button onClick={() => void refresh()} style={{ ...buttonStyle, marginTop: 0, fontSize: 11, padding: "4px 10px" }}>
          Refresh
        </button>
      </div>

      {loading && <div style={{ fontSize: 12, color: "rgba(226,232,240,0.55)" }}>Checking status...</div>}
      {error && <div style={{ fontSize: 12, color: "rgba(254,202,202,0.9)" }}>{error}</div>}

      {!loading && data && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 10 }}>
          <StatusItem
            dot={smtpDot}
            label="SMTP Email Service"
            value={data.smtp === "online" ? "Online" : data.smtp === "error" ? "Error" : "Unconfigured"}
            detail={data.smtpError ?? undefined}
          />
          <StatusItem
            dot={outboxDot}
            label="Event Outbox"
            value={data.eventOutbox === "idle" ? "Idle" : "Backed Up"}
            detail={`${data.eventOutboxPendingCount} pending`}
          />
          <StatusItem
            dot={data.lastEmailSentAt ? "green" : "gray"}
            label="Last Email Sent"
            value={data.lastEmailSentAt ? data.lastEmailSentAt.slice(0, 19).replace("T", " ") : "—"}
          />
          <StatusItem
            dot={data.lastSmtpVerifiedAt ? (data.smtp === "online" ? "green" : "red") : "gray"}
            label="SMTP Last Verified"
            value={data.lastSmtpVerifiedAt ? data.lastSmtpVerifiedAt.slice(0, 19).replace("T", " ") : "—"}
          />
        </div>
      )}
    </div>
  );
}

function StatusItem({
  dot,
  label,
  value,
  detail,
}: {
  dot: "green" | "yellow" | "red" | "gray";
  label: string;
  value: string;
  detail?: string;
}) {
  return (
    <div
      style={{
        border: "1px solid rgba(148,163,184,0.15)",
        borderRadius: 8,
        padding: "10px 12px",
        background: "rgba(15,23,42,0.5)",
      }}
    >
      <div style={{ fontSize: 11, color: "rgba(148,163,184,0.85)", fontWeight: 700, marginBottom: 4 }}>{label}</div>
      <div style={{ display: "flex", alignItems: "center", fontSize: 13, fontWeight: 900, color: "rgba(226,232,240,0.95)" }}>
        <StatusDot status={dot} />
        {value}
      </div>
      {detail && <div style={{ fontSize: 11, color: "rgba(148,163,184,0.7)", marginTop: 2 }}>{detail}</div>}
    </div>
  );
}

function priorityColor(priority: string): React.CSSProperties {
  const p = String(priority ?? "").toUpperCase();
  if (p === "CRITICAL") {
    return { color: "rgba(254,202,202,0.98)", background: "rgba(239,68,68,0.18)", borderColor: "rgba(239,68,68,0.35)" };
  }
  if (p === "HIGH") {
    return { color: "rgba(254,240,138,0.98)", background: "rgba(250,204,21,0.18)", borderColor: "rgba(250,204,21,0.35)" };
  }
  if (p === "LOW") {
    return { color: "rgba(203,213,225,0.92)", background: "rgba(100,116,139,0.2)", borderColor: "rgba(148,163,184,0.35)" };
  }
  return { color: "rgba(226,232,240,0.95)", background: "rgba(148,163,184,0.12)", borderColor: "rgba(148,163,184,0.28)" };
}

function readLabel(n: NotificationRow): string {
  if (n.read || n.readAt) return "Read";
  return "Unread";
}

function toQuery(filters: { priority: string; type: string; read: string; page: number }) {
  const url = new URL("http://internal");
  if (filters.priority) url.searchParams.set("priority", filters.priority);
  if (filters.type) url.searchParams.set("type", filters.type);
  if (filters.read) url.searchParams.set("read", filters.read);
  url.searchParams.set("page", String(filters.page));
  url.searchParams.set("pageSize", String(PAGE_SIZE));
  const q = url.searchParams.toString();
  return q ? `?${q}` : "";
}

function formatApiError(endpoint: string, status: number, json: any): string {
  const message = String(json?.error?.message ?? json?.error ?? "Request failed").trim();
  return `Admin API Error (${status}) Endpoint: ${endpoint}${message ? ` - ${message}` : ""}`;
}

export default function NotificationsPage() {
  const [priority, setPriority] = useState("CRITICAL");
  const [type, setType] = useState("");
  const [read, setRead] = useState("");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<NotificationRow[]>([]);
  const [prefs, setPrefs] = useState<PreferenceRow[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [unreadCount, setUnreadCount] = useState(0);
  const [savingPrefs, setSavingPrefs] = useState(false);

  const filters = useMemo(() => ({ priority, type, read, page }), [priority, type, read, page]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const endpoint = `${LIST_ENDPOINT}${toQuery(filters)}`;
      const [resp, prefsResp] = await Promise.all([
        fetch(endpoint, { cache: "no-store", credentials: "include" }),
        fetch(PREFS_ENDPOINT, { cache: "no-store", credentials: "include" }),
      ]);
      const json = await resp.json().catch(() => null);
      if (!resp.ok || !json || json.ok !== true) {
        setError(formatApiError(LIST_ENDPOINT, resp.status, json));
        return;
      }

      const data = (json.data ?? {}) as Partial<ListResp>;
      setRows(Array.isArray(data.notifications) ? data.notifications : []);
      setTotalCount(Number(data.totalCount ?? 0));
      setUnreadCount(Number(data.unreadCount ?? 0));

      const prefsJson = await prefsResp.json().catch(() => null);
      if (prefsResp.ok && prefsJson?.ok === true) {
        const prefItems = Array.isArray(prefsJson?.data?.items) ? prefsJson.data.items : Array.isArray(prefsJson?.items) ? prefsJson.items : [];
        setPrefs(prefItems as PreferenceRow[]);
      }
    } catch {
      setError("Failed to load notifications");
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    void load();
  }, [load]);

  async function markRead(id: string) {
    try {
      const endpoint = `/api/admin/v4/notifications/${encodeURIComponent(id)}/read`;
      const resp = await fetch(endpoint, { method: "POST", credentials: "include" });
      if (!resp.ok) {
        const json = await resp.json().catch(() => null);
        setError(formatApiError("/api/admin/v4/notifications/:id/read", resp.status, json));
        return;
      }
      await load();
    } catch {
      setError("Admin API Error (network) Endpoint: /api/admin/v4/notifications/:id/read - Request failed");
    }
  }

  async function markAllRead() {
    try {
      const resp = await fetch("/api/admin/v4/notifications/read-all", {
        method: "POST",
        credentials: "include",
      });
      if (!resp.ok) {
        const json = await resp.json().catch(() => null);
        setError(formatApiError("/api/admin/v4/notifications/read-all", resp.status, json));
        return;
      }
      await load();
    } catch {
      setError("Admin API Error (network) Endpoint: /api/admin/v4/notifications/read-all - Request failed");
    }
  }

  async function togglePreference(type: string, inApp: boolean) {
    setSavingPrefs(true);
    try {
      setPrefs((curr) => curr.map((row) => (row.type === type ? { ...row, inApp } : row)));
      const resp = await fetch(PREFS_ENDPOINT, {
        method: "PATCH",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ items: [{ type, inApp }] }),
      });
      if (!resp.ok) {
        const json = await resp.json().catch(() => null);
        setError(formatApiError(PREFS_ENDPOINT, resp.status, json));
      }
    } catch {
      setError("Admin API Error (network) Endpoint: /api/admin/v4/notification-preferences - Request failed");
    } finally {
      setSavingPrefs(false);
    }
  }

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  return (
    <div>
      <h1 style={{ margin: 0, fontSize: 22, fontWeight: 950 }}>Notification Control Center</h1>
      <p style={{ marginTop: 8, color: "rgba(226,232,240,0.72)" }}>
        Monitor delivery health, manage templates, audit logs, and test notifications.
      </p>

      {/* Control Center Navigation */}
      <div style={{ display: "flex", gap: 8, marginTop: 14, marginBottom: 16, flexWrap: "wrap" }}>
        {[
          { href: "/notifications/templates", label: "Email Templates", emoji: "✉" },
          { href: "/notifications/logs", label: "Delivery Logs", emoji: "📋" },
          { href: "/notifications/test", label: "Send Test", emoji: "🧪" },
        ].map((item) => (
          <Link
            key={item.href}
            href={item.href}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              padding: "8px 14px",
              border: "1px solid rgba(56,189,248,0.35)",
              borderRadius: 10,
              background: "rgba(56,189,248,0.1)",
              color: "rgba(125,211,252,0.95)",
              fontWeight: 900,
              fontSize: 13,
              textDecoration: "none",
              cursor: "pointer",
            }}
          >
            <span>{item.emoji}</span>
            {item.label}
          </Link>
        ))}
      </div>

      {/* SMTP Status Panel */}
      <SmtpStatusPanel />

      <div style={{ marginTop: 10, color: "rgba(191,219,254,0.95)", fontWeight: 900, fontSize: 12 }}>
        Unread: {unreadCount}
      </div>

      <div style={{ marginTop: 8 }}>
        <button onClick={() => void markAllRead()} style={buttonStyle}>Mark All Read</button>
      </div>

      <div style={{ marginTop: 12, display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
        <label style={labelStyle}>Priority</label>
        <select value={priority} onChange={(e) => { setPriority(e.target.value); setPage(1); }} style={inputStyle}>
          <option value="">All</option>
          <option value="LOW">LOW</option>
          <option value="NORMAL">NORMAL</option>
          <option value="HIGH">HIGH</option>
          <option value="CRITICAL">CRITICAL</option>
        </select>

        <label style={labelStyle}>Type</label>
        <input
          value={type}
          onChange={(e) => { setType(e.target.value.toUpperCase()); setPage(1); }}
          placeholder="e.g. JOB_REFUNDED"
          style={{ ...inputStyle, minWidth: 220 }}
        />

        <label style={labelStyle}>Read</label>
        <select value={read} onChange={(e) => { setRead(e.target.value); setPage(1); }} style={inputStyle}>
          <option value="">All</option>
          <option value="false">Unread only</option>
          <option value="true">Read only</option>
        </select>

        <button onClick={() => void load()} style={buttonStyle}>Refresh</button>
      </div>

      {loading ? <div style={{ marginTop: 12 }}>Loading notifications...</div> : null}
      {error ? <div style={{ marginTop: 12, color: "rgba(254,202,202,0.95)", fontWeight: 900 }}>{error}</div> : null}

      {!loading && !error && rows.length === 0 ? <div style={{ marginTop: 12 }}>No notifications found.</div> : null}

      {!loading && !error && rows.length > 0 ? (
        <div style={{ marginTop: 14, display: "grid", gap: 10 }}>
          {rows.map((n) => {
            const entityHref =
              n.entityType === "JOB" && n.entityId
                ? `/jobs/${encodeURIComponent(n.entityId)}`
                : n.entityType === "REFUND" && n.entityId
                  ? `/jobs/${encodeURIComponent(n.entityId)}`
                  : n.entityType === "FINANCIAL_INTEGRITY_ALERT" && n.entityId
                    ? `/finances/revenue`
                  : null;

            return (
              <div key={n.id} style={{ border: "1px solid rgba(148,163,184,0.2)", borderRadius: 12, padding: 12, background: "rgba(2,6,23,0.3)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                  <div>
                    <div style={{ fontWeight: 900 }}>{n.title}</div>
                    <div style={{ fontSize: 13, color: "rgba(226,232,240,0.86)", marginTop: 4 }}>{n.message}</div>
                    <div style={{ marginTop: 8, display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
                      <span style={{ ...pillStyle, ...priorityColor(n.priority) }}>{n.priority}</span>
                      <span style={pillStyle}>{n.type}</span>
                      <span style={pillStyle}>{n.entityType}</span>
                      <span style={pillStyle}>{readLabel(n)}</span>
                      {entityHref ? (
                        <a href={entityHref} style={{ color: "rgba(191,219,254,0.95)", textDecoration: "none", fontSize: 12, fontWeight: 900 }}>
                          Open entity
                        </a>
                      ) : null}
                    </div>
                  </div>

                  <div style={{ textAlign: "right", minWidth: 170 }}>
                    <div style={{ fontSize: 12, color: "rgba(226,232,240,0.65)" }}>
                      {n.createdAt?.slice(0, 19).replace("T", " ")}
                    </div>
                    {!n.read && !n.readAt ? (
                      <button onClick={() => void markRead(n.id)} style={buttonStyle}>Mark Read</button>
                    ) : (
                      <div style={{ marginTop: 8, fontSize: 12, color: "rgba(134,239,172,0.95)", fontWeight: 900 }}>Read</div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : null}

      <div style={{ marginTop: 14, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ color: "rgba(226,232,240,0.65)", fontSize: 12 }}>
          Page {page} / {totalPages} · Total {totalCount}
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1} style={pagerStyle}>Prev</button>
          <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages} style={pagerStyle}>Next</button>
        </div>
      </div>

      <div style={{ marginTop: 20, border: "1px solid rgba(148,163,184,0.2)", borderRadius: 12, padding: 12 }}>
        <div style={{ fontWeight: 900, fontSize: 16 }}>Notification Preferences</div>
        <div style={{ marginTop: 4, color: "rgba(226,232,240,0.7)", fontSize: 12 }}>
          Toggle in-app notification visibility by type.
        </div>
        <div style={{ marginTop: 12, display: "grid", gap: 8 }}>
          {prefs.map((pref) => (
            <label
              key={pref.type}
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                border: "1px solid rgba(148,163,184,0.2)",
                borderRadius: 10,
                padding: "8px 10px",
              }}
            >
              <span style={{ fontSize: 12, fontWeight: 900 }}>{pref.type}</span>
              <input
                type="checkbox"
                checked={pref.inApp}
                disabled={savingPrefs}
                onChange={(e) => void togglePreference(pref.type, e.target.checked)}
              />
            </label>
          ))}
          {!prefs.length ? <div style={{ color: "rgba(226,232,240,0.65)", fontSize: 12 }}>No preference rows found.</div> : null}
        </div>
      </div>
    </div>
  );
}

const labelStyle: React.CSSProperties = {
  fontSize: 12,
  color: "rgba(226,232,240,0.72)",
  fontWeight: 900,
};

const inputStyle: React.CSSProperties = {
  borderRadius: 10,
  border: "1px solid rgba(148,163,184,0.2)",
  background: "rgba(2,6,23,0.35)",
  color: "rgba(226,232,240,0.92)",
  padding: "8px 10px",
};

const buttonStyle: React.CSSProperties = {
  marginTop: 8,
  borderRadius: 10,
  border: "1px solid rgba(56,189,248,0.4)",
  background: "rgba(56,189,248,0.14)",
  color: "rgba(125,211,252,0.95)",
  fontWeight: 900,
  padding: "6px 10px",
  cursor: "pointer",
};

const pagerStyle: React.CSSProperties = {
  borderRadius: 10,
  border: "1px solid rgba(148,163,184,0.2)",
  background: "rgba(2,6,23,0.35)",
  color: "rgba(226,232,240,0.92)",
  padding: "6px 10px",
  fontWeight: 900,
  cursor: "pointer",
};

const pillStyle: React.CSSProperties = {
  border: "1px solid rgba(148,163,184,0.22)",
  borderRadius: 999,
  padding: "3px 8px",
  fontSize: 11,
  fontWeight: 900,
};
