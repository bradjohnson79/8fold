"use client";

import Link from "next/link";
import React from "react";

type Summary = {
  jobsPosted: number;
  fundsSecured: number;
  paymentStatus: "CONNECTED" | "NOT_CONNECTED";
  unreadMessages: number;
  activeAssignments: number;
};

type JobItem = {
  id: string;
  title: string;
  status: string;
  routingStatus: string;
  amountCents: number;
  createdAt: string;
};

type Thread = {
  id: string;
  jobId: string;
  jobTitle: string | null;
  jobStatus?: string | null;
  contractorName?: string | null;
  contractorBusinessName?: string | null;
  appointmentAt?: string | null;
  appointmentAcceptedAt?: string | null;
};

type ScoreAppraisalState = {
  pending: boolean;
  jobsEvaluated: number;
  minimumRequired: number;
  appraisal?: {
    avgCooperation: number | null;
    avgCommunication: number | null;
    totalScore: number | null;
  };
} | null;

function formatMoney(centsLike: number | null | undefined) {
  const cents = Math.max(0, Number(centsLike ?? 0) || 0);
  return `$${(cents / 100).toFixed(2)}`;
}

function toBadgeStatus(thread: Thread): "ASSIGNED" | "APPOINTMENT_BOOKED" | "APPOINTMENT_ACCEPTED" | null {
  const status = String(thread.jobStatus ?? "").toUpperCase();
  if (status === "ASSIGNED") return "ASSIGNED";
  if (thread.appointmentAt && thread.appointmentAcceptedAt) return "APPOINTMENT_ACCEPTED";
  if (thread.appointmentAt) return "APPOINTMENT_BOOKED";
  return null;
}

