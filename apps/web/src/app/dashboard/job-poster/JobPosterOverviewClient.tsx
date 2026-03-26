"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@clerk/nextjs";
import { apiFetch } from "@/lib/routerApi";
import { DeadlineCountdown } from "@/components/dashboard/LiveCountdown";
import { formatJobStatus } from "@/components/dashboard/formatDashboardStatus";
import { loadSection, readJsonResponse } from "@/components/dashboard/loadSection";
import { useJobPosterReadiness } from "@/hooks/useJobPosterReadiness";
import StatusBadge from "@/components/StatusBadge";
import { type LifecycleState } from "@/components/dashboard/LifecycleDebugPanel";
import { ReviewModal } from "@/components/dashboard/ReviewModal";

const STORAGE_PREFIX = "job-poster-dismissed:";

function useDismissedCard(storageKey: string): [boolean, () => void] {
  const [dismissed, setDismissed] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted || typeof window === "undefined") return;
    try {
      const raw = localStorage.getItem(STORAGE_PREFIX + storageKey);
      setDismissed(raw === "1");
    } catch {
      setDismissed(false);
    }
  }, [mounted, storageKey]);

  const dismiss = useCallback(() => {
    setDismissed(true);
    try {
      localStorage.setItem(STORAGE_PREFIX + storageKey, "1");
    } catch {
      /* ignore */
    }
  }, [storageKey]);

  return [dismissed, dismiss];
}

function ClosableCard({
  storageKey,
  children,
  className,
}: {
  storageKey: string;
  children: React.ReactNode;
  className?: string;
}) {
  const [dismissed, dismiss] = useDismissedCard(storageKey);
  if (dismissed) return null;
  return (
    <section className={`relative ${className ?? ""}`}>
      <button
        type="button"
        onClick={dismiss}
        aria-label="Close"
        className="absolute right-3 top-3 rounded p-1.5 text-slate-500 hover:bg-black/5 hover:text-slate-700"
      >
        <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
      {children}
    </section>
  );
}

type AwaitingPosterReport = {
  jobId: string;
  title: string | null;
  completionWindowExpiresAt: string | null;
  contractorName: string | null;
};

type FullyCompletedJob = {
  jobId: string;
  title: string | null;
  completedAt: string | null;
  hasReview: boolean;
};

type Summary = {
  jobsPosted: number;
  fundsSecured: number;
  paymentStatus: "CONNECTED" | "NOT_CONNECTED";
  unreadMessages: number;
  activeAssignments: number;
  awaitingPosterReport?: AwaitingPosterReport[];
  fullyCompletedJobs?: FullyCompletedJob[];
};

