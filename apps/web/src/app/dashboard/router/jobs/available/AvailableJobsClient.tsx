"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@clerk/nextjs";
import { routerApiFetch } from "@/lib/routerApi";

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

type SelfCheckResult = {
  jurisdiction: string | null;
  profileLoaded: boolean;
  summaryLoaded: boolean;
  error: string | null;
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

export default function AvailableJobsClient() {
  const { getToken } = useAuth();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastFetchedAt, setLastFetchedAt] = useState<string | null>(null);
  const [responseKeys, setResponseKeys] = useState<string[]>([]);
  const [selfCheck, setSelfCheck] = useState<SelfCheckResult | null>(null);
  const [selfCheckLoading, setSelfCheckLoading] = useState(false);

  const fetchJobs = useCallback(async () => {
    setLoading(true);
    setError(null);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    try {
      const resp = await routerApiFetch(ENDPOINT, getToken, {
        signal: controller.signal,
      });
      clearTimeout(timeout);
      const json = await resp.json().catch(() => null);
      setLastFetchedAt(new Date().toISOString());

      if (json && typeof json === "object" && !Array.isArray(json)) {
        setResponseKeys(Object.keys(json));
      } else if (Array.isArray(json)) {
        setResponseKeys(["(array)"]);
      } else {
        setResponseKeys(["(unparseable)"]);
      }

      if (!resp.ok) {
        const errorCode =
          typeof json?.error === "string" ? json.error : json?.error?.code ?? json?.error?.message ?? "";
        if (errorCode === "AUTH_MISSING_TOKEN" || resp.status === 401) {
          setError("Authentication lost — please refresh and sign in again.");
          return;
        }
        const msg =
          typeof json?.error === "string"
            ? json.error
            : json?.error?.message ?? resp.statusText ?? "Failed to load jobs";
        setError(msg);
        return;
      }

      const list: Job[] = Array.isArray(json?.jobs)
        ? json.jobs
        : Array.isArray(json)
          ? json
          : [];
      setJobs(list);
    } catch (err) {
      clearTimeout(timeout);
      if (err instanceof DOMException && err.name === "AbortError") {
        setError("Request timed out after 8 seconds");
      } else {
        setError("Network error — failed to reach the API");
      }
    } finally {
      setLoading(false);
    }
  }, [getToken]);

  useEffect(() => {
    fetchJobs();
  }, [fetchJobs]);

  async function runSelfCheck() {
    setSelfCheckLoading(true);
    setSelfCheck(null);
    try {
      const [profileResp, summaryResp] = await Promise.all([
        routerApiFetch("/api/web/v4/router/profile", getToken).catch(() => null),
        routerApiFetch("/api/web/v4/router/dashboard/summary", getToken).catch(() => null),
      ]);

      const profileJson = profileResp ? await profileResp.json().catch(() => null) : null;
      const summaryJson = summaryResp ? await summaryResp.json().catch(() => null) : null;

      const profileData = profileJson?.profile ?? profileJson;
      const countryCode = profileData?.homeCountryCode ?? null;
      const regionCode = profileData?.homeRegionCode ?? null;

      setSelfCheck({
        jurisdiction: countryCode && regionCode ? `${countryCode}/${regionCode}` : countryCode ?? "(unknown)",
        profileLoaded: Boolean(profileResp?.ok && profileJson),
        summaryLoaded: Boolean(summaryResp?.ok && summaryJson),
        error: null,
      });
    } catch (err) {
      setSelfCheck({
        jurisdiction: null,
        profileLoaded: false,
        summaryLoaded: false,
        error: err instanceof Error ? err.message : "Self-check failed",
      });
    } finally {
      setSelfCheckLoading(false);
    }
  }

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
          type="button"
          onClick={fetchJobs}
          disabled={loading}
          className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        >
          {loading ? "Refreshing..." : "Refresh"}
        </button>
      </div>

      {loading && (
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
              <div className="mt-4 h-9 w-24 rounded-lg bg-slate-200" />
            </div>
          ))}
        </div>
      )}

      {!loading && error && (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-5 shadow-sm">
          <p className="text-sm font-medium text-red-800">Error loading jobs</p>
          <p className="mt-1 text-sm text-red-700">{error}</p>
          <button
            type="button"
            onClick={fetchJobs}
            className="mt-3 rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700"
          >
            Retry
          </button>
        </div>
      )}

      {!loading && !error && jobs.length === 0 && (
        <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-slate-600 shadow-sm">
          No jobs available in your region.
        </div>
      )}

      {!loading && !error && jobs.length > 0 && (
        <ul className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {jobs.map((job) => (
            <li key={job.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="text-lg font-semibold text-slate-900">{job.title}</div>

              <div className="mt-3 flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700">
                  {job.tradeCategory || "General"}
                </span>
                <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700">
                  {job.urbanOrRegional || (job.jobType === "regional" ? "Regional" : "Urban")}
                </span>
              </div>

              <div className="mt-4 text-sm text-slate-600">
                {[job.city, job.regionCode ?? job.provinceCode, job.countryCode].filter(Boolean).join(", ") || "Location unknown"}
              </div>

              {(job.appraisalTotal ?? job.budgetCents) ? (
                <div className="mt-1 text-sm font-medium text-slate-900">
                  {formatCents(job.appraisalTotal ?? job.budgetCents ?? 0)}
                </div>
              ) : null}

              <div className="mt-1 text-xs text-slate-500">
                {formatRelativeTime(job.createdAt ?? job.postedAt)}
              </div>

              {job.status && (
                <div className="mt-1 text-xs text-slate-400">
                  {job.status}{job.routingStatus ? ` / ${job.routingStatus}` : ""}
                </div>
              )}

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

      {/* Diagnostics drawer -- closed by default */}
      <details className="rounded-xl border border-slate-200 bg-slate-50 text-xs text-slate-500">
        <summary className="cursor-pointer select-none px-4 py-2 font-medium">
          Diagnostics
        </summary>
        <div className="space-y-1 border-t border-slate-200 px-4 py-3 font-mono">
          <div>Endpoint: {ENDPOINT}</div>
          <div>Jobs returned: {jobs.length}</div>
          <div>First job ID: {jobs[0]?.id ?? "(none)"}</div>
          <div>Last fetched: {lastFetchedAt ?? "(not yet)"}</div>
          <div>Response keys: {JSON.stringify(responseKeys)}</div>
        </div>

        <div className="border-t border-slate-200 px-4 py-3">
          <button
            type="button"
            onClick={runSelfCheck}
            disabled={selfCheckLoading}
            className="rounded border border-slate-300 bg-white px-3 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-50"
          >
            {selfCheckLoading ? "Checking..." : "Run self-check"}
          </button>

          {selfCheck && (
            <div className="mt-2 space-y-1 font-mono">
              <div>Router jurisdiction: {selfCheck.jurisdiction ?? "(unknown)"}</div>
              <div>Profile loaded: {selfCheck.profileLoaded ? "yes" : "no"}</div>
              <div>Summary loaded: {selfCheck.summaryLoaded ? "yes" : "no"}</div>
              {selfCheck.error && <div className="text-red-600">Error: {selfCheck.error}</div>}
            </div>
          )}
        </div>
      </details>
    </div>
  );
}
