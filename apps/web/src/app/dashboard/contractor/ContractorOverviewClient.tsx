"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@clerk/nextjs";
import { apiFetch } from "@/lib/routerApi";
import { useContractorReadiness } from "@/hooks/useContractorReadiness";

type SummaryData = {
  pendingInvites: number;
  assignedJobsCount: number;
  completedJobsCount: number;
  availableEarnings: number;
};

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

function SummaryCard({ title, value, subtitle, href }: { title: string; value: string; subtitle: string; href?: string }) {
  const content = (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:shadow-md">
      <div className="text-sm font-medium uppercase tracking-wide text-slate-500">{title}</div>
      <div className="mt-1 text-3xl font-bold text-slate-900">{value}</div>
      <div className="mt-1 text-xs text-slate-500">{subtitle}</div>
    </div>
  );
  if (href) return <Link href={href}>{content}</Link>;
  return content;
}

const DEBUG = typeof window !== "undefined" && process.env.NEXT_PUBLIC_DEBUG_DASHBOARD === "true";

export default function ContractorOverviewClient() {
  const { getToken } = useAuth();
  const { readiness, loading: readinessLoading, error: readinessError } = useContractorReadiness();
  const [dataLoading, setDataLoading] = useState(true);
  const [error, setError] = useState("");
  const [summary, setSummary] = useState<SummaryData | null>(null);
  const [unreadNotifs, setUnreadNotifs] = useState<number>(0);
  const [debugData, setDebugData] = useState<Record<string, unknown> | null>(null);

  useEffect(() => {
    if (readinessLoading) return;
    let alive = true;
    (async () => {
      try {
        const [summaryResp, notifResp] = await Promise.all([
          apiFetch("/api/web/v4/contractor/dashboard/summary", getToken).catch(() => null),
          apiFetch("/api/web/v4/contractor/notifications?page=1&pageSize=1", getToken).catch(() => null),
        ]);
        if (!alive) return;

        const summaryJson = summaryResp ? await summaryResp.json().catch(() => null) : null;
        const notifJson = notifResp ? await notifResp.json().catch(() => null) : null;
        if (!alive) return;

        setSummary(summaryJson ?? null);
        setUnreadNotifs(typeof notifJson?.unreadCount === "number" ? notifJson.unreadCount : 0);

        if (DEBUG) {
          setDebugData({
            summaryKeys: summaryJson ? Object.keys(summaryJson) : [],
            notifKeys: notifJson ? Object.keys(notifJson) : [],
            pendingInvites: summaryJson?.pendingInvites,
            assignedJobsCount: summaryJson?.assignedJobsCount,
          });
        }
      } catch {
        if (alive) setError("Failed to load dashboard data");
      } finally {
        if (alive) setDataLoading(false);
      }
    })();
    return () => { alive = false; };
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
  const paymentOk = readiness?.payment ?? false;
  const allGatesComplete = readiness?.complete ?? false;

  const pendingInvites = summary?.pendingInvites ?? 0;
  const assignedJobs = summary?.assignedJobsCount ?? 0;
  const earnings = summary?.availableEarnings ?? 0;

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Contractor Dashboard</h1>
        <p className="mt-1 text-sm text-slate-600">Track your jobs, invites, and earnings.</p>
      </div>

      {allGatesComplete ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-5 py-4">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
            <GateCard label="Terms" done href="/dashboard/contractor/terms" compact />
            <GateCard label="Profile" done href="/dashboard/contractor/profile" compact />
            <GateCard label="Payment" done href="/dashboard/contractor/payment" compact />
          </div>
          <div className="mt-2 text-sm font-semibold text-emerald-700">
            Account setup complete &mdash; ready for jobs
          </div>
        </div>
      ) : (
        <section>
          <h2 className="mb-3 text-lg font-semibold text-slate-900">Complete Your Setup</h2>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <GateCard label="Terms" done={termsOk} href="/dashboard/contractor/terms" compact={false} />
            <GateCard label="Profile Setup" done={profileOk} href="/dashboard/contractor/profile" compact={false} />
            <GateCard label="Payment Setup" done={paymentOk} href="/dashboard/contractor/payment" compact={false} />
          </div>
        </section>
      )}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <SummaryCard
          title="Available Earnings"
          value={`$${(earnings / 100).toFixed(2)}`}
          subtitle="Funds ready to release"
        />
        <SummaryCard
          title="In Progress Jobs"
          value={String(assignedJobs)}
          subtitle="Active assigned jobs"
          href="/dashboard/contractor/jobs"
        />
        <SummaryCard
          title="Pending Invites"
          value={String(pendingInvites)}
          subtitle={pendingInvites > 0 ? "Job invitations waiting" : "No pending invites"}
          href="/dashboard/contractor/invites"
        />
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Link
          href="/dashboard/contractor/notifications"
          className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition hover:shadow-md"
        >
          <div>
            <div className="text-sm font-medium uppercase tracking-wide text-slate-500">Notifications</div>
            <div className="mt-1 text-2xl font-bold text-slate-900">{unreadNotifs} <span className="text-base font-normal text-slate-500">unread</span></div>
          </div>
          <span className="text-slate-400">&rarr;</span>
        </Link>
        <Link
          href="/dashboard/contractor/support"
          className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition hover:shadow-md"
        >
          <div>
            <div className="text-sm font-medium uppercase tracking-wide text-slate-500">Support</div>
            <div className="mt-1 text-sm text-slate-600">Submit or view support tickets</div>
          </div>
          <span className="text-slate-400">&rarr;</span>
        </Link>
      </div>

      {DEBUG && debugData ? (
        <details className="rounded-xl border border-slate-300 bg-slate-50 p-4 text-xs text-slate-600">
          <summary className="cursor-pointer font-semibold">Debug Panel</summary>
          <pre className="mt-2 overflow-auto">{JSON.stringify(debugData, null, 2)}</pre>
        </details>
      ) : null}
    </div>
  );
}
