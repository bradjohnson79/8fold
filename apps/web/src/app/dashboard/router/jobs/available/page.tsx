"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";

type Job = {
  id: string;
  title: string;
  region: string;
  status: string;
  budgetCents: number;
  publishedAt: string;
};

export default function RouterAvailableJobsPage() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const resp = await fetch("/api/v4/router/jobs/available", { cache: "no-store", credentials: "include" });
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
    <div className="p-6 space-y-4">
      <h1 className="text-2xl font-bold">Available Jobs</h1>
      <p className="text-gray-600 dark:text-gray-400">
        Jobs in your region that have not yet been routed. Use the legacy router flow to route jobs with contractor selection.
      </p>
      {jobs.length === 0 ? (
        <div className="rounded-xl bg-white p-6 shadow dark:bg-zinc-900">No available jobs in your region.</div>
      ) : (
        <ul className="space-y-2">
          {jobs.map((job) => (
            <li key={job.id} className="rounded-xl bg-white p-4 shadow dark:bg-zinc-900">
              <div className="font-medium">{job.title}</div>
              <div className="text-sm text-gray-600 dark:text-gray-400">
                {job.region} · ${(job.budgetCents / 100).toFixed(2)}
              </div>
              <div className="text-xs text-gray-500 mt-1">ID: {job.id}</div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
