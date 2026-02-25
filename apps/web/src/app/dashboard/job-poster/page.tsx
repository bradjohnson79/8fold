"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";

type Summary = {
  jobsPosted: number;
  fundsSecuredLabel: string;
  jobAmountPaidLabel: string;
  activePmRequests: number;
  unreadMessages: number;
  paymentConnected: boolean;
};

export default function JobPosterSummaryPage() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const resp = await fetch("/api/v4/job-poster/dashboard/summary", {
          cache: "no-store",
          credentials: "include",
        });
        if (resp.ok) {
          const data = (await resp.json()) as Summary;
          setSummary(data);
        }
      } catch {
        setSummary(null);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-bold">Job Poster Dashboard</h1>
        <p className="mt-2 text-gray-600">Loading…</p>
      </div>
    );
  }

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold">Job Poster Dashboard</h1>
      <p className="mt-1 text-gray-600">Overview of your jobs and activity.</p>

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Link
          href="/dashboard/job-poster/jobs"
          className="rounded-lg border border-gray-200 p-4 hover:bg-gray-50"
        >
          <p className="text-sm font-medium text-gray-500">Jobs Posted</p>
          <p className="mt-1 text-2xl font-bold">{summary?.jobsPosted ?? 0}</p>
        </Link>
        <div className="rounded-lg border border-gray-200 p-4">
          <p className="text-sm font-medium text-gray-500">Funds Secured</p>
          <p className="mt-1 text-2xl font-bold">{summary?.fundsSecuredLabel ?? "—"}</p>
        </div>
        <div className="rounded-lg border border-gray-200 p-4">
          <p className="text-sm font-medium text-gray-500">Job Amount Paid</p>
          <p className="mt-1 text-2xl font-bold">{summary?.jobAmountPaidLabel ?? "Coming Soon"}</p>
        </div>
        <Link
          href="/dashboard/job-poster/pm"
          className="rounded-lg border border-gray-200 p-4 hover:bg-gray-50"
        >
          <p className="text-sm font-medium text-gray-500">Active P&M Requests</p>
          <p className="mt-1 text-2xl font-bold">{summary?.activePmRequests ?? 0}</p>
        </Link>
        <Link
          href="/dashboard/job-poster/messages"
          className="rounded-lg border border-gray-200 p-4 hover:bg-gray-50"
        >
          <p className="text-sm font-medium text-gray-500">Unread Messages</p>
          <p className="mt-1 text-2xl font-bold">{summary?.unreadMessages ?? 0}</p>
        </Link>
        <Link
          href="/dashboard/job-poster/payment"
          className="rounded-lg border border-gray-200 p-4 hover:bg-gray-50"
        >
          <p className="text-sm font-medium text-gray-500">Payment Status</p>
          <p className="mt-1 text-2xl font-bold">
            {summary?.paymentConnected ? "Connected" : "Not Connected"}
          </p>
        </Link>
      </div>

      <div className="mt-8">
        <Link
          href="/post-job"
          className="inline-flex rounded-md bg-gray-900 px-4 py-2 text-sm font-semibold text-white hover:bg-gray-800"
        >
          Post a Job
        </Link>
      </div>
    </div>
  );
}
