"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@clerk/nextjs";
import { RoleCompletionPanel } from "@/components/dashboard/RoleCompletionPanel";
import { loadSection, readJsonResponse } from "@/components/dashboard/loadSection";
import { routerApiFetch } from "@/lib/routerApi";
import { useRouterReadiness } from "@/hooks/useRouterReadiness";

type SummaryData = {
  capacity?: { routesUsedToday?: number };
  actionRequired?: { supportTicketsRequiringInput?: number };
  earnings?: {
    weekCents?: number;
    monthCents?: number;
    lifetimeCents?: number;
    pendingReleaseCents?: number;
  };
  recentActivity?: Array<{
    id: number;
    title: string;
    event: string;
    updatedAt: string | null;
  }>;
};

function formatTimeAgo(iso: string | null): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const diffMs = Date.now() - date.getTime();
  const minutes = Math.max(1, Math.floor(diffMs / 60000));
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function GateCard({
  label,
  done,
  href,
  compact,
}: {
  label: string;
  done: boolean;
  href: string;
  compact: boolean;
}) {
  if (compact) {
    return (
      <Link
        href={href}
        className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-700 hover:text-emerald-700"
      >
        <span className="text-emerald-600">&#10003;</span>
        {label}
      </Link>
    );
  }
  return (
    <Link
      href={href}
      className={
        "flex items-center gap-3 rounded-xl border p-4 transition hover:shadow-md " +
        (done
          ? "border-emerald-200 bg-emerald-50"
          : "border-amber-200 bg-amber-50")
      }
    >
      <span
        className={
          "flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold " +
          (done
            ? "bg-emerald-600 text-white"
            : "bg-amber-400 text-white")
        }
      >
        {done ? "\u2713" : "!"}
      </span>
      <div className="min-w-0 flex-1">
        <div className="font-semibold text-slate-900">{label}</div>
        <div className={"text-xs " + (done ? "text-emerald-700" : "text-amber-700")}>
          {done ? "Complete" : "Action required"}
        </div>
      </div>
    </Link>
  );
}

function DegradedStateBanner() {
  return (
    <div className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800">
      Some data failed to load. Please refresh.
    </div>
  );
}

