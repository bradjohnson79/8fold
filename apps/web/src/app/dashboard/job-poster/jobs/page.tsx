"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@clerk/nextjs";
import { apiFetch } from "@/lib/routerApi";

type Job = {
  id: string;
  title?: string;
  status?: string;
  routingStatus?: string;
  amountCents?: number;
  createdAt?: string;
};

const STATUS_COLORS: Record<string, string> = {
  OPEN_FOR_ROUTING: "bg-emerald-50 text-emerald-700",
  ASSIGNED: "bg-blue-50 text-blue-700",
  IN_PROGRESS: "bg-amber-50 text-amber-700",
  COMPLETED: "bg-slate-100 text-slate-700",
  CANCELLED: "bg-red-50 text-red-700",
};

function StatusBadge({ value }: { value: string }) {
  const color = STATUS_COLORS[value] ?? "bg-slate-100 text-slate-700";
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${color}`}>
      {value}
    </span>
  );
}

function formatMoney(cents: number | null | undefined) {
  return `$${(Math.max(0, Number(cents ?? 0) || 0) / 100).toFixed(2)}`;
}

export default function JobPosterJobsPage() {
  const { getToken } = useAuth();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const resp = await apiFetch("/api/web/v4/job-poster/jobs", getToken);
        if (!alive) return;
        if (resp.status === 401) {
          setError("Authentication lost — please refresh and sign in again.");
          return;
        }
        const data = (await resp.json().catch(() => ({}))) as { jobs?: Job[]; error?: { message?: string } | string };
        if (!resp.ok) {
          const message = typeof data.error === "string" ? data.error : data?.error?.message ?? "Failed to load jobs";
          setError(message);
          return;
        }
        setJobs(Array.isArray(data.jobs) ? data.jobs : []);
      } catch {
        if (alive) setError("Failed to load jobs");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [getToken]);

  if (loading) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-bold text-slate-900">My Jobs</h1>
        <p className="mt-2 text-sm text-slate-600">Loading...</p>
      </div>
    );
  }

  return (
    <div className="space-y-5 p-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">My Jobs</h1>
        <p className="mt-1 text-sm text-slate-600">Your posted jobs (excluding drafts).</p>
      </div>

      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>
      ) : null}

      {jobs.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-slate-600 shadow-sm">
          No jobs yet. <Link href="/post-job" className="font-medium text-emerald-700 hover:underline">Post your first job</Link>.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {jobs.map((job) => (
            <article key={job.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-start justify-between gap-2">
                <h3 className="font-semibold text-slate-900">{job.title ?? "Untitled"}</h3>
                <span className="text-sm font-semibold text-emerald-700">{formatMoney(job.amountCents)}</span>
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {job.status ? <StatusBadge value={job.status} /> : null}
                {job.routingStatus ? <StatusBadge value={job.routingStatus} /> : null}
              </div>
              <p className="mt-2 text-sm text-slate-500">
                Posted {job.createdAt ? new Date(job.createdAt).toLocaleDateString() : "—"}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Link href={`/dashboard/job-poster/jobs/${job.id}`} className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50">
                  View Job
                </Link>
                <Link href={`/dashboard/job-poster/messages?jobId=${encodeURIComponent(job.id)}`} className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50">
                  Messenger
                </Link>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
