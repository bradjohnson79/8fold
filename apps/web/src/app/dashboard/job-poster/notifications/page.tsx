"use client";

import React from "react";
import { useAuth } from "@clerk/nextjs";
import { apiFetch } from "@/lib/routerApi";

type PreferenceItem = {
  type: string;
  inApp: boolean;
  email: boolean;
};

function safePreferenceLabel(type: string): string {
  const normalized = String(type ?? "").toUpperCase();
  if (normalized.includes("MESSAGE")) return "New Message";
  if (normalized.includes("ROUT")) return "Job Routed";
  if (normalized.includes("ACCEPT")) return "Contractor Accepted";
  if (normalized.includes("START")) return "Job Started";
  if (normalized.includes("COMPLETE")) return "Job Completed";
  return "In-app alerts";
}

export default function JobPosterNotificationsPage() {
  const { getToken } = useAuth();
  const [prefs, setPrefs] = React.useState<PreferenceItem[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [savingPrefs, setSavingPrefs] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const prefsResp = await apiFetch("/api/web/v4/job-poster/notification-preferences", getToken);
      const prefsJson = (await prefsResp.json().catch(() => ({}))) as {
        items?: PreferenceItem[];
        data?: { items?: PreferenceItem[] };
      };
      if (!prefsResp.ok) {
        setError("Failed to load alert preferences");
        return;
      }
      const prefItems = Array.isArray(prefsJson.items)
        ? prefsJson.items
        : Array.isArray(prefsJson.data?.items)
          ? prefsJson.data?.items ?? []
          : [];
      setPrefs(prefItems);
    } catch {
      setError("Failed to load alert preferences");
    } finally {
      setLoading(false);
    }
  }, [getToken]);

  React.useEffect(() => {
    void load();
  }, [load]);

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
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Alert Preferences</h1>
        <p className="mt-1 text-sm text-slate-600">Choose which high-level in-app alerts can appear in your dashboard experience.</p>
      </div>

      {error ? <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div> : null}

      {loading ? (
        <p className="text-sm text-slate-600">Loading alert preferences...</p>
      ) : (
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">In-App Alert Preferences</h2>
          <p className="mt-1 text-sm text-slate-600">Internal system notification feeds are hidden from user dashboards. These settings only control whether high-level alerts are enabled.</p>
          <div className="mt-4 grid gap-2">
          {prefs.map((pref) => (
            <label key={pref.type} className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2">
              <span className="text-sm font-medium text-slate-800">{safePreferenceLabel(pref.type)}</span>
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
      )}
    </div>
  );
}
