"use client";

import React, { useEffect, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { routerApiFetch } from "@/lib/routerApi";

type Summary = {
  performance: {
    totalRouted: number;
    activeRoutes: number;
    awaitingContractorAcceptance: number;
    pendingCompletionApproval: number;
    completedThisMonth: number;
  };
  capacity: {
    routesUsedToday: number;
    dailyRouteLimit: number;
    remainingCapacity: number;
    isSeniorRouter: boolean;
    status: "AVAILABLE" | "NEAR_LIMIT" | "LIMIT_REACHED";
  };
  earnings: {
    weekCents: number;
    monthCents: number;
    lifetimeCents: number;
    pendingReleaseCents: number;
  };
  actionRequired: {
    pendingCompletionApproval: number;
    awaitingContractorAcceptance: number;
    supportTicketsRequiringInput: number;
  };
  recentActivity: Array<{
    id: number;
    title: string;
    event: string;
    updatedAt: string | null;
  }>;
};

const money = (cents: number) => `$${(cents / 100).toFixed(2)}`;

const metricCards: Array<{ key: keyof Summary["performance"]; label: string; tone: string; icon: string }> = [
  { key: "totalRouted", label: "Total Routed (All-Time)", tone: "border-slate-200", icon: "#" },
  { key: "activeRoutes", label: "Active Routes", tone: "border-blue-200 bg-blue-50/40", icon: "A" },
  {
    key: "awaitingContractorAcceptance",
    label: "Awaiting Contractor Acceptance",
    tone: "border-yellow-200 bg-yellow-50/50",
    icon: "!",
  },
  {
    key: "pendingCompletionApproval",
    label: "Pending Completion Approval",
    tone: "border-orange-200 bg-orange-50/50",
    icon: "!",
  },
  { key: "completedThisMonth", label: "Completed (This Month)", tone: "border-emerald-200 bg-emerald-50/50", icon: "C" },
];

export default function RouterSummaryPage() {
  const { getToken } = useAuth();
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const resp = await routerApiFetch("/api/web/v4/router/dashboard/summary", getToken);
        const json = (await resp.json().catch(() => null)) as any;
        if (!alive) return;
        if (resp.status === 401) {
          setError("Authentication lost — please refresh and sign in again.");
          return;
        }
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
  if (!summary) return <div className="p-6 text-slate-600">No summary data is available for this router account yet.</div>;

  const totalRequiredActions =
    summary.actionRequired.pendingCompletionApproval +
    summary.actionRequired.awaitingContractorAcceptance +
    summary.actionRequired.supportTicketsRequiringInput;

  const capacityLabel =
    summary.capacity.status === "LIMIT_REACHED"
      ? "Limit Reached"
      : summary.capacity.status === "NEAR_LIMIT"
        ? "Near Limit"
        : "Available";
  const capacityIcon = summary.capacity.status === "LIMIT_REACHED" ? "STOP" : summary.capacity.status === "NEAR_LIMIT" ? "WARN" : "OK";

  return (
    <div className="space-y-6 p-6">
      {totalRequiredActions > 0 ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 shadow-sm">
          <div className="mb-1 text-sm font-semibold text-red-700">Action Required</div>
          <div className="text-sm text-red-800">
            {summary.actionRequired.pendingCompletionApproval} jobs pending completion approval, {" "}
            {summary.actionRequired.awaitingContractorAcceptance} jobs awaiting contractor response, {" "}
            {summary.actionRequired.supportTicketsRequiringInput} support tickets requiring routing input.
          </div>
        </div>
      ) : null}

      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h1 className="text-3xl font-semibold tracking-tight text-slate-900">Routing Command Center</h1>
          {summary.capacity.isSeniorRouter ? (
            <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-sm font-medium text-emerald-700">
              Senior Router Enabled
            </span>
          ) : null}
        </div>

        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">Performance Snapshot</h2>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-5">
          {metricCards.map((card) => (
            <div
              key={card.key}
              className={`rounded-xl border p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow ${card.tone}`}
            >
              <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">{card.label}</div>
              <div className="flex items-center gap-2">
                <span className="text-slate-400">{card.icon}</span>
                <span className="text-3xl font-semibold leading-none text-slate-900">{summary.performance[card.key]}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition hover:shadow-md">
          <h3 className="mb-3 text-lg font-semibold text-slate-900">Daily Routing Capacity</h3>
          <div className="space-y-2 text-sm text-slate-600">
            <div>
              Routes Used Today: <span className="font-semibold text-slate-900">{summary.capacity.routesUsedToday} / {summary.capacity.dailyRouteLimit}</span>
            </div>
            <div>
              Remaining Capacity: <span className="font-semibold text-slate-900">{summary.capacity.remainingCapacity}</span>
            </div>
            <div>
              Status: <span className="font-semibold text-slate-900">{capacityIcon} {capacityLabel}</span>
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition hover:shadow-md">
          <h3 className="mb-3 text-lg font-semibold text-slate-900">Earnings Overview</h3>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="rounded-lg border border-slate-100 bg-slate-50 p-3">
              <div className="text-slate-500">This Week</div>
              <div className="text-xl font-semibold text-slate-900">{money(summary.earnings.weekCents)}</div>
            </div>
            <div className="rounded-lg border border-slate-100 bg-slate-50 p-3">
              <div className="text-slate-500">This Month</div>
              <div className="text-xl font-semibold text-slate-900">{money(summary.earnings.monthCents)}</div>
            </div>
            <div className="rounded-lg border border-slate-100 bg-slate-50 p-3">
              <div className="text-slate-500">Lifetime</div>
              <div className="text-xl font-semibold text-slate-900">{money(summary.earnings.lifetimeCents)}</div>
            </div>
            <div className="rounded-lg border border-slate-100 bg-slate-50 p-3">
              <div className="text-slate-500">Pending Release</div>
              <div className="text-xl font-semibold text-slate-900">{money(summary.earnings.pendingReleaseCents)}</div>
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h3 className="mb-3 text-lg font-semibold text-slate-900">Recent Routing Activity</h3>
        {summary.recentActivity.length === 0 ? (
          <div className="text-sm text-slate-500">No recent activity yet.</div>
        ) : (
          <div className="space-y-2">
            {summary.recentActivity.map((item) => (
              <div key={item.id} className="rounded-lg border border-slate-100 p-3 text-sm">
                <div className="font-medium text-slate-900">{item.title}</div>
                <div className="text-slate-600">{item.event}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
