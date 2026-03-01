"use client";

import Link from "next/link";
import React from "react";

type PostedJob = {
  id: string;
  title: string;
  status: string;
  routingStatus: string;
  amountCents: number;
  createdAt: string;
};

type AssignedContext = {
  jobId: string;
  jobTitle: string;
  jobStatus: string;
  posterAcceptExpiresAt: string | null;
  contractorUserId: string;
  contractorName: string;
  businessName: string;
  tradeCategory: string;
  yearsExperience: number;
  city: string;
  region: string;
  availabilitySummary: string;
};

type Summary = {
  jobsPosted: number;
  fundsSecuredLabel: string;
  jobAmountPaidLabel: string;
  activePmRequests: number;
  unreadMessages: number;
  paymentConnected: boolean;
  serverTime: string;
  postedJobs: PostedJob[];
  assignedContext: AssignedContext | null;
};

function formatMoney(cents: number) {
  return `$${(Math.max(0, Number(cents ?? 0)) / 100).toFixed(2)}`;
}

function formatCountdown(ms: number) {
  const totalMinutes = Math.max(0, Math.ceil(ms / (60 * 1000)));
  if (totalMinutes >= 60) {
    const hours = Math.ceil(totalMinutes / 60);
    return `${hours} ${hours === 1 ? "Hour" : "Hours"}`;
  }
  return `${totalMinutes} ${totalMinutes === 1 ? "Minute" : "Minutes"}`;
}

function countdownTone(ms: number) {
  if (ms <= 10 * 60 * 1000) return "text-rose-700";
  if (ms <= 60 * 60 * 1000) return "text-amber-700";
  return "text-slate-600";
}

function refreshIntervalMs(ms: number): number {
  if (ms <= 10 * 60 * 1000) return 60 * 1000;
  if (ms <= 15 * 60 * 1000) return 5 * 60 * 1000;
  if (ms <= 30 * 60 * 1000) return 15 * 60 * 1000;
  if (ms <= 60 * 60 * 1000) return 30 * 60 * 1000;
  return 60 * 60 * 1000;
}

