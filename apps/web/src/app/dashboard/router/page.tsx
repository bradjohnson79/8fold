"use client";

import React, { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useAuth } from "@clerk/nextjs";
import confetti from "canvas-confetti";
import { routerApiFetch } from "@/lib/routerApi";
import { useRouterReadiness } from "@/hooks/useRouterReadiness";

type SummaryData = {
  capacity: { routesUsedToday: number };
  actionRequired: { supportTicketsRequiringInput: number };
  recentActivity: Array<{
    id: number;
    title: string;
    event: string;
    updatedAt: string | null;
  }>;
};

type AcceptNotif = {
  id: string;
  metadata?: {
    jobId?: string;
    contractorUserId?: string;
    jobTitle?: string;
    contractorName?: string;
  };
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

export default function RouterOverviewPage() {
  const { getToken } = useAuth();
  const { readiness, loading: readinessLoading, error: readinessError } = useRouterReadiness();
  const [dataLoading, setDataLoading] = useState(true);
  const [error, setError] = useState("");

  const [summary, setSummary] = useState<SummaryData | null>(null);
  const [availableCount, setAvailableCount] = useState<number>(0);
  const [unreadNotifs, setUnreadNotifs] = useState<number>(0);
  const [acceptNotifs, setAcceptNotifs] = useState<AcceptNotif[]>([]);
  const confettiFired = useRef(false);

  useEffect(() => {
    if (readinessLoading) return;
    let alive = true;
    (async () => {
      try {
        const [summaryResp, jobsResp, notifResp, acceptResp] =
          await Promise.all([
            routerApiFetch("/api/web/v4/router/dashboard/summary", getToken).catch(() => null),
            routerApiFetch("/api/web/v4/router/available-jobs", getToken).catch(() => null),
            routerApiFetch("/api/web/v4/router/notifications?page=1&pageSize=1", getToken).catch(() => null),
            routerApiFetch("/api/web/v4/router/notifications?unreadOnly=true&type=CONTRACTOR_ACCEPTED&page=1&pageSize=5", getToken).catch(() => null),
          ]);
        if (!alive) return;

        const summaryJson = summaryResp ? await summaryResp.json().catch(() => null) : null;
        const jobsJson = jobsResp ? await jobsResp.json().catch(() => null) : null;
        const notifJson = notifResp ? await notifResp.json().catch(() => null) : null;
        const acceptJson = acceptResp ? await acceptResp.json().catch(() => null) : null;
        if (!alive) return;

        setSummary(summaryJson ?? null);
        setAvailableCount(
          Array.isArray(jobsJson?.jobs) ? jobsJson.jobs.length : Array.isArray(jobsJson) ? jobsJson.length : 0,
        );
        setUnreadNotifs(typeof notifJson?.unreadCount === "number" ? notifJson.unreadCount : 0);

        const notifs: AcceptNotif[] = Array.isArray(acceptJson?.notifications) ? acceptJson.notifications : [];
        setAcceptNotifs(notifs);
        if (notifs.length > 0 && !confettiFired.current) {
          confettiFired.current = true;
          confetti({ particleCount: 120, spread: 70, origin: { y: 0.6 } });
        }
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

  const termsOk = readiness?.terms ?? false;
  const profileOk = readiness?.profile ?? false;
  const stripeOk = readiness?.payment ?? false;
  const allGatesComplete = readiness?.complete ?? false;

  const routedToday = summary?.capacity?.routesUsedToday ?? 0;
  const openTickets = summary?.actionRequired?.supportTicketsRequiringInput ?? 0;
  const recentActivity = (summary?.recentActivity ?? []).slice(0, 5);

  return (
    <div className="space-y-6 p-6">
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
        <section>
          <h2 className="mb-3 text-lg font-semibold text-slate-900">Setup Status</h2>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <GateCard label="Terms" done={termsOk} href="/dashboard/router/terms" compact={false} />
            <GateCard label="Profile" done={profileOk} href="/dashboard/router/profile" compact={false} />
            <GateCard
              label="Stripe"
              done={stripeOk}
              href="/dashboard/router/payments"
              compact={false}
            />
          </div>
        </section>
      )}

      {/* Celebration Card */}
      {acceptNotifs.length > 0 && (
        <section className="rounded-2xl border border-emerald-200 bg-emerald-50 p-6 shadow-sm">
          <h2 className="text-xl font-bold text-emerald-800">
            Routing Success
          </h2>
          <div className="mt-3 space-y-2">
            {acceptNotifs.map((n) => {
              const meta = n.metadata ?? {};
              return (
                <div key={n.id} className="text-sm text-emerald-700">
                  <span className="font-semibold">{meta.jobTitle ?? "A job"}</span>
                  {" has been accepted by "}
                  <span className="font-semibold">{meta.contractorName ?? "a contractor"}</span>
                </div>
              );
            })}
          </div>
          <div className="mt-4">
            <Link
              href="/dashboard/router/jobs/routed"
              className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
            >
              View Routed Jobs
            </Link>
          </div>
        </section>
      )}

      {/* Section 2: Available Jobs (Hero) */}
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="text-sm font-medium uppercase tracking-wide text-slate-500">
          Available Jobs
        </div>
        <div className="mt-1 flex items-baseline gap-3">
          <span className="text-5xl font-bold text-slate-900">{availableCount}</span>
          <span className="text-lg text-slate-600">jobs waiting for routing</span>
        </div>
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
            Routed Today: <span className="font-semibold text-slate-900">{routedToday}</span>
          </div>
        </div>
        {recentActivity.length === 0 ? (
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

      {/* Section 4: Notifications */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Link
          href="/dashboard/router/notifications"
          className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition hover:shadow-md"
        >
          <div>
            <div className="text-sm font-medium uppercase tracking-wide text-slate-500">Notifications</div>
            <div className="mt-1 text-2xl font-bold text-slate-900">{unreadNotifs} <span className="text-base font-normal text-slate-500">unread</span></div>
          </div>
          <span className="text-slate-400">&rarr;</span>
        </Link>

        {/* Section 5: Support */}
        <Link
          href="/dashboard/router/support-inbox"
          className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition hover:shadow-md"
        >
          <div>
            <div className="text-sm font-medium uppercase tracking-wide text-slate-500">Support</div>
            <div className="mt-1 text-2xl font-bold text-slate-900">{openTickets} <span className="text-base font-normal text-slate-500">open tickets</span></div>
          </div>
          <span className="text-slate-400">&rarr;</span>
        </Link>
      </div>
    </div>
  );
}
