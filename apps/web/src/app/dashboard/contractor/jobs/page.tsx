"use client";

import React, { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useAuth } from "@clerk/nextjs";
import { apiFetch } from "@/lib/routerApi";

type Job = {
  id: string;
  title?: string;
  scope?: string;
  region?: string;
  status: string;
  assignedAt: string;
  executionStatus?: string;
  canMarkComplete?: boolean;
  contractorMarkedCompleteAt?: string | null;
  posterMarkedCompleteAt?: string | null;
  completedAt?: string | null;
};

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    assigned: "bg-blue-100 text-blue-700",
    completed: "bg-emerald-100 text-emerald-700",
    in_progress: "bg-amber-100 text-amber-700",
  };
  const cls = colors[status.toLowerCase()] ?? "bg-slate-100 text-slate-700";
  return (
    <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${cls}`}>
      {status.replace(/_/g, " ")}
    </span>
  );
}

export default function ContractorJobsPage() {
  const { getToken } = useAuth();
  const [tab, setTab] = useState<"assigned" | "completed">("assigned");
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadJobs = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const resp = await apiFetch(`/api/web/v4/contractor/jobs?status=${tab}`, getToken);
      if (resp.status === 401) {
        setError("Authentication lost — please refresh and sign in again.");
        return;
      }
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        setError(data?.error?.message ?? "Failed to load jobs");
        return;
      }
      setJobs(Array.isArray(data.jobs) ? data.jobs : []);
    } catch (e: unknown) {
      if (e instanceof Error && (e as any).code === "AUTH_MISSING_TOKEN") {
        setError("Authentication lost — please refresh and sign in again.");
      } else {
        setError("Failed to load jobs");
      }
    } finally {
      setLoading(false);
    }
  }, [tab, getToken]);

  useEffect(() => { void loadJobs(); }, [loadJobs]);

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Jobs</h1>
        <p className="mt-1 text-sm text-slate-600">Your assigned and completed jobs.</p>
      </div>

      <div className="flex gap-2">
        {(["assigned", "completed"] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${
              tab === t
                ? "bg-emerald-600 text-white"
                : "border border-slate-300 text-slate-700 hover:bg-slate-50"
            }`}
          >
            {t === "assigned" ? "Assigned" : "Completed"}
          </button>
        ))}
      </div>

      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      ) : null}

      {loading ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-32 animate-pulse rounded-2xl border border-slate-200 bg-slate-50" />
          ))}
        </div>
      ) : jobs.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
          <p className="text-slate-500">No {tab} jobs.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {jobs.map((j) => (
            <Link
              key={j.id}
              href={`/dashboard/contractor/jobs/${j.id}`}
              className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:shadow-md"
            >
              <div className="flex items-start justify-between gap-3">
                <h3 className="font-semibold text-slate-900">{j.title ?? "Job"}</h3>
                <StatusBadge status={j.status} />
              </div>
              {j.scope ? (
                <p className="mt-2 line-clamp-2 text-sm text-slate-600">{j.scope}</p>
              ) : null}
              <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
                {j.region ? <span>{j.region}</span> : null}
                <span>Assigned {new Date(j.assignedAt).toLocaleDateString()}</span>
                {j.completedAt ? (
                  <span>Completed {new Date(j.completedAt).toLocaleDateString()}</span>
                ) : null}
              </div>
              {j.executionStatus && j.executionStatus !== "none" ? (
                <div className="mt-2 text-xs font-medium text-amber-700">
                  {j.executionStatus.replace(/_/g, " ")}
                </div>
              ) : null}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