type JobItem = {
  id: string;
  title?: string;
  status?: string;
  routingStatus?: string;
  amountCents?: number;
  createdAt?: string;
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

type PendingAppraisal = {
  adjustmentId: string;
  jobId: string;
  jobTitle: string;
  originalPriceCents: number;
  requestedPriceCents: number;
  additionalPriceCents: number;
  location: string | null;
  secureToken: string | null;
  expiresAt: string | null;
  expired: boolean;
};

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

function GateCard({ label, done, href, compact }: { label: string; done: boolean; href: string; compact: boolean }) {
  if (compact) {
    return (
      <Link href={href} className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-700 hover:text-emerald-700">
        <span className="text-emerald-600">&#10003;</span>
        {label}
      </Link>
    );
  }
  return (
    <Link
      href={href}
      className={
        "flex items-center gap-3 rounded-xl border p-4 transition hover:shadow-md " +
        (done ? "border-emerald-200 bg-emerald-50" : "border-amber-200 bg-amber-50")
      }
    >
      <span
        className={
          "flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold " +
          (done ? "bg-emerald-600 text-white" : "bg-amber-400 text-white")
        }
      >
        {done ? "\u2713" : "!"}
      </span>
      <div className="min-w-0 flex-1">
        <div className="font-semibold text-slate-900">{label}</div>
        <div className={"text-xs " + (done ? "text-emerald-700" : "text-amber-700")}>
          {done ? "Complete" : "Action required"}
        </div>
      </div>
    </Link>
  );
}

function SummaryCard({ title, value, subtitle, href }: { title: string; value: string; subtitle: string; href?: string }) {
  const content = (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:shadow-md">
      <div className="text-sm font-medium uppercase tracking-wide text-slate-500">{title}</div>
      <div className="mt-1 text-3xl font-bold text-slate-900">{value}</div>
      <div className="mt-1 text-xs text-slate-500">{subtitle}</div>
    </div>
  );
  if (href) return <Link href={href}>{content}</Link>;
  return content;
}

function SummaryCardSkeleton({ title }: { title: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="text-sm font-medium uppercase tracking-wide text-slate-500">{title}</div>
      <div className="mt-3 h-8 w-20 animate-pulse rounded bg-slate-200" />
      <div className="mt-2 h-4 w-32 animate-pulse rounded bg-slate-100" />
    </div>
  );
}

function DegradedStateBanner() {
  return (
    <div className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800">
      Some data failed to load. Please refresh.
    </div>
  );
}

function derivePosterLifecycleState(summary: Summary | null): LifecycleState | null {
  if (!summary) return null;
  const awaiting = summary.awaitingPosterReport ?? [];
  const completed = summary.fullyCompletedJobs ?? [];
  if (awaiting.length > 0) return "AWAITING_POSTER_COMPLETION";
  if (completed.length > 0) return "COMPLETED";
  return null;
}

export default function JobPosterOverviewClient() {
  const { getToken } = useAuth();
  const { readiness, loading: readinessLoading, error: readinessError } = useJobPosterReadiness();

  const [dataLoading, setDataLoading] = useState(true);
  const [error, setError] = useState("");
  const [summary, setSummary] = useState<Summary | null>(null);
  const [jobs, setJobs] = useState<JobItem[]>([]);
  const [assigned, setAssigned] = useState<Thread | null>(null);
  const [scoreAppraisal, setScoreAppraisal] = useState<ScoreAppraisalState>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [accepting, setAccepting] = useState(false);
  const [pendingAppraisals, setPendingAppraisals] = useState<PendingAppraisal[]>([]);
  const [reviewJobId, setReviewJobId] = useState<string | null>(null);
  const [reviewJobTitle, setReviewJobTitle] = useState<string | null>(null);
  const [reviewSubmitting, setReviewSubmitting] = useState(false);
  const [sectionFailures, setSectionFailures] = useState({
    summary: false,
    jobs: false,
    assigned: false,
    appraisal: false,
    pendingAppraisals: false,
  });

  const realLifecycleState = derivePosterLifecycleState(summary);

  useEffect(() => {
    if (readinessLoading) return;
    let alive = true;
    (async () => {
      try {
        const [summaryResult, jobsResult, assignedResult, appraisalResult, appraisalsResult] = await Promise.all([
          loadSection(async () => {
            const resp = await apiFetch("/api/web/v4/job-poster/dashboard/summary", getToken);
            if (!resp.ok) throw new Error(`Summary request failed with ${resp.status}`);
            return await readJsonResponse<Summary>(resp);
          }, { section: "job-poster-summary", route: "/api/web/v4/job-poster/dashboard/summary" }),
          loadSection(async () => {
            const resp = await apiFetch("/api/web/v4/job-poster/jobs", getToken);
            if (!resp.ok) throw new Error(`Jobs request failed with ${resp.status}`);
            return await readJsonResponse<{ jobs?: JobItem[] }>(resp);
          }, { section: "job-poster-jobs", route: "/api/web/v4/job-poster/jobs" }),
          loadSection(async () => {
            const resp = await apiFetch("/api/web/v4/job-poster/assigned-contractor", getToken);
            if (!resp.ok) throw new Error(`Assigned contractor request failed with ${resp.status}`);
            return await readJsonResponse<{ assignment?: Thread | null }>(resp);
          }, { section: "job-poster-assigned", route: "/api/web/v4/job-poster/assigned-contractor" }),
          loadSection(async () => {
            const resp = await apiFetch("/api/web/v4/score-appraisal/me", getToken);
            if (!resp.ok) throw new Error(`Score appraisal request failed with ${resp.status}`);
            return await readJsonResponse<{ appraisal?: ScoreAppraisalState }>(resp);
          }, { section: "job-poster-appraisal", route: "/api/web/v4/score-appraisal/me" }),
          loadSection(async () => {
            const resp = await apiFetch("/api/web/v4/job-poster/appraisals/pending", getToken);
            if (!resp.ok) throw new Error(`Pending appraisals request failed with ${resp.status}`);
            return await readJsonResponse<{ pendingAppraisals?: PendingAppraisal[] }>(resp);
          }, { section: "job-poster-pending-appraisals", route: "/api/web/v4/job-poster/appraisals/pending" }),
        ]);
        if (!alive) return;

        const summaryJson = summaryResult.data;
        const jobsJson = jobsResult.data;
        const assignedJson = assignedResult.data;
        const appraisalJson = appraisalResult.data;
        const appraisalsJson = appraisalsResult.data;

        setSectionFailures({
          summary: summaryResult.failed,
          jobs: jobsResult.failed,
          assigned: assignedResult.failed,
          appraisal: appraisalResult.failed,
          pendingAppraisals: appraisalsResult.failed,
        });

        setSummary(summaryJson ?? null);
        setJobs(Array.isArray(jobsJson?.jobs) ? jobsJson.jobs : []);
        setAssigned(assignedJson?.assignment ?? null);
        setScoreAppraisal(appraisalResult.failed ? null : appraisalJson?.appraisal ?? null);
        setPendingAppraisals(
          appraisalsResult.failed ? [] : Array.isArray(appraisalsJson?.pendingAppraisals) ? appraisalsJson.pendingAppraisals : [],
        );
      } catch {
        if (alive) setError("Failed to load dashboard data");
      } finally {
        if (alive) setDataLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [readinessLoading, getToken]);

  async function handleAcceptAppointment(jobId: string) {
    if (accepting) return;
    setAccepting(true);
    setActionError(null);
    try {
      const resp = await apiFetch(
        `/api/web/v4/job-poster/jobs/${encodeURIComponent(jobId)}/accept-appointment`,
        getToken,
        { method: "POST" },
      );
      if (!resp.ok) {
        const payload = await readJsonResponse<{ error?: { message?: string } | string }>(resp);
        const message = typeof payload.error === "string" ? payload.error : payload.error?.message ?? "Failed to accept appointment";
        setActionError(message);
        return;
      }
      const [summaryResult, assignedResult] = await Promise.all([
        loadSection(async () => {
          const summaryResp = await apiFetch("/api/web/v4/job-poster/dashboard/summary", getToken);
          if (!summaryResp.ok) throw new Error(`Summary refresh failed with ${summaryResp.status}`);
          return await readJsonResponse<Summary>(summaryResp);
        }, { section: "job-poster-summary-refresh", route: "/api/web/v4/job-poster/dashboard/summary" }),
        loadSection(async () => {
          const assignedResp = await apiFetch("/api/web/v4/job-poster/assigned-contractor", getToken);
          if (!assignedResp.ok) throw new Error(`Assigned contractor refresh failed with ${assignedResp.status}`);
          return await readJsonResponse<{ assignment?: Thread | null }>(assignedResp);
        }, { section: "job-poster-assigned-refresh", route: "/api/web/v4/job-poster/assigned-contractor" }),
      ]);
      if (summaryResult.data) setSummary(summaryResult.data);
      setAssigned(assignedResult.data?.assignment ?? null);
    } catch {
      setActionError("Failed to accept appointment");
    } finally {
      setAccepting(false);
    }
  }

  async function handleSubmitReview(rating: number, comment: string): Promise<boolean> {
    if (!reviewJobId || reviewSubmitting) return false;
    setReviewSubmitting(true);
    setActionError(null);
    try {
      const resp = await apiFetch("/api/web/v4/reviews", getToken, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId: reviewJobId, rating, comment }),
      });
      if (!resp.ok) {
        const json = await readJsonResponse<{ error?: string }>(resp);
        setActionError(typeof json?.error === "string" ? json.error : "Failed to submit review");
        return false;
      }
      const summaryResult = await loadSection(async () => {
        const summaryResp = await apiFetch("/api/web/v4/job-poster/dashboard/summary", getToken);
        if (!summaryResp.ok) throw new Error(`Summary refresh failed with ${summaryResp.status}`);
        return await readJsonResponse<Summary>(summaryResp);
      }, { section: "job-poster-summary-refresh", route: "/api/web/v4/job-poster/dashboard/summary" });
      if (summaryResult.data) {
        setSummary(summaryResult.data);
      }
      return true;
    } catch {
      setActionError("Failed to submit review");
      return false;
    } finally {
      setReviewSubmitting(false);
    }
  }

  const awaitingReport = summary?.awaitingPosterReport ?? [];
  const completedJobs = summary?.fullyCompletedJobs ?? [];
  const beyondAcceptance = realLifecycleState && ["CONTRACTOR_COMPLETED", "AWAITING_POSTER_COMPLETION", "COMPLETED", "PAID", "REVIEW_STAGE"].includes(realLifecycleState);
  const hasCompletionCards = beyondAcceptance || awaitingReport.length > 0 || completedJobs.length > 0;
  const showCompletionReminder = awaitingReport.length > 0;
  const showCompletedCard = completedJobs.length > 0;
  const criticalSectionFailed = sectionFailures.summary || sectionFailures.jobs || sectionFailures.assigned;

  const loading = readinessLoading || dataLoading;

  if (loading) {
    return (
      <div className="space-y-6 p-6">
        <div className="h-6 w-48 animate-pulse rounded bg-slate-200" />
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-20 animate-pulse rounded-xl border border-slate-200 bg-slate-50" />
          ))}
        </div>
      </div>
    );
  }

  if (readinessError || error) {
    return (
      <div className="p-6">
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {readinessError || error}
        </div>
      </div>
    );
  }

  const termsOk = readiness?.terms ?? false;
  const profileOk = readiness?.profile ?? false;
  const paymentOk = readiness?.payment ?? false;
  const allGatesComplete = readiness?.complete ?? false;

  const assignedBadge = assigned ? toBadgeStatus(assigned) : null;

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Job Poster Dashboard</h1>
          <p className="mt-1 text-sm text-slate-600">Manage posted jobs, assignments, payment setup, and messages.</p>
        </div>
        <Link
          href="/dashboard/job-poster/post-job"
          className="inline-flex rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700"
        >
          Post a Job
        </Link>
      </div>

      {criticalSectionFailed ? <DegradedStateBanner /> : null}

      {allGatesComplete ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-5 py-4">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
            <GateCard label="Terms" done href="/dashboard/job-poster/terms" compact />
            <GateCard label="Profile" done href="/dashboard/job-poster/profile" compact />
            <GateCard label="Payment" done href="/dashboard/job-poster/payment" compact />
          </div>
          <div className="mt-2 text-sm font-semibold text-emerald-700">
            Account setup complete &mdash; ready to post jobs
          </div>
        </div>
      ) : (
        <section>
          <h2 className="mb-3 text-lg font-semibold text-slate-900">Complete Your Setup</h2>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <GateCard label="Terms" done={termsOk} href="/dashboard/job-poster/terms" compact={false} />
            <GateCard label="Profile Setup" done={profileOk} href="/dashboard/job-poster/profile" compact={false} />
            <GateCard label="Payment Setup" done={paymentOk} href="/dashboard/job-poster/payment" compact={false} />
          </div>
        </section>
      )}

      {actionError ? <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{actionError}</p> : null}

      {assignedBadge === "APPOINTMENT_BOOKED" && (
        <ClosableCard storageKey="appointment-booked" className="rounded-2xl border border-emerald-200 bg-emerald-50 p-6 shadow-sm">
          <h2 className="pr-10 text-xl font-bold text-emerald-800">
            Your Job has been booked for an appointment.
          </h2>
          <p className="mt-2 text-sm text-emerald-700">
            {assigned?.appointmentAt
              ? `Scheduled for ${new Date(assigned.appointmentAt).toLocaleString()}.`
              : "Check Messenger for details."}
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <Link
              href={`/dashboard/job-poster/messages${assigned?.jobId ? `?jobId=${encodeURIComponent(assigned.jobId)}` : ""}`}
              className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
            >
              Open Messenger
            </Link>
            <Link
              href="/dashboard/job-poster/jobs"
              className="rounded-lg border border-emerald-300 px-4 py-2 text-sm font-semibold text-emerald-700 hover:bg-emerald-100"
            >
              View Job
            </Link>
          </div>
        </ClosableCard>
      )}

      {showCompletionReminder && (
        <ClosableCard storageKey="completion-reminder" className="rounded-2xl border border-amber-200 bg-amber-50 p-6 shadow-sm">
          <h2 className="pr-10 text-xl font-bold text-amber-800">Job Completion Required</h2>
          <p className="mt-1 text-sm text-amber-700">
            Your contractor has submitted their completion report. Please submit your completion report within 24 hours.
          </p>
          <div className="mt-3 space-y-2">
            {awaitingReport.length > 0 ? awaitingReport.map((j) => (
              <div key={j.jobId} className="rounded-lg border border-amber-100 bg-white px-4 py-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold text-slate-800">{j.title ?? "Untitled Job"}</div>
                    {j.contractorName && (
                      <div className="mt-0.5 text-xs text-slate-500">Contractor: {j.contractorName}</div>
                    )}
                    <div className="mt-1 text-xs text-slate-600">
                      Completion Reports: <span className="font-semibold text-amber-700">1 / 2</span> &middot; Your report is needed
                    </div>
                    {j.completionWindowExpiresAt && (
                      <div className="mt-1 text-xs font-medium text-amber-700">
                        Auto-completes in: <DeadlineCountdown targetIso={j.completionWindowExpiresAt} />
                      </div>
                    )}
                  </div>
                  <span className="inline-flex shrink-0 rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-700">
                    ACTION NEEDED
                  </span>
                </div>
              </div>
            )) : (
              <div className="rounded-lg border border-amber-100 bg-white px-4 py-3">
                <div className="text-sm font-semibold text-slate-800">[Override] Sample Job</div>
                <div className="mt-1 text-xs text-slate-600">Completion Reports: <span className="font-semibold text-amber-700">1 / 2</span> &middot; Your report is needed</div>
              </div>
            )}
          </div>
          <div className="mt-4 flex flex-wrap gap-3">
            <Link
              href={`/dashboard/job-poster/messages${awaitingReport[0]?.jobId ? `?jobId=${encodeURIComponent(awaitingReport[0].jobId)}` : ""}`}
              className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-700"
            >
              Complete Job Report
            </Link>
            <Link
              href={`/dashboard/job-poster/messages${awaitingReport[0]?.jobId ? `?jobId=${encodeURIComponent(awaitingReport[0].jobId)}` : ""}`}
              className="rounded-lg border border-amber-300 px-4 py-2 text-sm font-semibold text-amber-700 hover:bg-amber-100"
            >
              Open Messenger
            </Link>
          </div>
        </ClosableCard>
      )}

      {showCompletedCard && (
        <ClosableCard storageKey="job-completed" className="rounded-2xl border border-emerald-200 bg-emerald-50 p-6 shadow-sm">
          <h2 className="pr-10 text-xl font-bold text-emerald-800">Job Completed Successfully</h2>
          <p className="mt-1 text-sm text-emerald-700">Thank you for using 8Fold!</p>
          <div className="mt-3 space-y-2">
            {completedJobs.length > 0 ? completedJobs.map((j) => (
              <div key={j.jobId} className="flex items-center justify-between rounded-lg border border-emerald-100 bg-white px-4 py-3">
                <div>
                  <div className="text-sm font-medium text-slate-800">{j.title ?? "Untitled Job"}</div>
                  <div className="text-xs text-slate-500">
                    Completed {j.completedAt ? new Date(j.completedAt).toLocaleDateString() : ""}
                    {j.hasReview ? " \u00b7 Reviewed" : ""}
                  </div>
                </div>
                {!j.hasReview ? (
                  <button
                    type="button"
                    onClick={() => { setReviewJobId(j.jobId); setReviewJobTitle(j.title ?? null); }}
                    className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700"
                  >
                    Leave a Review
                  </button>
                ) : (
                  <span className="inline-flex rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700">
                    REVIEWED
                  </span>
                )}
              </div>
            )) : null}
          </div>
        </ClosableCard>
      )}

      {pendingAppraisals.length > 0 && (
        <section>
          <div className="mb-3 flex items-center gap-2">
            <h2 className="text-lg font-semibold text-slate-900">
              ⚠ Price Adjustment Pending
              {pendingAppraisals.length > 1 && (
                <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-sm font-bold text-amber-700">
                  {pendingAppraisals.length}
                </span>
              )}
            </h2>
          </div>
          <div className="space-y-3">
            {pendingAppraisals.map((ap) => {
              const additionalDollars = (ap.additionalPriceCents / 100).toFixed(2);
              const originalDollars = (ap.originalPriceCents / 100).toFixed(2);
              const requestedDollars = (ap.requestedPriceCents / 100).toFixed(2);
              const appraisalHref = ap.secureToken
                ? `/job-adjustment/${encodeURIComponent(ap.adjustmentId)}?token=${encodeURIComponent(ap.secureToken)}`
                : `/job-adjustment/${encodeURIComponent(ap.adjustmentId)}`;

              return (
                <div
                  key={ap.adjustmentId}
                  className="rounded-2xl border border-amber-300 bg-amber-50 p-5 shadow-sm"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <svg className="h-5 w-5 shrink-0 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                      </svg>
                      <h3 className="font-bold text-amber-800">Price Adjustment Request</h3>
                    </div>
                    {ap.expired ? (
                      <span className="inline-flex shrink-0 rounded-full bg-slate-200 px-2.5 py-0.5 text-xs font-semibold text-slate-600">
                        EXPIRED
                      </span>
                    ) : (
                      <span className="inline-flex shrink-0 rounded-full bg-amber-200 px-2.5 py-0.5 text-xs font-semibold text-amber-800">
                        ACTION NEEDED
                      </span>
                    )}
                  </div>

                  <p className="mt-2 text-sm text-amber-700">
                    A contractor has requested a revised price for your job.
                  </p>

                  <div className="mt-3 rounded-xl border border-amber-200 bg-white px-4 py-3 text-sm text-slate-700 space-y-1">
                    <div className="font-semibold text-slate-900">{ap.jobTitle}</div>
                    {ap.location && (
                      <div className="text-xs text-slate-500">{ap.location}</div>
                    )}
                    <div className="mt-2 grid grid-cols-1 gap-y-1 sm:grid-cols-3 text-xs">
                      <div>
                        <span className="text-slate-500">Original Price</span>
                        <div className="font-semibold text-slate-800">${originalDollars}</div>
                      </div>
                      <div>
                        <span className="text-slate-500">Requested Price</span>
                        <div className="font-semibold text-slate-800">${requestedDollars}</div>
                      </div>
                      <div>
                        <span className="text-slate-500">Additional Payment</span>
                        <div className="font-bold text-amber-700">+${additionalDollars}</div>
                      </div>
                    </div>
                  </div>

                  {ap.expired ? (
                    <p className="mt-3 text-xs text-slate-500">
                      This appraisal request has expired. Please contact support if you still wish to review it.
                    </p>
                  ) : (
                    <div className="mt-4 flex flex-wrap gap-3">
                      <Link
                        href={appraisalHref}
                        className="rounded-lg bg-amber-600 px-5 py-2 text-sm font-semibold text-white hover:bg-amber-700"
                      >
                        Review Appraisal
                      </Link>
                      <Link
                        href={`/dashboard/job-poster/messages?jobId=${encodeURIComponent(ap.jobId)}`}
                        className="rounded-lg border border-amber-300 px-4 py-2 text-sm font-semibold text-amber-700 hover:bg-amber-100"
                      >
                        Open Messenger
                      </Link>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {sectionFailures.summary ? (
          <>
            <SummaryCardSkeleton title="Jobs Posted" />
            <SummaryCardSkeleton title="Funds Secured" />
            <SummaryCardSkeleton title="Payment Status" />
            <SummaryCardSkeleton title="Unread Messages" />
            <SummaryCardSkeleton title="Active Assignments" />
            <SummaryCardSkeleton title="AI Score Appraisal" />
          </>
        ) : (
          <>
            <SummaryCard title="Jobs Posted" value={summary ? String(summary.jobsPosted) : "—"} subtitle="Total non-draft jobs" href="/dashboard/job-poster/jobs" />
            <SummaryCard title="Funds Secured" value={summary ? formatMoney(summary.fundsSecured) : "—"} subtitle="Captured job funds" />
            <SummaryCard
              title="Payment Status"
              value={summary ? (summary.paymentStatus === "CONNECTED" ? "Connected" : "Not Connected") : "—"}
              subtitle="Stripe setup"
              href="/dashboard/job-poster/payment"
            />
            <SummaryCard title="Unread Messages" value={summary ? String(summary.unreadMessages) : "—"} subtitle="New messages in threads" href="/dashboard/job-poster/messages" />
            <SummaryCard title="Active Assignments" value={summary ? String(summary.activeAssignments) : "—"} subtitle="Assigned or scheduled jobs" />
            <SummaryCard
              title="AI Score Appraisal"
              value={
                sectionFailures.appraisal
                  ? "—"
                  : scoreAppraisal?.pending
                    ? `Pending (${scoreAppraisal.jobsEvaluated}/${scoreAppraisal.minimumRequired})`
                    : `${scoreAppraisal?.appraisal?.totalScore ?? "—"} / 10`
              }
              subtitle={sectionFailures.appraisal ? "Temporarily unavailable" : "Internal only"}
            />
          </>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">Posted Jobs</h2>
          {sectionFailures.jobs ? (
            <p className="mt-3 text-sm text-slate-500">Posted jobs are temporarily unavailable.</p>
          ) : jobs.length === 0 ? (
            <p className="mt-3 text-sm text-slate-500">No posted jobs yet. Post your first job to start routing.</p>
          ) : (
            <div className="mt-4 space-y-3">
              {jobs.slice(0, 6).map((job) => (
                <article key={job.id} className="rounded-xl border border-slate-200 p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h3 className="font-semibold text-slate-900">{job.title ?? "Untitled"}</h3>
                      <div className="mt-1 flex flex-wrap gap-1.5">
                        {job.status ? <StatusBadge status={formatJobStatus(job.status)} /> : null}
                        {job.routingStatus ? <StatusBadge status={formatJobStatus(job.routingStatus)} /> : null}
                      </div>
                      <p className="mt-1 text-sm text-slate-500">
                        Posted {job.createdAt ? new Date(job.createdAt).toLocaleDateString() : "—"}
                      </p>
                    </div>
                    <span className="text-sm font-semibold text-emerald-700">{formatMoney(job.amountCents)}</span>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Link href={`/dashboard/job-poster/jobs/${job.id}`} className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50">
                      View Job
                    </Link>
                    <Link href={`/dashboard/job-poster/messages?jobId=${encodeURIComponent(job.id)}`} className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50">
                      Messenger
                    </Link>
                  </div>
                </article>
              ))}
              {jobs.length > 6 ? (
                <Link href="/dashboard/job-poster/jobs" className="block text-center text-sm font-medium text-emerald-700 hover:underline">
                  View all {jobs.length} jobs
                </Link>
              ) : null}
            </div>
          )}
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">Assigned Contractor</h2>
          {sectionFailures.assigned ? (
            <p className="mt-3 text-sm text-slate-500">Assigned contractor details are temporarily unavailable.</p>
          ) : !assigned || !assignedBadge ? (
            <p className="mt-3 text-sm text-slate-500">No assigned contractor context is active right now.</p>
          ) : (
            <div className="mt-3 space-y-2 text-sm text-slate-700">
              <p className="font-semibold text-slate-900">{assigned.jobTitle || `Job ${assigned.jobId.slice(0, 8)}`}</p>
              <p><span className="font-medium">Contractor:</span> {assigned.contractorName || "Assigned Contractor"}</p>
              <p><span className="font-medium">Business:</span> {assigned.contractorBusinessName || "Contractor Business"}</p>
              {assigned.appointmentAt ? (
                <p><span className="font-medium">Appointment:</span> {new Date(assigned.appointmentAt).toLocaleString()}</p>
              ) : null}
              <div className="pt-1">
                <StatusBadge status={formatJobStatus(assignedBadge)} />
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

      <div className="grid grid-cols-1 gap-4">
        <Link href="/dashboard/job-poster/support/inbox" className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition hover:shadow-md">
          <div>
            <div className="text-sm font-medium uppercase tracking-wide text-slate-500">Support</div>
            <div className="mt-1 text-sm text-slate-600">Submit or view support tickets</div>
          </div>
          <span className="text-slate-400">&rarr;</span>
        </Link>
      </div>

      {reviewJobId && (
        <ReviewModal
          jobId={reviewJobId}
          jobTitle={reviewJobTitle ?? undefined}
          onClose={() => { setReviewJobId(null); setReviewJobTitle(null); }}
          onSubmit={(rating, comment) => handleSubmitReview(rating, comment)}
          submitting={reviewSubmitting}
        />
      )}
    </div>
  );
}
