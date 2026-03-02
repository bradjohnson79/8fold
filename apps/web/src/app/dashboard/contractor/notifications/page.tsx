"use client";

import React from "react";

type NotificationItem = {
  id: string;
  title: string;
  message?: string;
  type?: string;
  createdAt: string;
  readAt?: string | null;
};

type PreferenceItem = {
  type: string;
  inApp: boolean;
  email: boolean;
};

export default function ContractorNotificationsPage() {
  const [items, setItems] = React.useState<NotificationItem[]>([]);
  const [prefs, setPrefs] = React.useState<PreferenceItem[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [savingPrefs, setSavingPrefs] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [notifResp, prefsResp] = await Promise.all([
        fetch("/api/web/v4/contractor/notifications?page=1&pageSize=50", { cache: "no-store", credentials: "include" }),
        fetch("/api/web/v4/contractor/notification-preferences", { cache: "no-store", credentials: "include" }),
      ]);
      const notifJson = (await notifResp.json().catch(() => ({}))) as {
        notifications?: NotificationItem[];
        error?: { message?: string } | string;
      };
      const prefsJson = (await prefsResp.json().catch(() => ({}))) as {
        items?: PreferenceItem[];
        data?: { items?: PreferenceItem[] };
      };
      if (!notifResp.ok) {
        const message =
          typeof notifJson.error === "string" ? notifJson.error : notifJson.error?.message ?? "Failed to load notifications";
        setError(message);
        return;
      }
      setItems(Array.isArray(notifJson.notifications) ? notifJson.notifications : []);
      const prefItems = Array.isArray(prefsJson.items)
        ? prefsJson.items
        : Array.isArray(prefsJson.data?.items)
          ? prefsJson.data?.items ?? []
          : [];
      setPrefs(prefItems);
    } catch {
      setError("Failed to load notifications");
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  async function markRead(id: string) {
    await fetch(`/api/web/v4/contractor/notifications/${encodeURIComponent(id)}/read`, {
      method: "POST",
      credentials: "include",
    });
    await load();
  }

  async function markAllRead() {
    await fetch("/api/web/v4/contractor/notifications/read-all", {
      method: "POST",
      credentials: "include",
    });
    await load();
  }

  async function togglePreference(type: string, next: boolean) {
    setSavingPrefs(true);
    try {
      const nextItems = prefs.map((p) => (p.type === type ? { ...p, inApp: next } : p));
      setPrefs(nextItems);
      await fetch("/api/web/v4/contractor/notification-preferences", {
        method: "PATCH",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ items: [{ type, inApp: next }] }),
      });
    } catch {
      setError("Failed to update notification preferences");
      await load();
    } finally {
      setSavingPrefs(false);
    }
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-slate-900">Notifications</h1>
        <button
          onClick={() => void markAllRead()}
          className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-semibold text-slate-800 hover:bg-slate-50"
        >
          Mark all read
        </button>
      </div>
      {error ? <p className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p> : null}
      {loading ? (
        <p className="mt-3 text-sm text-slate-600">Loading notifications...</p>
      ) : items.length === 0 ? (
        <p className="mt-3 text-sm text-slate-500">No notifications yet.</p>
      ) : (
        <div className="mt-4 space-y-3">
          {items.map((n) => (
            <article key={n.id} className="rounded-xl border border-slate-200 p-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="font-semibold text-slate-900">{n.title}</h2>
                  {n.message ? <p className="mt-1 text-sm text-slate-700">{n.message}</p> : null}
                  <p className="mt-2 text-xs text-slate-500">{new Date(n.createdAt).toLocaleString()}</p>
                </div>
                {!n.readAt ? (
                  <button
                    onClick={() => void markRead(n.id)}
                    className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    Mark read
                  </button>
                ) : (
                  <span className="rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-700">
                    Read
                  </span>
                )}
              </div>
            </article>
          ))}
        </div>
      )}

      <section className="mt-8 rounded-xl border border-slate-200 p-4">
        <h2 className="text-lg font-semibold text-slate-900">Notification Preferences</h2>
        <p className="mt-1 text-sm text-slate-600">Control which in-app notifications are active.</p>
        <div className="mt-4 grid gap-2">
          {prefs.map((pref) => (
            <label key={pref.type} className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2">
              <span className="text-sm font-medium text-slate-800">{pref.type}</span>
              <input
                type="checkbox"
                checked={pref.inApp}
                disabled={savingPrefs}
                onChange={(e) => void togglePreference(pref.type, e.target.checked)}
              />
            </label>
          ))}
          {!prefs.length ? <p className="text-sm text-slate-500">No preference rows yet.</p> : null}
        </div>
      </section>
    </div>
  );
}
