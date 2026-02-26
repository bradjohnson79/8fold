"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";

type Invite = { id: string; jobId: string; title?: string; status: string; createdAt: string };
type JobSummary = { jobId: string; title?: string; assignmentStatus: string; assignedAt: string };

export default function ContractorOverviewPage() {
  const [invites, setInvites] = useState<Invite[]>([]);
  const [assignedJobs, setAssignedJobs] = useState<JobSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const [invResp, jobsResp] = await Promise.all([
          fetch("/api/v4/contractor/invites", { cache: "no-store", credentials: "include" }),
          fetch("/api/v4/contractor/jobs?status=assigned", { cache: "no-store", credentials: "include" }),
        ]);
        if (invResp.ok) {
          const invData = (await invResp.json()) as { invites?: Invite[] };
          setInvites(Array.isArray(invData.invites) ? invData.invites : []);
        }
        if (jobsResp.ok) {
          const jobsData = (await jobsResp.json()) as { jobs?: { id: string; title?: string; status: string; assignedAt: string }[] };
          const items = Array.isArray(jobsData.jobs) ? jobsData.jobs : [];
          setAssignedJobs(
            items.map((j) => ({
              jobId: j.id ?? "",
              title: j.title,
              assignmentStatus: j.status ?? "",
              assignedAt: j.assignedAt ?? "",
            }))
          );
        }
      } catch {
        setInvites([]);
        setAssignedJobs([]);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-bold">Contractor Dashboard</h1>
        <p className="mt-2 text-gray-600">Loading…</p>
      </div>
    );
  }

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold">Contractor Dashboard</h1>
      <p className="mt-1 text-gray-600">Overview of your invites and assigned jobs.</p>

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Link
          href="/dashboard/contractor/invites"
          className="rounded-lg border border-gray-200 p-4 hover:bg-gray-50"
        >
          <p className="text-sm font-medium text-gray-500">Pending Invites</p>
          <p className="mt-1 text-2xl font-bold">{invites.length}</p>
        </Link>
        <Link
          href="/dashboard/contractor/jobs"
          className="rounded-lg border border-gray-200 p-4 hover:bg-gray-50"
        >
          <p className="text-sm font-medium text-gray-500">Assigned Jobs</p>
          <p className="mt-1 text-2xl font-bold">{assignedJobs.length}</p>
        </Link>
      </div>

      {invites.length > 0 && (
        <div className="mt-8">
          <h2 className="text-lg font-semibold">Pending Invites</h2>
          <ul className="mt-2 space-y-2">
            {invites.slice(0, 5).map((inv) => (
              <li key={inv.id}>
                <Link
                  href={`/dashboard/contractor/invites?job=${inv.jobId}`}
                  className="block rounded-lg border border-gray-200 p-3 hover:bg-gray-50"
                >
                  <span className="font-medium">{inv.title ?? "Job"}</span>
                  <span className="ml-2 text-sm text-gray-500">
                    {new Date(inv.createdAt).toLocaleDateString()}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
          <Link
            href="/dashboard/contractor/invites"
            className="mt-2 inline-block text-sm font-medium text-gray-600 hover:text-gray-900"
          >
            View all invites →
          </Link>
        </div>
      )}

      {assignedJobs.length > 0 && (
        <div className="mt-8">
          <h2 className="text-lg font-semibold">Assigned Jobs</h2>
          <ul className="mt-2 space-y-2">
            {assignedJobs.slice(0, 5).map((a) => (
              <li key={a.jobId}>
                <Link
                  href={`/dashboard/contractor/jobs/${a.jobId}`}
                  className="block rounded-lg border border-gray-200 p-3 hover:bg-gray-50"
                >
                  <span className="font-medium">{a.title ?? "Job"}</span>
                  <span className="ml-2 text-sm text-gray-500">{a.assignmentStatus}</span>
                  <span className="ml-2 text-sm text-gray-400">
                    {new Date(a.assignedAt).toLocaleDateString()}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
          <Link
            href="/dashboard/contractor/jobs"
            className="mt-2 inline-block text-sm font-medium text-gray-600 hover:text-gray-900"
          >
            View all jobs →
          </Link>
        </div>
      )}

      {invites.length === 0 && assignedJobs.length === 0 && (
        <p className="mt-6 text-gray-500">No pending invites or assigned jobs.</p>
      )}
    </div>
  );
}
