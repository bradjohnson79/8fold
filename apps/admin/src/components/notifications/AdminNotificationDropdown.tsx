"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { getNotificationRoute } from "@/lib/notificationRoutes";

type Notification = {
  id: string;
  type: string;
  title: string;
  message: string;
  metadata?: Record<string, unknown> | null;
  entityId?: string | null;
  createdAt: string;
  read: boolean;
};

function timeAgo(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHr = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHr / 24);

  if (diffSec < 60) return "Just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHr < 24) return `${diffHr}h ago`;
  if (diffDay === 1) return "Yesterday";
  if (diffDay < 7) return `${diffDay}d ago`;
  return d.toLocaleDateString();
}

export function AdminNotificationDropdown() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const fetchNotifications = useCallback(async () => {
    try {
      const resp = await fetch(
        "/api/admin/v4/notifications?page=1&pageSize=10",
        { cache: "no-store", credentials: "include" }
      );
      if (resp.status === 401) return;
      const json = await resp.json().catch(() => null);
      const data = json?.data ?? json;
      if (data?.notifications) {
        setNotifications(Array.isArray(data.notifications) ? data.notifications : []);
      } else if (data?.rows) {
        setNotifications(Array.isArray(data.rows) ? data.rows : []);
      }
      const unread = Number(data?.unreadCount ?? 0) || 0;
      setUnreadCount(unread);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchNotifications();
    const id = window.setInterval(fetchNotifications, 20_000);
    return () => window.clearInterval(id);
  }, [fetchNotifications]);

  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  const handleNotificationClick = async (n: Notification) => {
    const route = getNotificationRoute({
      type: n.type,
      entityId: n.entityId ?? null,
      metadata: n.metadata ?? null,
    });
    setOpen(false);

    if (!n.read) {
      try {
        await fetch(`/api/admin/v4/notifications/${encodeURIComponent(n.id)}/read`, {
          method: "POST",
          credentials: "include",
        });
      } catch {
        // ignore
      }
    }

    router.push(route);
  };

  return (
    <div ref={containerRef} style={{ position: "relative" }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={unreadCount > 0 ? `Notifications (${unreadCount})` : "Notifications"}
        aria-expanded={open}
        aria-haspopup="true"
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 8,
          borderRadius: 999,
          border: "1px solid rgba(148,163,184,0.28)",
          background: "rgba(2,6,23,0.35)",
          color: "rgba(226,232,240,0.95)",
          fontSize: 12,
          fontWeight: 900,
          padding: "6px 10px",
          cursor: "pointer",
        }}
      >
        <span aria-hidden="true" style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 20, height: 20 }}>
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.4-1.4A2 2 0 0118 14.2V11a6 6 0 10-12 0v3.2a2 2 0 01-.6 1.4L4 17h5m6 0a3 3 0 01-6 0" />
          </svg>
        </span>
        {unreadCount > 0 && (
          <span
            style={{
              borderRadius: 999,
              padding: "1px 6px",
              background: "rgba(239,68,68,0.2)",
              border: "1px solid rgba(239,68,68,0.45)",
              color: "rgba(254,202,202,0.98)",
              minWidth: 22,
              textAlign: "center",
              fontSize: 11,
              lineHeight: 1.4,
            }}
          >
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div
          role="menu"
          aria-label="Notification list"
          style={{
            position: "absolute",
            right: 0,
            top: 40,
            width: 360,
            maxWidth: "min(360px, calc(100vw - 24px))",
            background: "rgb(15 23 42)",
            border: "1px solid rgb(51 65 85)",
            borderRadius: 12,
            boxShadow: "0 25px 50px -12px rgba(0,0,0,0.5)",
            zIndex: 50,
            overflow: "hidden",
          }}
        >
          <div style={{ padding: "12px 14px", borderBottom: "1px solid rgb(51 65 85)", fontWeight: 900, fontSize: 13 }}>
            Notifications
          </div>

          <div style={{ maxHeight: 360, overflowY: "auto" }}>
            {loading ? (
              <div style={{ padding: 24, textAlign: "center", color: "rgba(148,163,184,0.8)", fontSize: 13 }}>
                Loading…
              </div>
            ) : notifications.length === 0 ? (
              <div style={{ padding: 24, textAlign: "center", color: "rgba(148,163,184,0.8)", fontSize: 13 }}>
                No new notifications.
              </div>
            ) : (
              notifications.map((n) => (
                <button
                  key={n.id}
                  type="button"
                  role="menuitem"
                  onClick={() => handleNotificationClick(n)}
                  style={{
                    display: "block",
                    width: "100%",
                    padding: "10px 14px",
                    textAlign: "left",
                    border: "none",
                    borderBottom: "1px solid rgb(30 41 59)",
                    background: n.read ? "transparent" : "rgba(30 41 59 0.6)",
                    color: "rgba(226,232,240,0.95)",
                    fontSize: 13,
                    cursor: "pointer",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = "rgba(51 65 85 0.8)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = n.read ? "transparent" : "rgba(30 41 59 0.6)";
                  }}
                >
                  <div style={{ fontWeight: 700, marginBottom: 2 }}>{n.title}</div>
                  <div style={{ color: "rgba(148,163,184,0.9)", fontSize: 12, lineHeight: 1.35 }}>
                    {n.message}
                  </div>
                  <div style={{ marginTop: 4, fontSize: 11, color: "rgba(148,163,184,0.6)" }}>
                    {timeAgo(n.createdAt)}
                  </div>
                </button>
              ))
            )}
          </div>

          <div style={{ padding: "8px 14px", borderTop: "1px solid rgb(51 65 85)" }}>
            <Link
              href="/notifications"
              onClick={() => setOpen(false)}
              style={{
                display: "block",
                textAlign: "center",
                fontSize: 12,
                fontWeight: 700,
                color: "rgba(34,197,94,0.95)",
                textDecoration: "none",
              }}
            >
              View All Notifications →
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
