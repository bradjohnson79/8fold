"use client";

import React, { useEffect, useState } from "react";

type Summary = {
  totalRouted: number;
  activeRouted: number;
  completedRouted: number;
  pendingApprovals: number;
  commissionEarnedCents: number;
};

export default function RouterSummaryPage() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const resp = await fetch("/api/v4/router/dashboard/summary", { cache: "no-store", credentials: "include" });
        const json = (await resp.json().catch(() => null)) as any;
        if (!alive) return;
        if (!resp.ok) {
          setError(json?.error?.message ?? json?.error ?? "Failed to load summary");
          return;
        }
        setSummary(json);
      } catch {
        if (alive) setError("Failed to load summary");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  if (loading) return <div className="p-6">Loading...</div>;
  if (error) return <div className="p-6 text-red-700">{error}</div>;
  if (!summary) return <div className="p-6">No data</div>;

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold">Router Dashboard</h1>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl bg-white p-4 shadow dark:bg-zinc-900">
          <div className="text-sm text-gray-600 dark:text-gray-400">Total Routed</div>
          <div className="text-2xl font-semibold">{summary.totalRouted}</div>
        </div>
        <div className="rounded-xl bg-white p-4 shadow dark:bg-zinc-900">
          <div className="text-sm text-gray-600 dark:text-gray-400">Active</div>
          <div className="text-2xl font-semibold">{summary.activeRouted}</div>
        </div>
        <div className="rounded-xl bg-white p-4 shadow dark:bg-zinc-900">
          <div className="text-sm text-gray-600 dark:text-gray-400">Completed</div>
          <div className="text-2xl font-semibold">{summary.completedRouted}</div>
        </div>
        <div className="rounded-xl bg-white p-4 shadow dark:bg-zinc-900">
          <div className="text-sm text-gray-600 dark:text-gray-400">Pending Approvals</div>
          <div className="text-2xl font-semibold">{summary.pendingApprovals}</div>
        </div>
      </div>
      <div className="rounded-xl bg-white p-4 shadow dark:bg-zinc-900">
        <div className="text-sm text-gray-600 dark:text-gray-400">Commission Earned</div>
        <div className="text-2xl font-semibold">${(summary.commissionEarnedCents / 100).toFixed(2)}</div>
      </div>
    </div>
  );
}
