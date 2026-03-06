"use client";

import React, { useEffect, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { routerApiFetch } from "@/lib/routerApi";

type Job = {
  id: string;
  title: string;
  region: string;
  status: string;
  routingStatus: string;
  claimedAt: string | null;
  routedAt: string | null;
};

export default function RouterRoutedJobsPage() {
  const { getToken } = useAuth();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const resp = await routerApiFetch("/api/web/v4/router/jobs/routed", getToken);
        const json = (await resp.json().catch(() => null)) as any;
        if (!alive) return;
        if (resp.status === 401) {
          setError("Authentication lost — please refresh and sign in again.");
          return;
        }
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

  if (loading) return <div className="p-6 text-slate-600">Loading routed jobs...</div>;

  if (error) {
    return (
      <div className="p-6">
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>
      </div>
    );
  }

  return (
    <div className="space-y-4 p-6">
      <h1 className="text-2xl font-bold text-slate-900">Routed Jobs</h1>
      {jobs.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-slate-600 shadow-sm">
          No routed jobs yet.
        </div>
      ) : (
        <ul className="space-y-3">
          {jobs.map((job) => (
            <li key={job.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-semibold text-slate-900">{job.title}</div>
                  <div className="mt-1 text-sm text-slate-600">
                    {job.region} &middot; {job.routingStatus}
                  </div>
                </div>
                <span
                  className={
                    "shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium " +
                    (job.status === "ASSIGNED" || job.status === "IN_PROGRESS"
                      ? "bg-blue-50 text-blue-700"
                      : job.status === "CONTRACTOR_COMPLETED" || job.status === "CUSTOMER_APPROVED"
                        ? "bg-emerald-50 text-emerald-700"
                        : "bg-slate-100 text-slate-600")
                  }
                >
                  {job.status}
                </span>
              </div>
              {job.routedAt ? (
                <div className="mt-2 text-xs text-slate-500">
                  Routed: {new Date(job.routedAt).toLocaleString()}
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
