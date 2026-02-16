"use client";

import React from "react";
import { ErrorDisplay } from "../../../../../components/ErrorDisplay";
import { LoadingSpinner } from "../../../../../components/LoadingSpinner";

type JobRow = {
  id: string;
  title: string;
  status: string;
  jobPosterWizardStep?: string | null;
  createdAt: string;
  publishedAt?: string;
  contactedAt?: string | null;
  guaranteeEligibleAt?: string | null;
  escrowLockedAt: string | null;
  paymentCapturedAt?: string | null;
  laborTotalCents: number;
  materialsTotalCents: number;
  transactionFeeCents: number;
  payment: null | {
    status: string;
    amountCents: number;
    stripePaymentIntentStatus: string;
    refundIssuedAt?: string | null;
  };
};

function money(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

function formatCountdown(ms: number) {
  if (ms <= 0) return "0h";
  const totalMins = Math.ceil(ms / 60000);
  const days = Math.floor(totalMins / (60 * 24));
  const hours = Math.floor((totalMins - days * 60 * 24) / 60);
  const mins = totalMins % 60;
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}

export default function JobPosterJobsPage() {
  const [jobs, setJobs] = React.useState<JobRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState("");
  const [confirmDelete, setConfirmDelete] = React.useState<null | { id: string; title: string }>(null);
  const [deleting, setDeleting] = React.useState(false);

  React.useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const resp = await fetch("/api/app/job-poster/jobs", { cache: "no-store", credentials: "include" });
        const json = await resp.json().catch(() => null);
        if (!alive) return;
        if (!resp.ok) throw new Error(json?.error ?? "Failed to load jobs");
        setJobs((json?.jobs ?? []) as JobRow[]);
      } catch (e) {
        if (!alive) return;
        setError(e instanceof Error ? e.message : "Failed");
      } finally {
        if (!alive) return;
        setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const drafts = jobs.filter((j) => j.status === "DRAFT");
  const nonDrafts = jobs.filter((j) => j.status !== "DRAFT");

  async function deleteDraft(id: string) {
    setDeleting(true);
    setError("");
    try {
      const resp = await fetch(`/api/app/job-poster/drafts/${encodeURIComponent(id)}`, { method: "DELETE" });
      const json = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error(json?.error ?? "Failed to delete draft");
      setConfirmDelete(null);
      const refreshed = await fetch("/api/app/job-poster/jobs", { cache: "no-store", credentials: "include" });
      const refreshedJson = await refreshed.json().catch(() => null);
      if (!refreshed.ok) throw new Error(refreshedJson?.error ?? "Failed to load jobs");
      setJobs((refreshedJson?.jobs ?? []) as JobRow[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <>
      <h2 className="text-lg font-bold text-gray-900">My Jobs</h2>
      <p className="text-gray-600 mt-2">Payment status is shown as funded/not funded. Stripe IDs are never shown.</p>
      <div className="mt-3 text-sm text-gray-700">
        Refunds and reimbursements are processed through Stripe and returned to the original payment method according to Stripe’s processing timelines.
      </div>

      <ErrorDisplay message={error} />

      {confirmDelete ? (
        <div className="fixed inset-0 z-[1000] bg-black/40 flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl border border-gray-200 p-6">
            <div className="text-lg font-bold text-gray-900">Delete draft?</div>
            <div className="text-sm text-gray-600 mt-2">
              This will permanently delete <span className="font-semibold">{confirmDelete.title}</span>. This cannot be undone.
            </div>
            <div className="mt-5 flex gap-3 justify-end">
              <button
                disabled={deleting}
                onClick={() => setConfirmDelete(null)}
                className="border border-gray-300 text-gray-700 hover:bg-gray-50 font-semibold px-4 py-2 rounded-lg"
              >
                Cancel
              </button>
              <button
                disabled={deleting}
                onClick={() => void deleteDraft(confirmDelete.id)}
                className="bg-red-600 hover:bg-red-700 text-white font-semibold px-4 py-2 rounded-lg disabled:bg-gray-200 disabled:text-gray-500"
              >
                {deleting ? "Deleting…" : "Delete draft"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {loading ? (
        <div className="mt-6">
          <LoadingSpinner label="Loading jobs…" />
        </div>
      ) : null}

      {drafts.length ? (
        <div className="mt-6 border border-gray-200 rounded-2xl p-6 shadow-sm">
          <h3 className="text-lg font-bold text-gray-900">Drafts</h3>
          <p className="text-gray-600 mt-1">Saved job postings that haven’t reached the Confirmed step.</p>
          <div className="mt-5 space-y-3">
            {drafts.map((j) => (
              <div key={j.id} className="border border-gray-200 rounded-xl p-4">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div>
                    <div className="font-bold text-gray-900">{j.title}</div>
                    <div className="text-sm text-gray-600 mt-1">
                      Status: <span className="font-mono">DRAFT</span>
                      {j.jobPosterWizardStep ? (
                        <span className="ml-2 text-xs font-semibold px-2 py-1 rounded-full border border-gray-200 bg-gray-50 text-gray-700">
                          {String(j.jobPosterWizardStep).toUpperCase()}
                        </span>
                      ) : null}
                    </div>
                  </div>
                  <div className="flex gap-2 flex-wrap">
                    <a
                      href={`/app/job-poster/post-a-job?resumeJobId=${encodeURIComponent(j.id)}`}
                      className="bg-8fold-green hover:bg-8fold-green-dark text-white font-semibold px-4 py-2 rounded-lg"
                    >
                      Resume
                    </a>
                    <button
                      onClick={() => setConfirmDelete({ id: j.id, title: j.title })}
                      className="border border-gray-300 text-gray-700 hover:bg-gray-50 font-semibold px-4 py-2 rounded-lg"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <div className="mt-6 space-y-3">
        {nonDrafts.map((j) => {
          const funded = Boolean(j.escrowLockedAt);
          const total = j.laborTotalCents + j.materialsTotalCents;
          const now = Date.now();
          const guaranteeEligibleAtMs = j.guaranteeEligibleAt
            ? new Date(j.guaranteeEligibleAt).getTime()
            : j.publishedAt
              ? new Date(j.publishedAt).getTime() + 7 * 24 * 60 * 60 * 1000
              : null;
          const contacted = Boolean(j.contactedAt);
          const refundIssued = Boolean(j.payment?.refundIssuedAt);
          const eligibleForRefund =
            Boolean(j.paymentCapturedAt) &&
            !contacted &&
            !refundIssued &&
            guaranteeEligibleAtMs != null &&
            now >= guaranteeEligibleAtMs;
          const countdown =
            guaranteeEligibleAtMs != null && now < guaranteeEligibleAtMs
              ? formatCountdown(guaranteeEligibleAtMs - now)
              : null;

          return (
            <div key={j.id} className="border border-gray-200 rounded-xl p-4">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div>
                  <div className="font-bold text-gray-900">{j.title}</div>
                  <div className="text-sm text-gray-600 mt-1">
                    Status: <span className="font-mono">{j.status}</span> · Payment:{" "}
                    <span className={funded ? "text-8fold-green font-semibold" : "text-gray-700 font-semibold"}>
                      {funded ? "Funded" : "Not funded"}
                    </span>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2 items-center">
                    <span className="text-xs font-semibold px-2 py-1 rounded-full border border-gray-200 bg-gray-50 text-gray-700">
                      7-Day Contact Guarantee
                    </span>
                    {contacted ? (
                      <span className="text-xs font-semibold px-2 py-1 rounded-full border border-amber-200 bg-amber-50 text-amber-800">
                        Voided (contacted)
                      </span>
                    ) : eligibleForRefund ? (
                      <span className="text-xs font-semibold px-2 py-1 rounded-full border border-green-200 bg-green-50 text-green-800">
                        Eligible for refund
                      </span>
                    ) : countdown ? (
                      <span className="text-xs font-semibold px-2 py-1 rounded-full border border-blue-200 bg-blue-50 text-blue-800">
                        Eligible in {countdown}
                      </span>
                    ) : null}
                  </div>
                </div>
                <div className="text-sm text-gray-700">
                  <div className="font-semibold">Job Poster Pays</div>
                  <div className="font-mono">{money(total)}</div>
                </div>
              </div>
              {!funded ? (
                <div className="mt-3">
                  <a
                    className="text-8fold-green font-semibold hover:text-8fold-green-dark"
                    href="/app/job-poster/post-a-job"
                  >
                    Continue payment →
                  </a>
                </div>
              ) : eligibleForRefund ? (
                <div className="mt-3 text-sm text-gray-700">
                  Refunds are reviewed manually.{" "}
                  <button
                    className="ml-2 inline-flex items-center justify-center rounded-lg border border-gray-300 px-3 py-1.5 font-semibold hover:bg-gray-50"
                    onClick={() =>
                      alert("Refund request placeholder (backend route not implemented yet).")
                    }
                  >
                    Request refund
                  </button>
                </div>
              ) : null}
            </div>
          );
        })}

        {!jobs.length && !loading ? (
          <div className="text-sm text-gray-600">No jobs yet.</div>
        ) : null}
      </div>
    </>
  );
}