export default function JobPosterSummaryPage() {
  const [summary, setSummary] = React.useState<Summary | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [confirmAcceptOpen, setConfirmAcceptOpen] = React.useState(false);
  const [successOpen, setSuccessOpen] = React.useState(false);
  const [accepting, setAccepting] = React.useState(false);
  const [serverOffsetMs, setServerOffsetMs] = React.useState(0);
  const [clockMs, setClockMs] = React.useState(() => Date.now());

  const loadSummary = React.useCallback(async () => {
    setError(null);
    const requestStartedAt = Date.now();
    const resp = await fetch("/api/v4/job-poster/dashboard/summary", {
      cache: "no-store",
      credentials: "include",
    });
    const data = (await resp.json().catch(() => null)) as Summary | null;
    if (!resp.ok || !data) {
      throw new Error("Failed to load dashboard summary");
    }
    const serverTimeMs = new Date(data.serverTime).getTime();
    if (Number.isFinite(serverTimeMs)) {
      setServerOffsetMs(serverTimeMs - requestStartedAt);
    }
    setSummary(data);
    setClockMs(Date.now());
  }, []);

  React.useEffect(() => {
    let alive = true;
    (async () => {
      try {
        await loadSummary();
      } catch {
        if (alive) setError("Failed to load dashboard summary");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [loadSummary]);

  React.useEffect(() => {
    const expiresAt = summary?.assignedContext?.posterAcceptExpiresAt;
    if (!expiresAt) return;
    const remainingMs = new Date(expiresAt).getTime() - (Date.now() + serverOffsetMs);
    if (!Number.isFinite(remainingMs) || remainingMs <= 0) {
      void loadSummary();
      return;
    }
    const delay = Math.max(10 * 1000, Math.min(refreshIntervalMs(remainingMs), remainingMs));
    const timer = window.setTimeout(() => {
      void loadSummary();
    }, delay);
    return () => window.clearTimeout(timer);
  }, [summary?.assignedContext?.posterAcceptExpiresAt, loadSummary, serverOffsetMs]);

  React.useEffect(() => {
    if (!successOpen || !summary?.assignedContext?.jobId) return;
    const timer = window.setTimeout(() => {
      window.location.href = `/dashboard/job-poster/messages?jobId=${encodeURIComponent(summary.assignedContext!.jobId)}`;
    }, 3000);
    return () => window.clearTimeout(timer);
  }, [successOpen, summary?.assignedContext?.jobId]);

  async function handleAcceptAssigned() {
    if (!summary?.assignedContext || accepting) return;
    setAccepting(true);
    setError(null);
    try {
      const resp = await fetch(`/api/v4/job-poster/jobs/${encodeURIComponent(summary.assignedContext.jobId)}/accept-assigned-contractor`, {
        method: "POST",
        credentials: "include",
      });
      const payload = (await resp.json().catch(() => ({}))) as { error?: { message?: string } | string };
      if (!resp.ok) {
        const message =
          typeof payload.error === "string" ? payload.error : payload.error?.message ?? "Failed to accept contractor";
        setError(message);
        return;
      }
      setConfirmAcceptOpen(false);
      setSuccessOpen(true);
      await loadSummary();
    } catch {
      setError("Failed to accept contractor");
    } finally {
      setAccepting(false);
    }
  }

  if (loading) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-bold">Job Poster Dashboard</h1>
        <p className="mt-2 text-gray-600">Loading...</p>
      </div>
    );
  }

  const assigned = summary?.assignedContext ?? null;
  const remainingMs = assigned?.posterAcceptExpiresAt
    ? new Date(assigned.posterAcceptExpiresAt).getTime() - (clockMs + serverOffsetMs)
    : 0;

  return (
    <div className="p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Job Poster Dashboard</h1>
          <p className="mt-1 text-slate-600">Manage posted jobs, assigned contractors, and next actions.</p>
        </div>
        <Link
          href="/post-job"
          className="inline-flex rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
        >
          Post a Job
        </Link>
      </div>

      {error ? <p className="mt-4 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p> : null}

      <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <MetricCard title="Jobs Posted" value={String(summary?.jobsPosted ?? 0)} subtitle="Total non-draft jobs" />
        <MetricCard title="Funds Secured" value={summary?.fundsSecuredLabel ?? "—"} subtitle="Captured job funds" />
        <MetricCard title="Payment Status" value={summary?.paymentConnected ? "Connected" : "Not Connected"} subtitle="Stripe setup" />
        <MetricCard title="Active P&M Requests" value={String(summary?.activePmRequests ?? 0)} subtitle="Pending material requests" />
        <MetricCard title="Unread Messages" value={String(summary?.unreadMessages ?? 0)} subtitle="New messages in threads" />
        <MetricCard title="Job Amount Paid" value={summary?.jobAmountPaidLabel ?? "Coming Soon"} subtitle="Release totals" />
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">Posted Jobs</h2>
          {summary?.postedJobs?.length ? (
            <div className="mt-4 space-y-3">
              {summary.postedJobs.map((job) => (
                <article key={job.id} className="rounded-xl border border-slate-200 p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h3 className="font-semibold text-slate-900">{job.title}</h3>
                      <p className="mt-1 text-sm text-slate-600">
                        {job.status} · {job.routingStatus}
                      </p>
                      <p className="mt-1 text-sm text-slate-500">
                        Posted {job.createdAt ? new Date(job.createdAt).toLocaleString() : "—"}
                      </p>
                    </div>
                    <span className="text-sm font-semibold text-emerald-700">{formatMoney(job.amountCents)}</span>
                  </div>
                  <div className="mt-3">
                    <Link
                      href={`/dashboard/job-poster/jobs/${job.id}`}
                      className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
                    >
                      View Job
                    </Link>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <p className="mt-3 text-sm text-slate-500">No posted jobs yet.</p>
          )}
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">Assigned Contractor</h2>
          {!assigned ? (
            <p className="mt-3 text-sm text-slate-500">No assigned contractor context right now.</p>
          ) : (
            <div className="mt-3 space-y-1 text-sm text-slate-700">
              <p className="font-semibold text-slate-900">{assigned.jobTitle}</p>
              <p>
                <span className="font-medium">Contractor:</span> {assigned.contractorName}
              </p>
              <p>
                <span className="font-medium">Business:</span> {assigned.businessName}
              </p>
              <p>
                <span className="font-medium">Trade:</span> {assigned.tradeCategory}
              </p>
              <p>
                <span className="font-medium">Experience:</span> {assigned.yearsExperience} years
              </p>
              <p>
                <span className="font-medium">Location:</span> {[assigned.city, assigned.region].filter(Boolean).join(", ") || "Not provided"}
              </p>
              <p>
                <span className="font-medium">Availability:</span> {assigned.availabilitySummary}
              </p>
              {assigned.jobStatus.toUpperCase() === "ASSIGNED" && assigned.posterAcceptExpiresAt ? (
                <p className={`pt-2 font-semibold ${countdownTone(remainingMs)}`}>
                  Expires in: {remainingMs > 0 ? formatCountdown(remainingMs) : "Expired"}
                </p>
              ) : null}

              {assigned.jobStatus.toUpperCase() === "ASSIGNED" ? (
                <button
                  type="button"
                  onClick={() => setConfirmAcceptOpen(true)}
                  className="mt-3 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
                >
                  Accept
                </button>
              ) : (
                <Link
                  href={`/dashboard/job-poster/messages?jobId=${encodeURIComponent(assigned.jobId)}`}
                  className="mt-3 inline-block rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Open Messages
                </Link>
              )}
            </div>
          )}
        </section>
      </div>

      {confirmAcceptOpen ? (
        <ModalShell onClose={() => setConfirmAcceptOpen(false)}>
          <h3 className="text-xl font-semibold text-slate-900">Confirm Acceptance</h3>
          <p className="mt-2 text-sm text-slate-700">
            Confirm you want to accept this assigned contractor and continue in messages.
          </p>
          <div className="mt-4 flex gap-2">
            <button
              type="button"
              onClick={() => void handleAcceptAssigned()}
              disabled={accepting}
              className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              {accepting ? "Confirming..." : "Yes, Accept"}
            </button>
            <button
              type="button"
              onClick={() => setConfirmAcceptOpen(false)}
              className="rounded-md border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              Cancel
            </button>
          </div>
        </ModalShell>
      ) : null}

      {successOpen ? (
        <ModalShell onClose={() => setSuccessOpen(false)}>
          <h3 className="text-xl font-semibold text-slate-900">Congratulations!</h3>
          <p className="mt-2 text-sm text-slate-700">
            Stand by while you&apos;re redirected to messages to coordinate with your contractor.
          </p>
        </ModalShell>
      ) : null}
    </div>
  );
}

function MetricCard(props: { title: string; value: string; subtitle: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-sm font-medium text-slate-600">{props.title}</p>
      <p className="mt-2 text-2xl font-semibold text-slate-900">{props.value}</p>
      <p className="mt-1 text-xs text-slate-500">{props.subtitle}</p>
    </div>
  );
}

function ModalShell(props: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 px-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
        {props.children}
        <button
          type="button"
          onClick={props.onClose}
          className="mt-4 text-xs font-medium text-slate-500 hover:text-slate-700"
        >
          Close
        </button>
      </div>
    </div>
  );
}
