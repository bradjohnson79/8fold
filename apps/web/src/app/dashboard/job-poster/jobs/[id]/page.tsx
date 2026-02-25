"use client";

import React, { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";

type JobDetail = {
  id: string;
  title: string;
  scope: string;
  status: string;
  routingStatus: string;
  amountCents: number;
  addressFull: string | null;
  tradeCategory: string;
  createdAt: string;
};

export default function JobPosterJobDetailPage() {
  const params = useParams();
  const id = params?.id as string;
  const [job, setJob] = useState<JobDetail | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    (async () => {
      try {
        const resp = await fetch(`/api/web/v4/job-poster/jobs/${id}`, {
          cache: "no-store",
          credentials: "include",
        });
        if (resp.ok) {
          const data = (await resp.json()) as JobDetail;
          setJob(data);
        } else {
          setJob(null);
        }
      } catch {
        setJob(null);
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  if (!id) {
    return (
      <div className="p-6">
        <p className="text-gray-600">Invalid job.</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-bold">Job Detail</h1>
        <p className="mt-2 text-gray-600">Loading…</p>
      </div>
    );
  }

  if (!job) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-bold">Job Detail</h1>
        <p className="mt-2 text-gray-600">Job not found.</p>
        <Link href="/dashboard/job-poster/jobs" className="mt-4 text-blue-600 hover:underline">
          ← Back to jobs
        </Link>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-2xl">
      <Link href="/dashboard/job-poster/jobs" className="text-blue-600 hover:underline text-sm">
        ← Back to jobs
      </Link>
      <h1 className="text-2xl font-bold mt-2">{job.title}</h1>
      <p className="mt-1 text-sm text-gray-500">
        {job.status} · {job.routingStatus} · {job.tradeCategory}
      </p>
      <p className="mt-2 font-medium">${(job.amountCents / 100).toFixed(2)}</p>
      <div className="mt-4">
        <p className="text-sm font-medium text-gray-700">Scope</p>
        <p className="mt-1 text-gray-600 whitespace-pre-wrap">{job.scope}</p>
      </div>
      {job.addressFull && (
        <div className="mt-4">
          <p className="text-sm font-medium text-gray-700">Address</p>
          <p className="mt-1 text-gray-600">{job.addressFull}</p>
        </div>
      )}
      <p className="mt-4 text-sm text-gray-500">Posted {new Date(job.createdAt).toLocaleString()}</p>
    </div>
  );
}
