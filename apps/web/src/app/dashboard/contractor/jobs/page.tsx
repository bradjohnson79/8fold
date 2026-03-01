"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";

type Job = {
  id: string;
  title?: string;
  scope?: string;
  region?: string;
  status: string;
  assignedAt: string;
};

export default function ContractorJobsPage() {
  const [tab, setTab] = useState<"assigned" | "completed">("assigned");
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    (async () => {
      try {
        const resp = await fetch(`/api/web/v4/contractor/jobs?status=${tab}`, {
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
  }, [tab]);

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold">Jobs</h1>
      <p className="mt-1 text-gray-600">Your assigned and completed jobs.</p>

      <div className="mt-4 flex gap-2">
        <button
          type="button"
          onClick={() => setTab("assigned")}
          className={`rounded-md px-4 py-2 text-sm font-medium ${
            tab === "assigned" ? "bg-gray-900 text-white" : "border border-gray-300 hover:bg-gray-50"
          }`}
        >
          Assigned
        </button>
        <button
          type="button"
          onClick={() => setTab("completed")}
          className={`rounded-md px-4 py-2 text-sm font-medium ${
            tab === "completed" ? "bg-gray-900 text-white" : "border border-gray-300 hover:bg-gray-50"
          }`}
        >
          Completed
        </button>
      </div>

      <div className="mt-6">
        {loading ? (
          <p className="text-gray-600">Loading…</p>
        ) : jobs.length === 0 ? (
          <p className="text-gray-500">No {tab} jobs.</p>
        ) : (
          <ul className="space-y-2">
            {jobs.map((j) => (
              <li key={j.id}>
                <Link
                  href={`/dashboard/contractor/jobs/${j.id}`}
                  className="block rounded-lg border border-gray-200 p-4 hover:bg-gray-50"
                >
                  <span className="font-medium">{j.title ?? "Job"}</span>
                  <span className="ml-2 text-sm text-gray-500">{j.status}</span>
                  <span className="ml-2 text-sm text-gray-400">
                    {new Date(j.assignedAt).toLocaleDateString()}
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
