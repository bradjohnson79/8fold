'use client';

import React from "react";
import { useRouter } from "next/navigation";
import { ContractorResponsesCard } from "./ContractorResponsesCard";
import { EcdCheckInsCard } from "./EcdCheckInsCard";
import { ErrorDisplay } from "../../../../components/ErrorDisplay";
import { LoadingSpinner } from "../../../../components/LoadingSpinner";
import { formatEligibilityCountdown, isRefundEligible, refundEligibleAtUtc } from "@/lib/refundEligibility";

type JobRow = {
  id: string;
  title: string;
  status: string;
  paymentStatus?: string;
  payoutStatus?: string;
  jobPosterWizardStep?: string | null;
  aiAppraisalStatus?: string | null;
  appraisalStatus?: string | null;
  region: string;
  city: string | null;
  regionCode: string | null;
  tradeCategory: string;
  createdAt: string;
  publishedAt?: string;
  escrowLockedAt: string | null;
  paymentCapturedAt?: string | null;
  laborTotalCents: number;
  materialsTotalCents: number;
  transactionFeeCents: number;
  repeatContractorDiscountCents: number;
  contractorCompletedAt?: string | null;
  customerApprovedAt?: string | null;
  routerApprovedAt?: string | null;
  assignment: null | { contractorId: string; contractor: { businessName: string; trade: string; regionCode: string } };
  repeatContractorRequest: null | { status: string; contractorId: string; requestedAt: string; respondedAt: string | null };
};

type PendingMaterials = {
  id: string;
  status: string;
  createdAt: string;
  submittedAt: string | null;
  currency: string;
  totalAmountCents: number;
  jobId: string;
  job: { id: string; title: string; status: string; paymentStatus?: string };
};

