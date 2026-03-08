"use client";

import React from "react";
import { useAuth } from "@clerk/nextjs";
import { apiFetch } from "@/lib/routerApi";

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

const TYPE_COLORS: Record<string, string> = {
  JOB_ROUTED: "bg-blue-50 text-blue-700",
  CONTRACTOR_ACCEPTED: "bg-emerald-50 text-emerald-700",
  JOB_STARTED: "bg-amber-50 text-amber-700",
  JOB_COMPLETED: "bg-slate-100 text-slate-700",
  COMPLETED: "bg-slate-100 text-slate-700",
  NEW_MESSAGE: "bg-purple-50 text-purple-700",
};

const FRIENDLY_LABELS: Record<string, string> = {
  JOB_ROUTED: "Job Routed",
  CONTRACTOR_ACCEPTED: "Contractor Accepted",
  JOB_STARTED: "Job Started",
  JOB_COMPLETED: "Job Completed",
  COMPLETED: "Job Completed",
  NEW_MESSAGE: "New Message",
};

function TypeBadge({ type }: { type: string }) {
  const color = TYPE_COLORS[type] ?? "bg-slate-100 text-slate-700";
  const label = FRIENDLY_LABELS[type] ?? type;
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${color}`}>{label}</span>
  );
}

export default function JobPosterNotificationsPage() {
  const { getToken } = useAuth();
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
        apiFetch("/api/web/v4/job-poster/notifications?page=1&pageSize=50", getToken),
        apiFetch("/api/web/v4/job-poster/notification-preferences", getToken),
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
  }, [getToken]);

  React.useEffect(() => {
    void load();
  }, [load]);

  async function markRead(id: string) {
    await apiFetch(`/api/web/v4/job-poster/notifications/${encodeURIComponent(id)}/read`, getToken, { method: "POST" });
    await load();
  }

  async function markAllRead() {
    await apiFetch("/api/web/v4/job-poster/notifications/read-all", getToken, { method: "POST" });
    await load();
  }

  async function togglePreference(type: string, next: boolean) {
    setSavingPrefs(true);
    try {
      const nextItems = prefs.map((p) => (p.type === type ? { ...p, inApp: next } : p));
      setPrefs(nextItems);
      await apiFetch("/api/web/v4/job-poster/notification-preferences", getToken, {
        method: "PATCH",
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
    <div className="space-y-5 p-6">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-slate-900">Notifications</h1>
        <button
          onClick={() => void markAllRead()}
          className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-semibold text-slate-800 hover:bg-slate-50"
        >
          Mark all read
        </button>
      </div>

      {error ? <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div> : null}

      {loading ? (
        <p className="text-sm text-slate-600">Loading notifications...</p>
      ) : items.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500 shadow-sm">
          No notifications yet.
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((n) => (
            <article key={n.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="font-semibold text-slate-900">{n.title}</h2>
                    {n.type ? <TypeBadge type={n.type} /> : null}
                  </div>
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

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">Notification Preferences</h2>
        <p className="mt-1 text-sm text-slate-600">Control which in-app notifications are active.</p>
        <div className="mt-4 grid gap-2">
          {prefs.map((pref) => (
            <label key={pref.type} className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2">
              <span className="text-sm font-medium text-slate-800">{FRIENDLY_LABELS[pref.type] ?? pref.type}</span>
              <input
                type="checkbox"
                checked={pref.inApp}
                disabled={savingPrefs}
                onChange={(e) => void togglePreference(pref.type, e.target.checked)}
                className="h-4 w-4 accent-emerald-600"
              />
            </label>
          ))}
          {!prefs.length ? <p className="text-sm text-slate-500">No preference rows yet.</p> : null}
        </div>
      </section>
    </div>
  );
}
