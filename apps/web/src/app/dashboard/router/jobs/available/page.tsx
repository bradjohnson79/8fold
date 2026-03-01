"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";

type Job = {
  id: string;
  title: string;
  tradeCategory: string;
  city: string;
  region: string;
  urbanOrRegional: string;
  appraisalTotal: number;
  createdAt: string;
  status: string;
};

function formatMoney(cents: number) {
  return `$${(Math.max(0, Number(cents) || 0) / 100).toFixed(2)}`;
}

function formatPostedTime(iso: string) {
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

export default function RouterAvailableJobsPage() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const resp = await fetch("/api/web/v4/router/available-jobs", { cache: "no-store", credentials: "include" });
        const json = (await resp.json().catch(() => null)) as any;
        if (!alive) return;
        if (!resp.ok) {
          setError(json?.error?.message ?? json?.error ?? "Failed to load jobs");
          return;
        }
        setJobs(json.jobs ?? []);
      } catch {
        if (alive) setError("Failed to load jobs");
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

  return (
    <div className="p-6 space-y-5">
      <h1 className="text-2xl font-bold text-slate-900">Available Jobs</h1>
      <p className="text-sm text-slate-600">Open jobs in your home region, ready to route to contractors.</p>
      {jobs.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-slate-600 shadow-sm">
          No jobs available in your region.
        </div>
      ) : (
        <ul className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {jobs.map((job) => (
            <li key={job.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="text-lg font-semibold text-slate-900">{job.title}</div>
              <div className="mt-3 flex items-center justify-between gap-2">
                <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700">
                  {job.tradeCategory || "General"}
                </span>
                <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700">
                  {job.urbanOrRegional || "Urban"}
                </span>
              </div>
              <div className="mt-4 text-sm text-slate-600">
                {job.city ? `${job.city}, ` : ""}
                {job.region}
              </div>
              <div className="mt-1 text-sm font-medium text-slate-900">Appraisal Total: {formatMoney(job.appraisalTotal)}</div>
              <div className="mt-1 text-xs text-slate-500">{formatPostedTime(job.createdAt)}</div>

              <Link
                href={`/dashboard/router/jobs/${encodeURIComponent(job.id)}/route`}
                className="mt-4 inline-flex rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
              >
                Select Job
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
