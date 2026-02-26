"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";

type PmRequest = {
  id: string;
  jobId: string;
  jobTitle: string | null;
  status: string;
  total: string;
  createdAt: string;
  items: { description: string; qty: number; unitPrice: string; lineTotal: string }[];
};

export default function JobPosterPmPage() {
  const [requests, setRequests] = useState<PmRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [actioning, setActioning] = useState<string | null>(null);

  const fetchRequests = async () => {
    setLoading(true);
    try {
      const resp = await fetch("/api/web/v4/pm/requests?role=job_poster", {
        cache: "no-store",
        credentials: "include",
      });
      if (resp.ok) {
        const data = (await resp.json()) as { requests?: PmRequest[] };
        setRequests(Array.isArray(data.requests) ? data.requests : []);
      }
    } catch {
      setRequests([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRequests();
  }, []);

  const handleApprove = async (id: string) => {
    setActioning(id);
    try {
      const resp = await fetch(`/api/web/v4/pm/requests/${id}/approve`, {
        method: "POST",
        credentials: "include",
      });
      if (resp.ok) fetchRequests();
    } finally {
      setActioning(null);
    }
  };

  const handleReject = async (id: string) => {
    setActioning(id);
    try {
      const resp = await fetch(`/api/web/v4/pm/requests/${id}/reject`, {
        method: "POST",
        credentials: "include",
      });
      if (resp.ok) fetchRequests();
    } finally {
      setActioning(null);
    }
  };

  if (loading) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-bold">Parts & Materials</h1>
        <p className="mt-2 text-gray-600">Loading…</p>
      </div>
    );
  }

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold">Parts & Materials</h1>
      <p className="mt-1 text-gray-600">P&M requests from contractors.</p>

      <div className="mt-6 space-y-4 max-w-2xl">
        {requests.length === 0 ? (
          <p className="text-gray-500">No P&M requests yet.</p>
        ) : (
          requests.map((r) => (
            <div key={r.id} className="rounded-lg border border-gray-200 p-4">
              <div className="flex justify-between items-start">
                <div>
                  <Link href={`/dashboard/job-poster/jobs/${r.jobId}`} className="font-medium text-blue-600 hover:underline">
                    {r.jobTitle ?? `Job ${r.jobId.slice(0, 8)}`}
                  </Link>
                  <span className="ml-2 text-sm text-gray-500">Status: {r.status}</span>
                </div>
                <span className="text-sm text-gray-600">${r.total}</span>
              </div>
              <ul className="mt-2 text-sm text-gray-600">
                {r.items.map((i, idx) => (
                  <li key={idx}>
                    {i.description} × {i.qty} @ ${i.unitPrice} = ${i.lineTotal}
                  </li>
                ))}
              </ul>
              {r.status === "PENDING" && (
                <div className="mt-3 flex gap-2">
                  <button
                    type="button"
                    onClick={() => handleApprove(r.id)}
                    disabled={actioning === r.id}
                    className="rounded-md bg-green-600 px-3 py-1.5 text-sm text-white hover:bg-green-500 disabled:opacity-50"
                  >
                    {actioning === r.id ? "…" : "Approve"}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleReject(r.id)}
                    disabled={actioning === r.id}
                    className="rounded-md border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-50 disabled:opacity-50"
                  >
                    {actioning === r.id ? "…" : "Reject"}
                  </button>
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