export default function JobPosterSummaryPage() {
  const [summary, setSummary] = React.useState<Summary | null>(null);
  const [jobs, setJobs] = React.useState<JobItem[]>([]);
  const [assigned, setAssigned] = React.useState<Thread | null>(null);
  const [scoreAppraisal, setScoreAppraisal] = React.useState<ScoreAppraisalState>(null);

  const [summaryLoading, setSummaryLoading] = React.useState(true);
  const [jobsLoading, setJobsLoading] = React.useState(true);
  const [assignedLoading, setAssignedLoading] = React.useState(true);
  const [appraisalLoading, setAppraisalLoading] = React.useState(true);

  const [summaryError, setSummaryError] = React.useState<string | null>(null);
  const [jobsError, setJobsError] = React.useState<string | null>(null);
  const [assignedError, setAssignedError] = React.useState<string | null>(null);
  const [appraisalError, setAppraisalError] = React.useState<string | null>(null);
  const [actionError, setActionError] = React.useState<string | null>(null);
  const [accepting, setAccepting] = React.useState(false);

  const loadSummary = React.useCallback(async () => {
    setSummaryLoading(true);
    setSummaryError(null);
    try {
      const resp = await fetch("/api/web/v4/job-poster/dashboard/summary", {
        cache: "no-store",
        credentials: "include",
      });
      const data = (await resp.json().catch(() => ({}))) as Summary & { error?: { message?: string } | string };
      if (!resp.ok) {
        const message = typeof data.error === "string" ? data.error : data?.error?.message ?? "Failed to load summary";
        setSummaryError(message);
        setSummary(null);
        return;
      }
      setSummary(data);
    } catch {
      setSummaryError("Failed to load summary");
      setSummary(null);
    } finally {
      setSummaryLoading(false);
    }
  }, []);

  const loadJobs = React.useCallback(async () => {
    setJobsLoading(true);
    setJobsError(null);
    try {
      const resp = await fetch("/api/web/v4/job-poster/jobs", {
        cache: "no-store",
        credentials: "include",
      });
      const data = (await resp.json().catch(() => ({}))) as { jobs?: JobItem[]; error?: { message?: string } | string };
      if (!resp.ok) {
        const message = typeof data.error === "string" ? data.error : data?.error?.message ?? "Failed to load jobs";
        setJobsError(message);
        setJobs([]);
        return;
      }
      setJobs(Array.isArray(data.jobs) ? data.jobs : []);
    } catch {
      setJobsError("Failed to load jobs");
      setJobs([]);
    } finally {
      setJobsLoading(false);
    }
  }, []);

  const loadAssigned = React.useCallback(async () => {
    setAssignedLoading(true);
    setAssignedError(null);
    try {
      const resp = await fetch("/api/web/v4/job-poster/assigned-contractor", {
        cache: "no-store",
        credentials: "include",
      });
      const data = (await resp.json().catch(() => ({}))) as { assignment?: Thread | null; error?: { message?: string } | string };
      if (!resp.ok) {
        const message = typeof data.error === "string" ? data.error : data?.error?.message ?? "Failed to load assigned context";
        setAssignedError(message);
        setAssigned(null);
        return;
      }
      setAssigned(data.assignment ?? null);
    } catch {
      setAssignedError("Failed to load assigned context");
      setAssigned(null);
    } finally {
      setAssignedLoading(false);
    }
  }, []);

  const loadAppraisal = React.useCallback(async () => {
    setAppraisalLoading(true);
    setAppraisalError(null);
    try {
      const resp = await fetch("/api/web/v4/score-appraisal/me", {
        cache: "no-store",
        credentials: "include",
      });
      const data = (await resp.json().catch(() => ({}))) as { appraisal?: ScoreAppraisalState; error?: string };
      if (!resp.ok) {
        setAppraisalError(data.error ?? "Failed to load appraisal");
        setScoreAppraisal(null);
        return;
      }
      setScoreAppraisal(data.appraisal ?? null);
    } catch {
      setAppraisalError("Failed to load appraisal");
      setScoreAppraisal(null);
    } finally {
      setAppraisalLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void loadSummary();
    void loadJobs();
    void loadAssigned();
    void loadAppraisal();
  }, [loadSummary, loadJobs, loadAssigned, loadAppraisal]);

  async function handleAcceptAppointment(jobId: string) {
    if (accepting) return;
    setAccepting(true);
    setActionError(null);
    try {
      const resp = await fetch(`/api/web/v4/job-poster/jobs/${encodeURIComponent(jobId)}/accept-appointment`, {
        method: "POST",
        credentials: "include",
      });
      const payload = (await resp.json().catch(() => ({}))) as { error?: { message?: string } | string };
      if (!resp.ok) {
        const message =
          typeof payload.error === "string" ? payload.error : payload.error?.message ?? "Failed to accept appointment";
        setActionError(message);
        return;
      }
      await loadAssigned();
      await loadSummary();
    } catch {
      setActionError("Failed to accept appointment");
    } finally {
      setAccepting(false);
    }
  }

  const statCards: Array<{ title: string; value: string; subtitle: string; loading: boolean; error: string | null }> = [
    {
      title: "Jobs Posted",
      value: summary ? String(summary.jobsPosted) : "Unavailable",
      subtitle: "Total non-draft jobs",
      loading: summaryLoading,
      error: summaryError,
    },
    {
      title: "Funds Secured",
      value: summary ? formatMoney(summary.fundsSecured) : "Unavailable",
      subtitle: "Captured job funds",
      loading: summaryLoading,
      error: summaryError,
    },
    {
      title: "Payment Status",
      value: summary
        ? summary.paymentStatus === "CONNECTED"
          ? "Connected"
          : summary.paymentStatus === "NOT_CONNECTED"
            ? "Not Connected"
            : "Unavailable"
        : "Unavailable",
      subtitle: "Stripe setup",
      loading: summaryLoading,
      error: summaryError,
    },
    {
      title: "Unread Messages",
      value: summary ? String(summary.unreadMessages) : "Unavailable",
      subtitle: "New messages in threads",
      loading: summaryLoading,
      error: summaryError,
    },
    {
      title: "Active Assignments",
      value: summary ? String(summary.activeAssignments) : "Unavailable",
      subtitle: "Assigned or scheduled jobs",
      loading: summaryLoading,
      error: summaryError,
    },
    {
      title: "AI Score Appraisal",
      value: appraisalLoading
        ? "Loading..."
        : scoreAppraisal?.pending
          ? `Pending (${scoreAppraisal.jobsEvaluated}/${scoreAppraisal.minimumRequired})`
          : `${scoreAppraisal?.appraisal?.totalScore ?? "—"} / 10`,
      subtitle: "Internal only",
      loading: false,
      error: appraisalError,
    },
  ];

  const assignedBadge = assigned ? toBadgeStatus(assigned) : null;

  return (
    <div className="p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Job Poster Dashboard</h1>
          <p className="mt-1 text-slate-600">Manage posted jobs, assignments, payment setup, and messages.</p>
        </div>
        <Link
          href="/post-job"
          className="inline-flex rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
        >
          Post a Job
        </Link>
      </div>

      {actionError ? <p className="mt-4 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{actionError}</p> : null}

      <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {statCards.map((card) => (
          <MetricCard key={card.title} title={card.title} value={card.loading ? "Loading..." : card.value} subtitle={card.subtitle} error={card.error} />
        ))}
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-lg font-semibold text-slate-900">Posted Jobs</h2>
            <button
              type="button"
              onClick={() => void loadJobs()}
              className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
            >
              Refresh
            </button>
          </div>

          {jobsError ? <p className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{jobsError}</p> : null}

          {jobsLoading ? (
            <p className="mt-3 text-sm text-slate-500">Loading posted jobs...</p>
          ) : jobs.length === 0 ? (
            <p className="mt-3 text-sm text-slate-500">No posted jobs yet. Post your first job to start routing.</p>
          ) : (
            <div className="mt-4 space-y-3">
              {jobs.slice(0, 12).map((job) => (
                <article key={job.id} className="rounded-xl border border-slate-200 p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h3 className="font-semibold text-slate-900">{job.title}</h3>
                      <p className="mt-1 text-sm text-slate-600">
                        {job.status} · {job.routingStatus}
                      </p>
                      <p className="mt-1 text-sm text-slate-500">
                        Posted {job.createdAt ? new Date(job.createdAt).toLocaleString() : "Date unavailable"}
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
          )}
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-lg font-semibold text-slate-900">Assigned Contractor</h2>
            <button
              type="button"
              onClick={() => void loadAssigned()}
              className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
            >
              Refresh
            </button>
          </div>

          {assignedError ? <p className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{assignedError}</p> : null}

          {assignedLoading ? (
            <p className="mt-3 text-sm text-slate-500">Loading assigned contractor context...</p>
          ) : !assigned || !assignedBadge ? (
            <p className="mt-3 text-sm text-slate-500">No assigned contractor context is active right now.</p>
          ) : (
            <div className="mt-3 space-y-2 text-sm text-slate-700">
              <p className="font-semibold text-slate-900">{assigned.jobTitle || `Job ${assigned.jobId.slice(0, 8)}`}</p>
              <p>
                <span className="font-medium">Contractor:</span> {assigned.contractorName || "Assigned Contractor"}
              </p>
              <p>
                <span className="font-medium">Business:</span> {assigned.contractorBusinessName || "Contractor Business"}
              </p>
              {assigned.appointmentAt ? (
                <p>
                  <span className="font-medium">Appointment:</span> {new Date(assigned.appointmentAt).toLocaleString()}
                </p>
              ) : null}
              <div className="pt-1">
                <span className="inline-flex rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-800">
                  {assignedBadge}
                </span>
              </div>

              {assigned.appointmentAt && !assigned.appointmentAcceptedAt ? (
                <button
                  type="button"
                  onClick={() => void handleAcceptAppointment(assigned.jobId)}
                  disabled={accepting}
                  className="mt-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                >
                  {accepting ? "Accepting..." : "Accept Appointment"}
                </button>
              ) : (
                <Link
                  href={`/dashboard/job-poster/messages?jobId=${encodeURIComponent(assigned.jobId)}`}
                  className="mt-2 inline-block rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Open Messages
                </Link>
              )}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function MetricCard(props: { title: string; value: string; subtitle: string; error?: string | null }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-sm font-medium text-slate-600">{props.title}</p>
      <p className="mt-2 text-2xl font-semibold text-slate-900">{props.value}</p>
      <p className="mt-1 text-xs text-slate-500">{props.subtitle}</p>
      {props.error ? <p className="mt-2 text-xs text-rose-700">{props.error}</p> : null}
    </div>
  );
}