function money(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

function isPendingStatus(s: string) {
  return ["OPEN_FOR_ROUTING", "ASSIGNED", "IN_PROGRESS", "CONTRACTOR_COMPLETED", "CUSTOMER_APPROVED"].includes(s);
}

function isJobActiveForPm(job: { status?: string | null; paymentStatus?: string | null }): boolean {
  const status = String(job.status ?? "").toUpperCase();
  const paymentStatus = String(job.paymentStatus ?? "").toUpperCase();
  return (
    paymentStatus === "FUNDED" &&
    ["OPEN_FOR_ROUTING", "ROUTED", "ACCEPTED", "ASSIGNED", "IN_PROGRESS"].includes(status)
  );
}

export default function JobPosterDashboard() {
  const router = useRouter();
  const [jobs, setJobs] = React.useState<JobRow[]>([]);
  const [materials, setMaterials] = React.useState<PendingMaterials[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState("");
  const [refundMeta, setRefundMeta] = React.useState<null | {
    now: string;
    eligibleAtByJobId: Record<string, string>;
  }>(null);
  const [refundMetaError, setRefundMetaError] = React.useState("");
  const [confirmDelete, setConfirmDelete] = React.useState<null | { id: string; title: string }>(null);
  const [deleting, setDeleting] = React.useState(false);

  const [completionModal, setCompletionModal] = React.useState<null | { id: string; title: string }>(null);
  const [completionSummary, setCompletionSummary] = React.useState("");
  const [completionSubmitting, setCompletionSubmitting] = React.useState(false);

  const [disputeModal, setDisputeModal] = React.useState<null | { jobId: string; title: string }>(null);
  const [disputeReason, setDisputeReason] = React.useState<"PRICING" | "WORK_QUALITY" | "NO_SHOW" | "PAYMENT" | "OTHER">("OTHER");
  const [disputeStatement, setDisputeStatement] = React.useState("");
  const [disputeSubmitting, setDisputeSubmitting] = React.useState(false);
  const [disputeError, setDisputeError] = React.useState("");

  React.useEffect(() => {
    let alive = true;
    (async () => {
      try {
        setLoading(true);
        setError("");
        setRefundMetaError("");
        const [jobsResp, matsResp, refundResp] = await Promise.all([
          fetch("/api/app/job-poster/jobs", { cache: "no-store", credentials: "include" }),
          fetch("/api/app/job-poster/materials/pending", { cache: "no-store", credentials: "include" }),
          fetch("/api/app/job-poster/refund-eligibility", { cache: "no-store", credentials: "include" }),
        ]);
        const jobsJson = await jobsResp.json().catch(() => null);
        const matsJson = await matsResp.json().catch(() => null);
        const refundJson = await refundResp.json().catch(() => null);
        if (!alive) return;
        if (!jobsResp.ok) throw new Error(jobsJson?.error ?? "Failed to load jobs");
        if (!matsResp.ok) throw new Error(matsJson?.error ?? "Failed to load materials");
        setJobs((jobsJson?.jobs ?? []) as JobRow[]);
        setMaterials((matsJson?.requests ?? []) as PendingMaterials[]);
        if (refundResp.ok && refundJson?.ok === true && typeof refundJson?.now === "string") {
          setRefundMeta({
            now: refundJson.now,
            eligibleAtByJobId: (refundJson.eligibleAtByJobId ?? {}) as Record<string, string>,
          });
        } else if (!refundResp.ok) {
          setRefundMeta(null);
          setRefundMetaError("Refund eligibility is temporarily unavailable.");
        }
      } catch (e) {
        if (!alive) return;
        setError(e instanceof Error ? e.message : "Failed to load");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const pendingJobs = jobs.filter((j) => isPendingStatus(j.status));
  const draftJobs = jobs.filter((j) => j.status === "DRAFT");
  const completedJobs = jobs.filter((j) => j.status === "COMPLETED_APPROVED" || j.status === "COMPLETED");

  function completionBadgeForJob(j: JobRow): null | string {
    const contractorDone = Boolean(j.contractorCompletedAt);
    const customerDone = Boolean(j.customerApprovedAt);
    const routerDone = Boolean(j.routerApprovedAt);
    if (contractorDone && customerDone && routerDone) return "Completed";
    if (contractorDone && customerDone) return "Awaiting Router Confirmation";
    if (contractorDone) return "Awaiting Customer Confirmation";
    return null;
  }

  async function deleteDraft(id: string) {
    setDeleting(true);
    setError("");
    try {
      const resp = await fetch(`/api/app/job-poster/drafts/${encodeURIComponent(id)}`, { method: "DELETE" });
      const json = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error(json?.error ?? "Failed to delete draft");
      setConfirmDelete(null);
      const jobsResp = await fetch("/api/app/job-poster/jobs", { cache: "no-store", credentials: "include" });
      const jobsJson = await jobsResp.json().catch(() => null);
      if (!jobsResp.ok) throw new Error(jobsJson?.error ?? "Failed to load jobs");
      setJobs((jobsJson?.jobs ?? []) as JobRow[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setDeleting(false);
    }
  }

  async function confirmCompletion() {
    if (!completionModal?.id) return;
    const summary = completionSummary.trim();
    if (summary.length < 20) return;
    setCompletionSubmitting(true);
    setError("");
    try {
      const resp = await fetch(`/api/app/job-poster/jobs/${encodeURIComponent(completionModal.id)}/confirm-completion`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ summary }),
      });
      const json = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error(json?.error ?? "Failed to confirm completion");
      setCompletionModal(null);
      setCompletionSummary("");
      const jobsResp = await fetch("/api/app/job-poster/jobs", { cache: "no-store", credentials: "include" });
      const jobsJson = await jobsResp.json().catch(() => null);
      if (!jobsResp.ok) throw new Error(jobsJson?.error ?? "Failed to load jobs");
      setJobs((jobsJson?.jobs ?? []) as JobRow[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setCompletionSubmitting(false);
    }
  }

  async function submitDispute() {
    if (!disputeModal?.jobId) return;
    const statement = disputeStatement.trim();
    if (statement.length < 100) return;
    setDisputeSubmitting(true);
    setDisputeError("");
    try {
      const participantsResp = await fetch(`/api/app/support/jobs/${encodeURIComponent(disputeModal.jobId)}/participants`, {
        cache: "no-store",
      });
      const participantsJson = await participantsResp.json().catch(() => null);
      if (!participantsResp.ok) throw new Error(participantsJson?.error ?? "Failed to load job participants");
      const againstUserId = participantsJson?.participants?.contractorUserId as string | undefined;
      if (!againstUserId) throw new Error("Contractor user id missing for this job.");

      const body = {
        jobId: disputeModal.jobId,
        againstUserId,
        againstRole: "CONTRACTOR",
        disputeReason: disputeReason,
        description: statement,
        subject: `Dispute: ${String(disputeModal.title ?? disputeModal.jobId).slice(0, 140)}`,
        roleContext: "JOB_POSTER",
      };

      const resp = await fetch("/api/app/support/disputes", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await resp.json().catch(() => null);
      if (!resp.ok) throw new Error(json?.error ?? "Failed to open dispute");

      const disputeId = json?.dispute?.id as string | undefined;
      if (!disputeId) throw new Error("Dispute created but id missing.");

      setDisputeModal(null);
      setDisputeStatement("");
      router.push(`/app/job-poster/support/disputes/${encodeURIComponent(disputeId)}`);
    } catch (e) {
      setDisputeError(e instanceof Error ? e.message : "Failed to open dispute");
    } finally {
      setDisputeSubmitting(false);
    }
  }

  return (
    <>
      <ErrorDisplay message={error} />
      {loading ? (
        <div className="mt-6">
          <LoadingSpinner label="Loading dashboard…" />
        </div>
      ) : null}

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

      {completionModal ? (
        <div className="fixed inset-0 z-[1000] bg-black/40 flex items-center justify-center p-4">
          <div className="w-full max-w-xl bg-white rounded-2xl shadow-2xl border border-gray-200 p-6">
            <div className="text-lg font-bold text-gray-900">Confirm Job Completion</div>
            <div className="text-sm text-gray-600 mt-2">
              Briefly describe the work outcome for <span className="font-semibold">{completionModal.title}</span>.
            </div>

            <textarea
              value={completionSummary}
              onChange={(e) => setCompletionSummary(e.target.value)}
              rows={6}
              className="mt-4 w-full border border-gray-300 rounded-xl px-3 py-2"
              placeholder="At least 20 characters…"
            />
            <div className="mt-2 text-xs text-gray-500">{completionSummary.trim().length}/5000</div>

            <div className="mt-5 flex gap-3 justify-end">
              <button
                disabled={completionSubmitting}
                onClick={() => setCompletionModal(null)}
                className="border border-gray-300 text-gray-700 hover:bg-gray-50 font-semibold px-4 py-2 rounded-lg"
              >
                Cancel
              </button>
              <button
                disabled={completionSubmitting || completionSummary.trim().length < 20}
                onClick={() => void confirmCompletion()}
                className="bg-8fold-green hover:bg-8fold-green-dark text-white font-semibold px-4 py-2 rounded-lg disabled:bg-gray-200 disabled:text-gray-500"
              >
                {completionSubmitting ? "Submitting…" : "Submit"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {disputeModal ? (
        <div className="fixed inset-0 z-[1000] bg-black/40 flex items-center justify-center p-4">
          <div className="w-full max-w-2xl bg-white rounded-2xl shadow-2xl border border-gray-200 p-6">
            <div className="text-lg font-bold text-gray-900">Open Dispute</div>
            <div className="text-sm text-gray-600 mt-2">Opening a dispute freezes payout until resolution.</div>

            {disputeError ? (
              <div className="mt-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
                {disputeError}
              </div>
            ) : null}

            <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
              <label className="block">
                <div className="text-sm font-medium text-gray-700">Category</div>
                <select
                  value={disputeReason}
                  onChange={(e) => setDisputeReason(e.target.value as any)}
                  className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2"
                >
                  <option value="PRICING">Pricing</option>
                  <option value="WORK_QUALITY">Work quality</option>
                  <option value="NO_SHOW">No show</option>
                  <option value="PAYMENT">Payment</option>
                  <option value="OTHER">Other</option>
                </select>
              </label>
            </div>

            <label className="block mt-3">
              <div className="text-sm font-medium text-gray-700">Statement (required)</div>
              <textarea
                value={disputeStatement}
                onChange={(e) => setDisputeStatement(e.target.value)}
                rows={7}
                className="mt-1 w-full border border-gray-300 rounded-xl px-3 py-2"
                placeholder="Minimum 100 characters…"
              />
              <div className="mt-2 text-xs text-gray-500">{disputeStatement.trim().length}/5000</div>
            </label>

            <div className="mt-5 flex gap-3 justify-end">
              <button
                disabled={disputeSubmitting}
                onClick={() => setDisputeModal(null)}
                className="border border-gray-300 text-gray-700 hover:bg-gray-50 font-semibold px-4 py-2 rounded-lg"
              >
                Cancel
              </button>
              <button
                disabled={disputeSubmitting || disputeStatement.trim().length < 100}
                onClick={() => void submitDispute()}
                className="bg-red-600 hover:bg-red-700 text-white font-semibold px-4 py-2 rounded-lg disabled:bg-gray-200 disabled:text-gray-500"
              >
                {disputeSubmitting ? "Submitting…" : "Submit dispute"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* Drafts */}
      {draftJobs.length ? (
        <div className="mt-6 border border-gray-200 rounded-2xl p-6 shadow-sm">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <h2 className="text-lg font-bold text-gray-900">Drafts</h2>
              <p className="text-gray-600 mt-1">Unconfirmed job postings saved to your account.</p>
            </div>
            <a
              href="/app/job-poster/post-a-job"
              className="bg-8fold-green hover:bg-8fold-green-dark text-white font-semibold px-4 py-2 rounded-lg"
            >
              New draft
            </a>
          </div>
          <div className="mt-5 space-y-3">
            {draftJobs.map((j) => (
              <div key={j.id} className="border border-gray-200 rounded-xl p-4">
                <div className="flex items-start justify-between gap-4 flex-wrap">
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

      {/* 1) Pending Jobs */}
      <div className="mt-6 border border-gray-200 rounded-2xl p-6 shadow-sm">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h2 className="text-lg font-bold text-gray-900">Pending jobs</h2>
            <p className="text-gray-600 mt-1">
              Approval-based only. You can approve contractor acceptance (via the contractor response flow) and approve completed work.
            </p>
          </div>
          <a
            href="/app/job-poster/post-a-job"
            className="bg-8fold-green hover:bg-8fold-green-dark text-white font-semibold px-4 py-2 rounded-lg"
          >
            Post a job
          </a>
        </div>

        <div className="mt-5 space-y-3">
          {pendingJobs.map((j) => {
            const funded = Boolean(j.escrowLockedAt);
            const total = j.laborTotalCents + j.materialsTotalCents;
            const repeatStatus = j.repeatContractorRequest?.status ?? null;
            const badge = completionBadgeForJob(j);
            const canConfirmCompletion = Boolean(j.contractorCompletedAt) && !j.customerApprovedAt;
            const isDisputed = String(j.status ?? "").toUpperCase() === "DISPUTED";
            const disputeEligible =
              String(j.paymentStatus ?? "").toUpperCase() === "FUNDED" &&
              String(j.payoutStatus ?? "").toUpperCase() !== "RELEASED" &&
              !j.routerApprovedAt &&
              !isDisputed;
            return (
              <div key={j.id} className="border border-gray-200 rounded-xl p-4">
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div>
                    <div className="font-bold text-gray-900">{j.title}</div>
                    <div className="text-sm text-gray-600 mt-1">
                      Status: <span className="font-mono">{j.status}</span> · Payment:{" "}
                      <span className={funded ? "text-8fold-green font-semibold" : "text-gray-700 font-semibold"}>
                        {funded ? "Funded" : "Not funded"}
                      </span>
                      {repeatStatus ? (
                        <span className="ml-2 text-xs font-semibold px-2 py-1 rounded-full border border-gray-200 bg-gray-50 text-gray-700">
                          Repeat contractor: {repeatStatus}
                        </span>
                      ) : null}
                      {badge ? (
                        <span className="ml-2 text-xs font-semibold px-2 py-1 rounded-full border border-blue-200 bg-blue-50 text-blue-800">
                          {badge}
                        </span>
                      ) : null}
                      {isDisputed ? (
                        <span className="ml-2 text-xs font-semibold px-2 py-1 rounded-full border border-red-200 bg-red-50 text-red-800">
                          Disputed
                        </span>
                      ) : null}
                    </div>
                    {j.assignment?.contractor ? (
                      <div className="text-sm text-gray-700 mt-2">
                        Contractor: <span className="font-semibold">{j.assignment.contractor.businessName}</span>
                      </div>
                    ) : null}
                  </div>

                  <div className="text-sm text-gray-700">
                    <div className="font-semibold">Job Poster Pays</div>
                    <div className="font-mono">{money(total)}</div>
                  </div>
                </div>

                <div className="mt-3 flex gap-2 flex-wrap">
                  <a
                    href="/app/job-poster"
                    className="border border-gray-300 text-gray-700 hover:bg-gray-50 font-semibold px-3 py-2 rounded-lg"
                  >
                    View approvals
                  </a>
                  <a
                    href={`/app/job-poster/support/help`}
                    className="border border-gray-300 text-gray-700 hover:bg-gray-50 font-semibold px-3 py-2 rounded-lg"
                  >
                    Contact support
                  </a>
                  {canConfirmCompletion ? (
                    <button
                      onClick={() => {
                        setCompletionSummary("");
                        setCompletionModal({ id: j.id, title: j.title });
                      }}
                      disabled={isDisputed}
                      title={isDisputed ? "Completion is disabled while a dispute is open." : undefined}
                      className="bg-8fold-green hover:bg-8fold-green-dark text-white font-semibold px-3 py-2 rounded-lg disabled:opacity-60 disabled:cursor-not-allowed"
                    >
                      Confirm Job Completion
                    </button>
                  ) : j.customerApprovedAt ? (
                    <span className="bg-gray-100 text-gray-700 font-semibold px-3 py-2 rounded-lg opacity-80 cursor-not-allowed">
                      Completion Submitted
                    </span>
                  ) : null}

                  {disputeEligible ? (
                    <button
                      onClick={() => {
                        setDisputeError("");
                        setDisputeReason("OTHER");
                        setDisputeStatement("");
                        setDisputeModal({ jobId: j.id, title: j.title });
                      }}
                      className="bg-white border border-red-200 hover:bg-red-50 text-red-700 font-semibold px-3 py-2 rounded-lg"
                    >
                      Open Dispute
                    </button>
                  ) : null}
                </div>
                <div className="mt-2 text-xs text-gray-500">
                  No contractor rejection actions are available here after acceptance.
                </div>
              </div>
            );
          })}

          {!pendingJobs.length ? <div className="text-sm text-gray-600">No pending jobs.</div> : null}
        </div>
      </div>

      {/* 2) Completed / Past Jobs (conditional) */}
      {completedJobs.length ? (
        <div className="mt-6 border border-gray-200 rounded-2xl p-6 shadow-sm">
          <h2 className="text-lg font-bold text-gray-900">Completed / past jobs</h2>
          <p className="text-gray-600 mt-1">Read-only history of completed work and final payment breakdown.</p>
          <div className="mt-5 space-y-3">
            {completedJobs.map((j) => {
              const total = j.laborTotalCents + j.materialsTotalCents;
              return (
                <div key={j.id} className="border border-gray-200 rounded-xl p-4">
                  <div className="flex items-start justify-between gap-4 flex-wrap">
                    <div>
                      <div className="font-bold text-gray-900">{j.title}</div>
                      <div className="text-sm text-gray-600 mt-1">
                        Contractor:{" "}
                        <span className="font-semibold">
                          {j.assignment?.contractor?.businessName ?? "—"}
                        </span>
                      </div>
                      <div className="text-xs text-gray-500 mt-2">Completion: {j.publishedAt ? new Date(j.publishedAt).toLocaleDateString() : "—"}</div>
                    </div>
                    <div className="text-sm text-gray-700">
                      <div className="font-semibold">Final total</div>
                      <div className="font-mono">{money(total)}</div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}

      {/* 3) Notifications / Messages */}
      <div className="mt-6 grid grid-cols-1 lg:grid-cols-2 gap-6">
        <EcdCheckInsCard />
        <ContractorResponsesCard />
      </div>

      {/* 4) Approved Parts & Materials (conditional) */}
      {materials.length ? (
        <div className="mt-6 border border-gray-200 rounded-2xl p-6 shadow-sm">
          <h2 className="text-lg font-bold text-gray-900">Approved parts & materials</h2>
          <p className="text-gray-600 mt-1">Contractor-submitted parts/materials awaiting approval.</p>
          <div className="mt-5 space-y-3">
            {materials.map((m) => (
              <div key={m.id} className="border border-gray-200 rounded-xl p-4">
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div>
                    <div className="flex items-center gap-2">
                      <div className="font-bold text-gray-900">{m.job.title}</div>
                      <span
                        className={
                          isJobActiveForPm(m.job)
                            ? "inline-flex px-2 py-1 rounded-full text-xs font-semibold border bg-green-50 text-green-800 border-green-200"
                            : "inline-flex px-2 py-1 rounded-full text-xs font-semibold border bg-gray-50 text-gray-700 border-gray-200"
                        }
                      >
                        {isJobActiveForPm(m.job) ? "Active" : "Inactive"}
                      </span>
                    </div>
                    <div className="text-sm text-gray-600 mt-1">
                      Total: <span className="font-mono">{money(m.totalAmountCents)}</span> · Status{" "}
                      <span className="font-mono">{m.status}</span>
                    </div>
                  </div>
                  {isJobActiveForPm(m.job) ? (
                    <a
                      href={`/app/job-poster/jobs/${m.jobId}/materials`}
                      className="bg-8fold-green hover:bg-8fold-green-dark text-white font-semibold px-4 py-2 rounded-lg"
                    >
                      Review & approve
                    </a>
                  ) : (
                    <span
                      title="Parts & Materials can only be requested when the job is active."
                      className="bg-8fold-green text-white font-semibold px-4 py-2 rounded-lg opacity-50 cursor-not-allowed"
                    >
                      Review & approve
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {/* 5) Contact Support */}
      <div className="mt-6 border border-gray-200 rounded-2xl p-6 shadow-sm">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h2 className="text-lg font-bold text-gray-900">Contact support</h2>
            <p className="text-gray-600 mt-1">Request help or file a dispute. Support is private and human-reviewed.</p>
          </div>
          <a
            href="/app/job-poster/support/help"
            className="bg-gray-100 hover:bg-gray-200 text-gray-900 font-semibold px-4 py-2 rounded-lg"
          >
            Contact Support
          </a>
        </div>
      </div>

      {/* 6) Refund Eligibility (read-only) */}
      <div className="mt-6 border border-gray-200 rounded-2xl p-6 shadow-sm">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h2 className="text-lg font-bold text-gray-900">Refund Eligibility</h2>
            <p className="text-gray-600 mt-1">
              Refunds are reviewed by support. This section shows time-based eligibility only; backend approval is required.
            </p>
          </div>
          <a
            href="/app/job-poster/support/help"
            className="bg-gray-100 hover:bg-gray-200 text-gray-900 font-semibold px-4 py-2 rounded-lg"
          >
            Request Refund
          </a>
        </div>

        {refundMetaError ? (
          <div className="mt-4 bg-yellow-50 border border-yellow-200 text-yellow-900 px-4 py-3 rounded-lg text-sm">
            {refundMetaError}
          </div>
        ) : null}

        {(() => {
          const now = refundMeta?.now ? new Date(refundMeta.now) : null;
          if (!now || isNaN(now.getTime())) {
            return <div className="mt-4 text-sm text-gray-600">Loading refund eligibility…</div>;
          }

          const candidates = jobs.filter((j) => {
            const status = String(j.status ?? "").toUpperCase();
            const payoutStatus = String(j.payoutStatus ?? "").toUpperCase();
            const hasAssignment = Boolean(j.assignment?.contractorId);
            const eligibleStatus = ["DRAFT", "OPEN_FOR_ROUTING", "PUBLISHED"].includes(status);
            const blockedStatus = [
              "ASSIGNED",
              "IN_PROGRESS",
              "CONTRACTOR_COMPLETED",
              "CUSTOMER_APPROVED",
              "COMPLETED_APPROVED",
              "DISPUTED",
            ].includes(status);
            if (!eligibleStatus || blockedStatus) return false;
            if (payoutStatus === "RELEASED") return false;
            if (hasAssignment) return false;
            return true;
          });

          if (candidates.length === 0) {
            return (
              <div className="mt-4 text-sm text-gray-600">
                None of your current jobs are eligible for refund.
              </div>
            );
          }

          return (
            <div className="mt-5 space-y-3">
              {candidates.map((j) => {
                const eligibleAtIso = refundMeta?.eligibleAtByJobId?.[j.id] ?? null;
                const eligibleAt =
                  (eligibleAtIso ? new Date(eligibleAtIso) : refundEligibleAtUtc(j)) ?? null;
                const okEligibleAt = Boolean(eligibleAt && !isNaN(eligibleAt.getTime()));

                const eligibleNow = isRefundEligible(j, now);
                const statusLabel =
                  eligibleAt && okEligibleAt ? formatEligibilityCountdown(eligibleAt, now) : "Eligibility unavailable";

                return (
                  <div key={j.id} className="border border-gray-200 rounded-xl p-4">
                    <div className="flex items-start justify-between gap-4 flex-wrap">
                      <div>
                        <div className="font-bold text-gray-900">{j.title}</div>
                        <div className="text-sm text-gray-600 mt-1">
                          Created:{" "}
                          <span className="font-mono">
                            {j.createdAt ? new Date(j.createdAt).toLocaleString() : "—"}
                          </span>
                        </div>
                        <div className="text-sm text-gray-700 mt-2">
                          <span
                            className={
                              eligibleNow
                                ? "inline-flex px-2 py-1 rounded-full text-xs font-semibold border bg-green-50 text-green-800 border-green-200"
                                : "inline-flex px-2 py-1 rounded-full text-xs font-semibold border bg-gray-50 text-gray-700 border-gray-200"
                            }
                          >
                            {eligibleNow ? "Eligible now" : statusLabel}
                          </span>
                        </div>
                      </div>
                      <div className="flex gap-2 flex-wrap">
                        <a
                          href="/app/job-poster/support/help"
                          className={
                            "font-semibold px-4 py-2 rounded-lg " +
                            (eligibleNow
                              ? "bg-8fold-green hover:bg-8fold-green-dark text-white"
                              : "bg-gray-100 text-gray-500 cursor-not-allowed pointer-events-none")
                          }
                          aria-disabled={!eligibleNow}
                          title={!eligibleNow ? "Not yet eligible based on time + status." : undefined}
                        >
                          Request Refund
                        </a>
                      </div>
                    </div>
                    <div className="mt-2 text-xs text-gray-500">
                      Status must remain in <span className="font-mono">DRAFT</span>,{" "}
                      <span className="font-mono">OPEN_FOR_ROUTING</span>, or <span className="font-mono">PUBLISHED</span>;
                      refunds are not automatic.
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })()}
      </div>
    </>
  );
}


