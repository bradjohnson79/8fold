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

  if (loading) return <div className="p-6">Loading...</div>;
  if (error) return <div className="p-6 text-red-700">{error}</div>;

  return (
    <div className="p-6 space-y-4">
      <h1 className="text-2xl font-bold">Routed Jobs</h1>
      {jobs.length === 0 ? (
        <div className="rounded-xl bg-white p-6 shadow dark:bg-zinc-900">No routed jobs yet.</div>
      ) : (
        <ul className="space-y-2">
          {jobs.map((job) => (
            <li key={job.id} className="rounded-xl bg-white p-4 shadow dark:bg-zinc-900">
              <div className="font-medium">{job.title}</div>
              <div className="text-sm text-gray-600 dark:text-gray-400">
                {job.region} · {job.status} · {job.routingStatus}
              </div>
              {job.routedAt && (
                <div className="text-xs text-gray-500 mt-1">Routed: {new Date(job.routedAt).toLocaleString()}</div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