export default function RouterOverviewPage() {
  const { getToken } = useAuth();
  const { readiness, loading: readinessLoading, error: readinessError } = useRouterReadiness();
  const [dataLoading, setDataLoading] = useState(true);
  const [error, setError] = useState("");

  const [summary, setSummary] = useState<SummaryData | null>(null);
  const [availableCount, setAvailableCount] = useState<number | null>(null);
  const [sectionFailures, setSectionFailures] = useState({
    summary: false,
    availableJobs: false,
  });

  useEffect(() => {
    if (readinessLoading) return;
    let alive = true;
    (async () => {
      try {
        const [summaryResult, jobsResult] =
          await Promise.all([
            loadSection(async () => {
              const resp = await routerApiFetch("/api/web/v4/router/dashboard/summary", getToken);
              if (!resp.ok) throw new Error(`Router summary request failed with ${resp.status}`);
              return await readJsonResponse<SummaryData>(resp);
            }, { section: "router-summary", route: "/api/web/v4/router/dashboard/summary" }),
            loadSection(async () => {
              const resp = await routerApiFetch("/api/web/v4/router/available-jobs", getToken);
              if (!resp.ok) throw new Error(`Available jobs request failed with ${resp.status}`);
              const json = await readJsonResponse<{ jobs?: Array<unknown>; status?: "ok" | "error" }>(resp);
              if (json.status === "error") {
                throw new Error("Available jobs API returned error status");
              }
              return json;
            }, { section: "router-available-jobs", route: "/api/web/v4/router/available-jobs" }),
          ]);
        if (!alive) return;

        const summaryJson = summaryResult.data;
        const jobsJson = jobsResult.data;

        setSectionFailures({
          summary: summaryResult.failed,
          availableJobs: jobsResult.failed,
        });

        setSummary(summaryJson ?? null);
        setAvailableCount(jobsResult.failed ? null : Array.isArray(jobsJson?.jobs) ? jobsJson.jobs.length : 0);
      } catch {
        if (alive) setError("Failed to load dashboard data");
      } finally {
        if (alive) setDataLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [readinessLoading, getToken]);

  const loading = readinessLoading || dataLoading;

  if (loading) {
    return (
      <div className="space-y-6 p-6">
        <div className="h-6 w-48 animate-pulse rounded bg-slate-200" />
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-20 animate-pulse rounded-xl border border-slate-200 bg-slate-50" />
          ))}
        </div>
        <div className="h-32 animate-pulse rounded-xl border border-slate-200 bg-slate-50" />
      </div>
    );
  }

  if (readinessError || error) {
    return (
      <div className="p-6">
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {readinessError || error}
        </div>
      </div>
    );
  }

  const allGatesComplete = readiness?.complete ?? false;
  const criticalSectionFailed = sectionFailures.summary || sectionFailures.availableJobs;

  const routedToday = summary?.capacity?.routesUsedToday ?? 0;
  const openTickets = summary?.actionRequired?.supportTicketsRequiringInput ?? 0;
  const recentActivity = (summary?.recentActivity ?? []).slice(0, 5);
  const earnings = summary?.earnings ?? {};
  const pendingCents = earnings.pendingReleaseCents ?? 0;
  const releasedCents = earnings.lifetimeCents ?? 0;

  return (
    <div className="space-y-6 p-6">
      {criticalSectionFailed ? <DegradedStateBanner /> : null}

      {/* Section 1: Setup Status */}
      {allGatesComplete ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-5 py-4">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
            <GateCard label="Terms" done href="/dashboard/router/terms" compact />
            <GateCard label="Profile" done href="/dashboard/router/profile" compact />
            <GateCard label="Stripe" done href="/dashboard/router/payments" compact />
          </div>
          <div className="mt-2 text-sm font-semibold text-emerald-700">
            Router ready to route jobs
          </div>
        </div>
      ) : (
        <RoleCompletionPanel
          role="ROUTER"
          completionState={readiness}
          loadingOverride={readinessLoading}
        />
      )}

      {/* Escrow Earnings */}
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h3 className="text-lg font-semibold text-slate-900">Escrow Earnings</h3>
        <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div>
            <div className="text-xs font-medium uppercase text-slate-500">Pending Escrow</div>
            <div className="mt-1 text-2xl font-bold text-amber-700">
              {sectionFailures.summary ? "—" : `$${(pendingCents / 100).toFixed(2)}`}
            </div>
            <div className="text-xs text-slate-500">Awaiting release</div>
          </div>
          <div>
            <div className="text-xs font-medium uppercase text-slate-500">Available Earnings</div>
            <div className="mt-1 text-2xl font-bold text-slate-900">
              {sectionFailures.summary ? "—" : `$${((earnings.weekCents ?? 0) / 100).toFixed(2)}`}
            </div>
            <div className="text-xs text-slate-500">This week</div>
          </div>
          <div>
            <div className="text-xs font-medium uppercase text-slate-500">Released Earnings</div>
            <div className="mt-1 text-2xl font-bold text-emerald-700">
              {sectionFailures.summary ? "—" : `$${(releasedCents / 100).toFixed(2)}`}
            </div>
            <div className="text-xs text-slate-500">Lifetime</div>
          </div>
        </div>
      </section>

      {/* Section 2: Available Jobs (Hero) */}
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="text-sm font-medium uppercase tracking-wide text-slate-500">
          Available Jobs
        </div>
        {sectionFailures.availableJobs ? (
          <div className="mt-3 text-sm text-slate-500">Available jobs are temporarily unavailable.</div>
        ) : (
          <div className="mt-1 flex items-baseline gap-3">
            <span className="text-5xl font-bold text-slate-900">{availableCount ?? "—"}</span>
            <span className="text-lg text-slate-600">jobs waiting for routing</span>
          </div>
        )}
        <Link
          href="/dashboard/router/jobs/available"
          className="mt-4 inline-flex rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700"
        >
          View Jobs
        </Link>
      </section>

      {/* Section 3: Recent Routing Activity */}
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-slate-900">Recent Routing Activity</h3>
          <div className="text-sm text-slate-600">
            Routed Today: <span className="font-semibold text-slate-900">{sectionFailures.summary ? "—" : routedToday}</span>
          </div>
        </div>
        {sectionFailures.summary ? (
          <p className="mt-3 text-sm text-slate-500">Recent routing activity is temporarily unavailable.</p>
        ) : recentActivity.length === 0 ? (
          <p className="mt-3 text-sm text-slate-500">No recent activity yet.</p>
        ) : (
          <ul className="mt-3 divide-y divide-slate-100">
            {recentActivity.map((item) => (
              <li key={item.id} className="flex items-center justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  <div className="truncate font-medium text-slate-900">{item.title}</div>
                  <div className="text-xs text-slate-500">{item.event}</div>
                </div>
                {item.updatedAt ? (
                  <div className="shrink-0 text-xs text-slate-400">
                    {formatTimeAgo(item.updatedAt)}
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        )}
        <Link
          href="/dashboard/router/jobs/routed"
          className="mt-3 inline-flex text-sm font-semibold text-emerald-600 hover:underline"
        >
          View Routed Jobs
        </Link>
      </section>

      <div className="grid grid-cols-1 gap-4">
        <Link
          href="/dashboard/router/support/inbox"
          className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition hover:shadow-md"
        >
          <div>
            <div className="text-sm font-medium uppercase tracking-wide text-slate-500">Support</div>
            <div className="mt-1 text-2xl font-bold text-slate-900">{sectionFailures.summary ? "—" : openTickets} <span className="text-base font-normal text-slate-500">open tickets</span></div>
          </div>
          <span className="text-slate-400">&rarr;</span>
        </Link>
      </div>
    </div>
  );
}
