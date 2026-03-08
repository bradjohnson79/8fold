"use client";

import React, { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useAuth } from "@clerk/nextjs";
import { apiFetch } from "@/lib/routerApi";

type AssignedJob = {
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
  completedAt: null;
};

type CompletedJob = {
  id: string;
  title?: string;
  scope?: string;
  region?: string;
  status: string;
  assignedAt: string;
  completedAt: string;
  contractorMarkedCompleteAt?: string | null;
  posterMarkedCompleteAt?: string | null;
  payoutStatus: "NOT_READY" | "READY" | "RELEASED" | "FAILED" | string;
  contractorPayoutCents: number;
};

function statusBadge(status: string) {
  const s = status.toUpperCase();
  const colorMap: Record<string, string> = {
    ASSIGNED: "bg-blue-100 text-blue-800",
    JOB_STARTED: "bg-amber-100 text-amber-800",
    IN_PROGRESS: "bg-amber-100 text-amber-800",
    COMPLETED: "bg-emerald-100 text-emerald-800",
  };
  const cls = colorMap[s] ?? "bg-slate-100 text-slate-700";
  return (
    <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${cls}`}>
      {s.replace(/_/g, " ")}
    </span>
  );
}

function payoutBadge(payoutStatus: string, payoutCents: number) {
  const s = (payoutStatus ?? "").toUpperCase();
  if (s === "RELEASED") {
    return (
      <span className="inline-flex rounded-full bg-emerald-600 px-2.5 py-0.5 text-xs font-semibold text-white">
        PAID {payoutCents > 0 ? `· $${(payoutCents / 100).toFixed(2)}` : ""}
      </span>
    );
  }
  if (s === "READY") {
    return (
      <span className="inline-flex rounded-full bg-sky-100 px-2.5 py-0.5 text-xs font-semibold text-sky-800">
        PAYOUT READY {payoutCents > 0 ? `· $${(payoutCents / 100).toFixed(2)}` : ""}
      </span>
    );
  }
  if (s === "FAILED") {
    return (
      <span className="inline-flex rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-semibold text-red-700">
        PAYOUT FAILED
      </span>
    );
  }
  return (
    <span className="inline-flex rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-600">
      PAYOUT PENDING
    </span>
  );
}

export default function ContractorJobsPage() {
  const { getToken } = useAuth();
  const [tab, setTab] = useState<"assigned" | "completed">("assigned");
  const [assignedJobs, setAssignedJobs] = useState<AssignedJob[]>([]);
  const [completedJobs, setCompletedJobs] = useState<CompletedJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadJobs = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const resp = await apiFetch("/api/web/v4/contractor/jobs", getToken);
      if (resp.status === 401) {
        setError("Authentication lost — please refresh and sign in again.");
        return;
      }
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        setError(data?.error?.message ?? "Failed to load jobs");
        return;
      }
      setAssignedJobs(Array.isArray(data.assignedJobs) ? data.assignedJobs : []);
      setCompletedJobs(Array.isArray(data.completedJobs) ? data.completedJobs : []);
    } catch (e: unknown) {
      if (e instanceof Error && (e as any).code === "AUTH_MISSING_TOKEN") {
        setError("Authentication lost — please refresh and sign in again.");
      } else {
        setError("Failed to load jobs");
      }
    } finally {
      setLoading(false);
    }
  }, [getToken]);

  useEffect(() => { void loadJobs(); }, [loadJobs]);

  const activeList = tab === "assigned" ? assignedJobs : completedJobs;

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Jobs</h1>
        <p className="mt-1 text-sm text-slate-600">Your assigned and completed jobs.</p>
      </div>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setTab("assigned")}
          className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${
            tab === "assigned"
              ? "bg-emerald-600 text-white"
              : "border border-slate-300 text-slate-700 hover:bg-slate-50"
          }`}
        >
          Assigned
          {!loading && assignedJobs.length > 0 && (
            <span className="ml-1.5 rounded-full bg-white/20 px-1.5 py-0.5 text-xs">
              {assignedJobs.length}
            </span>
          )}
        </button>
        <button
          type="button"
          onClick={() => setTab("completed")}
          className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${
            tab === "completed"
              ? "bg-emerald-600 text-white"
              : "border border-slate-300 text-slate-700 hover:bg-slate-50"
          }`}
        >
          Completed
          {!loading && completedJobs.length > 0 && (
            <span className="ml-1.5 rounded-full bg-white/20 px-1.5 py-0.5 text-xs">
              {completedJobs.length}
            </span>
          )}
        </button>
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
      ) : activeList.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
          <p className="text-slate-500">
            {tab === "assigned" ? "No active assigned jobs." : "No completed jobs yet."}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {tab === "assigned"
            ? assignedJobs.map((j) => (
                <Link
                  key={j.id}
                  href={`/dashboard/contractor/jobs/${j.id}`}
                  className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:shadow-md"
                >
                  <div className="flex items-start justify-between gap-3">
                    <h3 className="font-semibold text-slate-900 leading-snug">{j.title ?? "Job"}</h3>
                    {statusBadge(j.status)}
                  </div>
                  {j.scope ? (
                    <p className="mt-2 line-clamp-2 text-sm text-slate-600">{j.scope}</p>
                  ) : null}
                  <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
                    {j.region ? <span>{j.region}</span> : null}
                    <span>Assigned {new Date(j.assignedAt).toLocaleDateString()}</span>
                  </div>
                  {j.executionStatus && j.executionStatus !== "none" ? (
                    <div className="mt-2 text-xs font-medium text-amber-700">
                      {j.executionStatus.replace(/_/g, " ")}
                    </div>
                  ) : null}
                </Link>
              ))
            : completedJobs.map((j) => (
                <Link
                  key={j.id}
                  href={`/dashboard/contractor/jobs/${j.id}`}
                  className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:shadow-md"
                >
                  <div className="flex items-start justify-between gap-3">
                    <h3 className="font-semibold text-slate-900 leading-snug">{j.title ?? "Job"}</h3>
                    <div className="flex shrink-0 flex-col items-end gap-1.5">
                      {statusBadge(j.status)}
                      {payoutBadge(j.payoutStatus, j.contractorPayoutCents)}
                    </div>
                  </div>
                  {j.scope ? (
                    <p className="mt-2 line-clamp-2 text-sm text-slate-600">{j.scope}</p>
                  ) : null}
                  <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
                    {j.region ? <span>{j.region}</span> : null}
                    {j.completedAt ? (
                      <span>Completed {new Date(j.completedAt).toLocaleDateString()}</span>
                    ) : null}
                    {j.contractorMarkedCompleteAt && !j.posterMarkedCompleteAt ? (
                      <span className="font-medium text-amber-600">Awaiting poster report</span>
                    ) : null}
                  </div>
                </Link>
              ))}
        </div>
      )}
    </div>
  );
}
