"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";

type Job = {
  id: string;
  title?: string;
  status?: string;
  routingStatus?: string;
  amountCents?: number;
  createdAt?: string;
};

export default function JobPosterJobsPage() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const resp = await fetch("/api/web/v4/job-poster/jobs", {
          cache: "no-store",
          credentials: "include",
        });
        if (resp.ok) {
          const data = (await resp.json()) as { jobs?: Job[] };
          setJobs(Array.isArray(data.jobs) ? data.jobs : []);
        }
      } catch {
        setJobs([]);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-bold">My Jobs</h1>
        <p className="mt-2 text-gray-600">Loading…</p>
      </div>
    );
  }

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold">My Jobs</h1>
      <p className="mt-1 text-gray-600">Your posted jobs (excluding drafts).</p>

      <div className="mt-6">
        {jobs.length === 0 ? (
          <p className="text-gray-500">No jobs yet.</p>
        ) : (
          <ul className="space-y-2">
            {jobs.map((j) => (
              <li key={j.id}>
                <Link
                  href={`/dashboard/job-poster/jobs/${j.id}`}
                  className="block rounded-lg border border-gray-200 p-4 hover:bg-gray-50"
                >
                  <span className="font-medium">{j.title ?? "Untitled"}</span>
                  <span className="ml-2 text-sm text-gray-500">
                    {j.status ?? "—"} · {j.routingStatus ?? "—"} · $
                    {((j.amountCents ?? 0) / 100).toFixed(2)}
                  </span>
                  <span className="ml-2 text-sm text-gray-400">
                    {j.createdAt ? new Date(j.createdAt).toLocaleDateString() : "—"}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
