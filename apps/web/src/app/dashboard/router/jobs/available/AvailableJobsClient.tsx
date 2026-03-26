"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@clerk/nextjs";
import { formatJobStatus } from "@/components/dashboard/formatDashboardStatus";
import { readJsonResponse } from "@/components/dashboard/loadSection";
import { routerApiFetch } from "@/lib/routerApi";
import { useRouterReadiness } from "@/hooks/useRouterReadiness";

type Job = {
  id: string;
  title: string;
  status?: string;
  routingStatus?: string;
  scope?: string;
  city?: string;
  region?: string;
  countryCode?: string;
  regionCode?: string;
  provinceCode?: string;
  tradeCategory?: string;
  urbanOrRegional?: string;
  jobType?: string;
  appraisalTotal?: number;
  budgetCents?: number;
  createdAt?: string;
  postedAt?: string;
};

const ENDPOINT = "/api/web/v4/router/available-jobs";

function formatCents(cents: number): string {
  return `$${(Math.max(0, Number(cents) || 0) / 100).toFixed(2)}`;
}

function formatRelativeTime(iso: string | undefined): string {
  if (!iso) return "Posted recently";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "Posted recently";
  const diffMs = Date.now() - date.getTime();
  const minutes = Math.max(1, Math.floor(diffMs / 60000));
  if (minutes < 60) return `Posted ${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `Posted ${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `Posted ${days}d ago`;
}

function SetupRequiredPanel({
  readiness,
}: {
  readiness: { terms: boolean; profile: boolean; payment: boolean };
}) {
  const gates = [
    { label: "Terms", ok: readiness.terms, href: "/dashboard/router/terms" },
    { label: "Profile", ok: readiness.profile, href: "/dashboard/router/profile" },
    { label: "Stripe", ok: readiness.payment, href: "/dashboard/router/payments" },
  ];

  return (
    <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 shadow-sm">
      <h2 className="text-lg font-semibold text-slate-900">Complete Your Setup</h2>
      <p className="mt-1 text-sm text-slate-600">
        To route jobs you must complete all setup steps.
      </p>

      <ul className="mt-4 space-y-2">
        {gates.map((g) => (
          <li key={g.label} className="flex items-center gap-3">
            <span className={g.ok ? "text-emerald-600" : "text-amber-500"}>
              {g.ok ? "\u2713" : "\u26A0"}
            </span>
            <Link
              href={g.href}
              className="text-sm font-medium text-slate-900 hover:text-emerald-700 hover:underline"
            >
              {g.label}
            </Link>
            <span className={"text-xs " + (g.ok ? "text-emerald-600" : "text-amber-600")}>
              {g.ok ? "Complete" : "Incomplete"}
            </span>
          </li>
        ))}
      </ul>

      {!readiness.payment && (
        <Link
          href="/dashboard/router/payments"
          className="mt-4 inline-flex rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700"
        >
          Connect Stripe
        </Link>
      )}

      {!readiness.profile && readiness.payment && (
        <Link
          href="/dashboard/router/profile"
          className="mt-4 inline-flex rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700"
        >
          Complete Profile
        </Link>
      )}

      {!readiness.terms && readiness.payment && readiness.profile && (
        <Link
          href="/dashboard/router/terms"
          className="mt-4 inline-flex rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700"
        >
          Accept Terms
        </Link>
      )}
    </div>
  );
}

export default function AvailableJobsClient() {
  const { getToken } = useAuth();

  const {
    readiness,
    loading: readinessLoading,
    error: readinessError,
  } = useRouterReadiness();

  // null = not yet fetched (distinguishes from [] = fetched but empty)
  const [jobs, setJobs] = useState<Job[] | null>(null);
  const [fetching, setFetching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [responseStatus, setResponseStatus] = useState<"idle" | "ok" | "error">("idle");
  const [responseMeta, setResponseMeta] = useState<Record<string, unknown> | null>(null);

  const setupBlocked = readiness !== null && !readiness.complete;

  const fetchJobs = useCallback(async () => {
    setFetching(true);
    setError(null);

    try {
      const resp = await routerApiFetch(ENDPOINT, getToken);
      const json = await readJsonResponse<{
        jobs?: Job[];
        status?: "ok" | "error";
        _meta?: Record<string, unknown>;
      }>(resp);

      if (json?._meta && typeof json._meta === "object") {
        setResponseMeta(json._meta as Record<string, unknown>);
      }

      if (!resp.ok || json.status === "error") {
        setResponseStatus("error");
        setJobs([]);
        setError("Failed to load jobs");
        return;
      }

      const list: Job[] = Array.isArray(json?.jobs)
        ? json.jobs
        : [];

      setResponseStatus("ok");
      setJobs(list);
    } catch {
      setResponseStatus("error");
      setJobs([]);
      setError("Network error — failed to reach the API");
    } finally {
      setFetching(false);
    }
  }, [getToken]);

  useEffect(() => {
    if (readinessLoading) return;
    if (setupBlocked) return;
    fetchJobs();
  }, [fetchJobs, readinessLoading, setupBlocked]);

  /* ── Gate 1: Readiness still loading ── */

  if (readinessLoading) {
    return (
      <div className="space-y-5 p-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Available Jobs</h1>
          <p className="mt-1 text-sm text-slate-600">
            Open jobs in your home region, ready to route to contractors.
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-500">
          Checking account readiness...
        </div>
      </div>
    );
  }

  /* ── Gate 2: Readiness error ── */

  if (readinessError) {
    return (
      <div className="p-6">
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {readinessError}
        </div>
      </div>
    );
  }

  /* ── Gate 3: Setup incomplete ── */

  if (setupBlocked && readiness) {
    return (
      <div className="space-y-5 p-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Available Jobs</h1>
          <p className="mt-1 text-sm text-slate-600">
            Open jobs in your home region, ready to route to contractors.
          </p>
        </div>
        <SetupRequiredPanel readiness={readiness} />
      </div>
    );
  }

  /* ── Gate 4: Jobs not yet fetched or currently fetching ── */

  if (jobs === null || fetching) {
    return (
      <div className="space-y-5 p-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Available Jobs</h1>
          <p className="mt-1 text-sm text-slate-600">
            Open jobs in your home region, ready to route to contractors.
          </p>
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="animate-pulse rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="h-5 w-3/4 rounded bg-slate-200" />
              <div className="mt-4 flex gap-2">
                <div className="h-6 w-20 rounded-full bg-slate-100" />
                <div className="h-6 w-16 rounded-full bg-slate-100" />
              </div>
              <div className="mt-4 h-4 w-1/2 rounded bg-slate-100" />
              <div className="mt-2 h-4 w-1/3 rounded bg-slate-100" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  /* ── Resolved: show jobs UI ── */

  return (
    <div className="space-y-5 p-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Available Jobs</h1>
          <p className="mt-1 text-sm text-slate-600">
            Open jobs in your home region, ready to route to contractors.
          </p>
        </div>

        <button
          onClick={fetchJobs}
          disabled={fetching}
          className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        >
          {fetching ? "Refreshing..." : "Refresh"}
        </button>
      </div>

      {responseStatus === "error" && (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-5 shadow-sm">
          <p className="text-sm font-medium text-red-800">Failed to load jobs</p>
          <p className="mt-1 text-sm text-red-700">{error ?? "Please refresh or try again in a moment."}</p>
          <button
            type="button"
            onClick={fetchJobs}
            className="mt-3 rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700"
          >
            Retry
          </button>
        </div>
      )}

      {responseStatus === "ok" && jobs.length === 0 && (
        <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-slate-600 shadow-sm">
          No jobs available.
        </div>
      )}

      {responseStatus === "ok" && jobs.length > 0 && (
        <ul className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {jobs.map((job) => (
            <li key={job.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="text-lg font-semibold text-slate-900">{job.title}</div>

              <div className="mt-3 flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700">
                  {job.tradeCategory || "General"}
                </span>
                {job.status ? (
                  <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-medium text-blue-700">
                    {formatJobStatus(job.status)}
                  </span>
                ) : null}
                <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700">
                  {job.urbanOrRegional || (job.jobType === "regional" ? "Regional" : "Urban")}
                </span>
              </div>

              <div className="mt-4 text-sm text-slate-600">
                {[job.city, job.regionCode ?? job.provinceCode, job.countryCode]
                  .filter(Boolean)
                  .join(", ") || "Location unknown"}
              </div>

              {(job.appraisalTotal ?? job.budgetCents) ? (
                <div className="mt-1 text-sm font-medium text-slate-900">
                  {formatCents(job.appraisalTotal ?? job.budgetCents ?? 0)}
                </div>
              ) : null}

              <div className="mt-1 text-xs text-slate-500">
                {formatRelativeTime(job.createdAt ?? job.postedAt)}
              </div>

              <Link
                href={`/dashboard/router/jobs/${encodeURIComponent(job.id)}/route`}
                className="mt-4 inline-flex rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
              >
                Route job
              </Link>
            </li>
          ))}
        </ul>
      )}

      <details className="rounded-xl border border-slate-200 bg-slate-50 text-xs text-slate-500">
        <summary className="cursor-pointer select-none px-4 py-2 font-medium">
          Diagnostics
        </summary>
        <div className="space-y-1 border-t border-slate-200 px-4 py-3 font-mono">
          <div>Endpoint: {ENDPOINT}</div>
          <div>Jobs returned: {jobs.length}</div>
          <div>First job ID: {jobs[0]?.id ?? "(none)"}</div>
          {responseMeta && (
            <div className="mt-2 border-t border-slate-200 pt-2">
              <div className="font-semibold">API _meta:</div>
              {Object.entries(responseMeta).map(([k, v]) => (
                <div key={k}>{k}: {JSON.stringify(v)}</div>
              ))}
            </div>
          )}
          <div className="mt-2 border-t border-slate-200 pt-2">
            <div className="font-semibold">Account Readiness:</div>
            <div>termsAccepted: {readiness ? String(readiness.terms) : "(loading)"}</div>
            <div>profileComplete: {readiness ? String(readiness.profile) : "(loading)"}</div>
            <div>stripeConnected: {readiness ? String(readiness.payment) : "(loading)"}</div>
          </div>
        </div>
      </details>
    </div>
  );
}
