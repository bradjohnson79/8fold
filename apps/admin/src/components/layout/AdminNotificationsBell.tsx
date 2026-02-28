"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type CountState = {
  unread: number;
  failed: boolean;
};

export function AdminNotificationsBell() {
  const [state, setState] = useState<CountState>({ unread: 0, failed: false });

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const resp = await fetch("/api/admin/v4/notifications?read=false&page=1&pageSize=1", {
          cache: "no-store",
          credentials: "include",
        });

        if (resp.status === 401) {
          if (!cancelled) setState({ unread: 0, failed: false });
          return;
        }

        const json = await resp.json().catch(() => null);
        const unread = Number(json?.data?.unreadCount ?? json?.unreadCount ?? 0);
        if (!cancelled) {
          setState({
            unread: Number.isFinite(unread) && unread > 0 ? unread : 0,
            failed: !(resp.ok && json?.ok === true),
          });
        }
      } catch {
        if (!cancelled) setState({ unread: 0, failed: true });
      }
    };

    void load();
    const id = window.setInterval(() => void load(), 60_000);

    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, []);

  const label = useMemo(() => {
    if (state.failed) return "Notifications";
    if (state.unread > 99) return "Notifications (99+)";
    if (state.unread > 0) return `Notifications (${state.unread})`;
    return "Notifications";
  }, [state.failed, state.unread]);

  return (
    <Link
      href="/notifications"
      title={label}
      aria-label={label}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        borderRadius: 999,
        border: "1px solid rgba(148,163,184,0.28)",
        background: "rgba(2,6,23,0.35)",
        color: "rgba(226,232,240,0.95)",
        textDecoration: "none",
        fontSize: 12,
        fontWeight: 900,
        padding: "6px 10px",
      }}
    >
      <span aria-hidden="true">Bell</span>
      {state.unread > 0 ? (
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
          {state.unread > 99 ? "99+" : state.unread}
        </span>
      ) : null}
    </Link>
  );
}
