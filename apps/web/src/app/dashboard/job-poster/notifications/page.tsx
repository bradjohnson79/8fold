"use client";

import React from "react";

type NotificationItem = {
  id: string;
  title: string;
  message?: string;
  createdAt: string;
  readAt?: string | null;
};

export default function JobPosterNotificationsPage() {
  const [items, setItems] = React.useState<NotificationItem[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const resp = await fetch("/api/v4/notifications?page=1&pageSize=50", { cache: "no-store", credentials: "include" });
        const json = (await resp.json().catch(() => ({}))) as { notifications?: NotificationItem[]; error?: { message?: string } | string };
        if (!alive) return;
        if (!resp.ok) {
          const message = typeof json.error === "string" ? json.error : json.error?.message ?? "Failed to load notifications";
          setError(message);
          return;
        }
        setItems(Array.isArray(json.notifications) ? json.notifications : []);
      } catch {
        if (alive) setError("Failed to load notifications");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold text-slate-900">Notifications</h1>
      {error ? <p className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p> : null}
      {loading ? (
        <p className="mt-3 text-sm text-slate-600">Loading notifications...</p>
      ) : items.length === 0 ? (
        <p className="mt-3 text-sm text-slate-500">No notifications yet.</p>
      ) : (
        <div className="mt-4 space-y-3">
          {items.map((n) => (
            <article key={n.id} className="rounded-xl border border-slate-200 p-4">
              <h2 className="font-semibold text-slate-900">{n.title}</h2>
              {n.message ? <p className="mt-1 text-sm text-slate-700">{n.message}</p> : null}
              <p className="mt-2 text-xs text-slate-500">{new Date(n.createdAt).toLocaleString()}</p>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
