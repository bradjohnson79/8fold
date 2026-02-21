"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { formatAvailability } from "../../../components/AvailabilityGrid";

type AppointmentState = "NEEDS_APPOINTMENT" | "AWAITING_CONTACT_SHARE" | "IN_PROGRESS";

type ApiResp =
  | {
      ok: true;
      hasContractor: boolean;
      active: null | {
        job: {
          id: string;
          title: string;
          region: string;
          status: string;
          paymentStatus?: string;
          payoutStatus?: string;
          contractorCompletedAt?: string | null;
          customerApprovedAt?: string | null;
          routerApprovedAt?: string | null;
          availability?: any;
        };
        state: AppointmentState;
        allowedDays: string[];
        appointment: null | { day: string | null; timeOfDay: string | null };
        contact: null | { email: string | null; phone: string | null; sharedAt: string | null };
      };
    }
  | { error: string };

function isJobActiveForPm(job: { status?: string | null; paymentStatus?: string | null }): boolean {
  const status = String(job.status ?? "").toUpperCase();
  const paymentStatus = String(job.paymentStatus ?? "").toUpperCase();
  return (
    (paymentStatus === "FUNDED" || paymentStatus === "FUNDS_SECURED") &&
    ["OPEN_FOR_ROUTING", "ROUTED", "ACCEPTED", "ASSIGNED", "IN_PROGRESS"].includes(status)
  );
}

export function AppointmentCard() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [data, setData] = useState<ApiResp | null>(null);

  const [day, setDay] = useState("");
  const [timeOfDay, setTimeOfDay] = useState<"Morning" | "Afternoon" | "Evening">("Morning");
  const [submitting, setSubmitting] = useState(false);

  const [completionOpen, setCompletionOpen] = useState(false);
  const [completionSummary, setCompletionSummary] = useState("");
  const [completionSubmitting, setCompletionSubmitting] = useState(false);
  const [completionError, setCompletionError] = useState("");

  const [disputeOpen, setDisputeOpen] = useState(false);
  const [disputeReason, setDisputeReason] = useState<"PRICING" | "WORK_QUALITY" | "NO_SHOW" | "PAYMENT" | "OTHER">("OTHER");
  const [disputeDescription, setDisputeDescription] = useState("");
  const [disputeSubmitting, setDisputeSubmitting] = useState(false);
  const [disputeError, setDisputeError] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    try {
      const resp = await fetch("/api/app/contractor/appointment", { cache: "no-store" });
      const json = (await resp.json().catch(() => ({}))) as ApiResp;
      if (!resp.ok || "error" in json) throw new Error("error" in json ? json.error : "Failed to load");
      setData(json);
      const first = (json as any)?.active?.allowedDays?.[0] ?? "";
      setDay((prev) => prev || first);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const active = (data && "ok" in data ? data.active : null) as any;
  const state = active?.state as AppointmentState | undefined;
  const job = active?.job as any;
  const isDisputed = String(job?.status ?? "").toUpperCase() === "DISPUTED";
  const disputeEligible =
    Boolean(job?.id) &&
    ["FUNDED", "FUNDS_SECURED"].includes(String(job?.paymentStatus ?? "").toUpperCase()) &&
    String(job?.payoutStatus ?? "").toUpperCase() !== "RELEASED" &&
    !job?.routerApprovedAt &&
    !isDisputed;

  const completionBadge = useMemo(() => {
    const contractorDone = Boolean(job?.contractorCompletedAt);
    const customerDone = Boolean(job?.customerApprovedAt);
    const routerDone = Boolean(job?.routerApprovedAt);
    if (contractorDone && customerDone && routerDone) return "Completed";
    if (contractorDone && customerDone) return "Awaiting Router Confirmation";
    if (contractorDone) return "Awaiting Customer Confirmation";
    return null;
  }, [job?.contractorCompletedAt, job?.customerApprovedAt, job?.routerApprovedAt]);

  const canSubmit = useMemo(() => Boolean(active?.job?.id) && Boolean(day) && !submitting, [active, day, submitting]);

  async function propose() {
    if (!active?.job?.id) return;
    setSubmitting(true);
    setError("");
    try {
      const resp = await fetch("/api/app/contractor/appointment", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jobId: active.job.id, day, timeOfDay })
      });
      const json = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error(json?.error || "Failed to submit");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to submit");
    } finally {
      setSubmitting(false);
    }
  }

  async function submitCompletion() {
    if (!job?.id) return;
    const s = completionSummary.trim();
    if (s.length < 20) return;
    setCompletionSubmitting(true);
    setCompletionError("");
    try {
      const resp = await fetch(`/api/app/contractor/jobs/${encodeURIComponent(job.id)}/complete`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ summary: s }),
      });
      const json = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error(json?.error || "Failed to submit completion");
      setCompletionOpen(false);
      setCompletionSummary("");
      await load();
    } catch (e) {
      setCompletionError(e instanceof Error ? e.message : "Failed to submit completion");
    } finally {
      setCompletionSubmitting(false);
    }
  }

  async function openDispute() {
    if (!job?.id) return;
    setDisputeSubmitting(true);
    setDisputeError("");
    try {
      const statement = disputeDescription.trim();
      if (statement.length < 100) throw new Error("Statement must be at least 100 characters.");

      const participantsResp = await fetch(`/api/app/support/jobs/${encodeURIComponent(job.id)}/participants`, { cache: "no-store" });
      const participantsJson = await participantsResp.json().catch(() => null);
      if (!participantsResp.ok) throw new Error(participantsJson?.error ?? "Failed to load job participants");
      const againstUserId = participantsJson?.participants?.jobPosterUserId as string | undefined;
      if (!againstUserId) throw new Error("Job poster user id missing for this job.");

      const subject = `Dispute: ${String(job.title ?? job.id).slice(0, 140)}`;
      const body = {
        jobId: job.id,
        againstUserId,
        againstRole: "JOB_POSTER",
        disputeReason,
        description: statement,
        subject,
        roleContext: "CONTRACTOR",
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

      setDisputeOpen(false);
      setDisputeDescription("");
      router.push(`/app/contractor/support/disputes/${encodeURIComponent(disputeId)}`);
    } catch (e) {
      setDisputeError(e instanceof Error ? e.message : "Failed to open dispute");
    } finally {
      setDisputeSubmitting(false);
    }
  }

  return (
    <div className="border border-gray-200 rounded-2xl p-6 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-gray-900">Book Appointment (Required)</h2>
          <p className="text-gray-600 mt-1">You must schedule within 3 business days.</p>
        </div>
        <button
          onClick={() => void load()}
          className="bg-gray-100 hover:bg-gray-200 text-gray-900 font-semibold px-4 py-2 rounded-lg"
        >
          Refresh
        </button>
      </div>

      {error ? (
        <div className="mt-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">{error}</div>
      ) : null}

      {loading ? <div className="mt-6 text-gray-600">Loading…</div> : null}

      {!loading && data && "ok" in data && !data.hasContractor ? (
        <div className="mt-6 text-gray-700">No contractor profile found for this account.</div>
      ) : null}

      {!loading && data && "ok" in data && data.hasContractor && !data.active ? (
        <div className="mt-6 text-gray-700">No assigned jobs right now.</div>
      ) : null}

      {!loading && active ? (
        <div className="mt-6 space-y-4">
          <div className="text-sm text-gray-700">
            <span className="font-semibold">Job:</span> {active.job.title}
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {isDisputed ? (
              <span className="inline-flex px-2 py-1 rounded-full text-xs font-semibold border bg-red-50 text-red-800 border-red-200">
                Disputed
              </span>
            ) : null}
            {isJobActiveForPm(active.job) ? (
              <a
                href={`/app/contractor/jobs/${encodeURIComponent(active.job.id)}/materials`}
                className="bg-8fold-green hover:bg-8fold-green-dark text-white font-semibold px-4 py-2 rounded-lg"
              >
                Parts &amp; Materials
              </a>
            ) : (
              <span
                title="Parts & Materials available only for active jobs."
                className="bg-8fold-green text-white font-semibold px-4 py-2 rounded-lg opacity-50 cursor-not-allowed"
              >
                Parts &amp; Materials
              </span>
            )}
            <span
              className={
                isJobActiveForPm(active.job)
                  ? "inline-flex px-2 py-1 rounded-full text-xs font-semibold border bg-green-50 text-green-800 border-green-200"
                  : "inline-flex px-2 py-1 rounded-full text-xs font-semibold border bg-gray-50 text-gray-700 border-gray-200"
              }
            >
              {isJobActiveForPm(active.job) ? "Active" : "Inactive"}
            </span>

            {completionBadge ? (
              <span className="inline-flex px-2 py-1 rounded-full text-xs font-semibold border bg-blue-50 text-blue-800 border-blue-200">
                {completionBadge}
              </span>
            ) : null}
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {job?.contractorCompletedAt ? (
              <span className="bg-gray-100 text-gray-700 font-semibold px-4 py-2 rounded-lg opacity-80 cursor-not-allowed">
                Completion Submitted
              </span>
            ) : (
              <button
                onClick={() => {
                  setCompletionError("");
                  setCompletionSummary("");
                  setCompletionOpen(true);
                }}
                disabled={isDisputed}
                title={isDisputed ? "Completion is disabled while a dispute is open." : undefined}
                className="bg-8fold-green hover:bg-8fold-green-dark text-white font-semibold px-4 py-2 rounded-lg disabled:opacity-60 disabled:cursor-not-allowed"
              >
                Mark Job Completed
              </button>
            )}

            {disputeEligible ? (
              <button
                onClick={() => {
                  setDisputeError("");
                  setDisputeDescription("");
                  setDisputeReason("OTHER");
                  setDisputeOpen(true);
                }}
                className="bg-white border border-red-200 hover:bg-red-50 text-red-700 font-semibold px-4 py-2 rounded-lg"
              >
                Open Dispute
              </button>
            ) : null}
          </div>

          {(() => {
            const a = (active.job as any)?.availability ?? null;
            const lines = formatAvailability(a as any);
            return (
              <div className="border border-gray-200 rounded-xl p-4 bg-gray-50">
                <div className="text-sm font-semibold text-gray-900">Job Poster Availability</div>
                <div className="text-xs text-gray-600 mt-1">Informational only. You can propose any appointment time.</div>
                {lines.length ? (
                  <div className="mt-3 space-y-1 text-sm text-gray-800">
                    {lines.map((l) => (
                      <div key={l}>{l}</div>
                    ))}
                  </div>
                ) : (
                  <div className="mt-3 text-sm text-gray-700">Not provided.</div>
                )}
              </div>
            );
          })()}

          {state === "NEEDS_APPOINTMENT" ? (
            <>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <label className="block md:col-span-2">
                  <div className="text-sm font-medium text-gray-700">Day (next 3 business days)</div>
                  <select
                    value={day}
                    onChange={(e) => setDay(e.target.value)}
                    className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2"
                  >
                    {(active.allowedDays as string[]).map((d: string) => (
                      <option key={d} value={d}>
                        {d}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <div className="text-sm font-medium text-gray-700">Time</div>
                  <select
                    value={timeOfDay}
                    onChange={(e) => setTimeOfDay(e.target.value as any)}
                    className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2"
                  >
                    <option value="Morning">Morning</option>
                    <option value="Afternoon">Afternoon</option>
                    <option value="Evening">Evening</option>
                  </select>
                </label>
              </div>

              <button
                onClick={() => void propose()}
                disabled={!canSubmit}
                className="bg-8fold-green hover:bg-8fold-green-dark disabled:bg-gray-200 disabled:text-gray-500 text-white font-semibold px-5 py-2.5 rounded-lg"
              >
                {submitting ? "Submitting…" : "Submit appointment proposal"}
              </button>
            </>
          ) : null}

          {state === "AWAITING_CONTACT_SHARE" ? (
            <div className="border border-yellow-200 bg-yellow-50 text-yellow-900 rounded-xl p-4">
              <div className="font-semibold">Awaiting Job Poster Contact Share</div>
              <div className="text-sm mt-1">
                Your appointment proposal is locked. Once the Job Poster clicks{" "}
                <span className="font-semibold">“Share My Contact Info”</span>, you can contact them directly.
              </div>
            </div>
          ) : null}

          {state === "IN_PROGRESS" ? (
            <div className="border border-green-200 bg-green-50 text-green-900 rounded-xl p-4">
              <div className="font-semibold">In Progress</div>
              <div className="text-sm mt-1">Contact the Job Poster to finalize exact timing and complete the job.</div>
              <div className="mt-3 text-sm">
                <div>
                  <span className="font-semibold">Email:</span> {active.contact?.email ?? "Not provided"}
                </div>
                <div className="mt-1">
                  <span className="font-semibold">Phone:</span> {active.contact?.phone ?? "Not provided"}
                </div>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      {completionOpen ? (
        <div className="fixed inset-0 z-[1000] bg-black/40 flex items-center justify-center p-4">
          <div className="w-full max-w-xl bg-white rounded-2xl shadow-2xl border border-gray-200 p-6">
            <div className="text-lg font-bold text-gray-900">Mark Job Completed</div>
            <div className="text-sm text-gray-600 mt-2">Briefly describe the work performed and outcome.</div>

            {completionError ? (
              <div className="mt-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
                {completionError}
              </div>
            ) : null}

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
                onClick={() => setCompletionOpen(false)}
                className="border border-gray-300 text-gray-700 hover:bg-gray-50 font-semibold px-4 py-2 rounded-lg"
              >
                Cancel
              </button>
              <button
                disabled={completionSubmitting || completionSummary.trim().length < 20}
                onClick={() => void submitCompletion()}
                className="bg-8fold-green hover:bg-8fold-green-dark text-white font-semibold px-4 py-2 rounded-lg disabled:bg-gray-200 disabled:text-gray-500"
              >
                {completionSubmitting ? "Submitting…" : "Submit"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {disputeOpen ? (
        <div className="fixed inset-0 z-[1000] bg-black/40 flex items-center justify-center p-4">
          <div className="w-full max-w-2xl bg-white rounded-2xl shadow-2xl border border-gray-200 p-6">
            <div className="text-lg font-bold text-gray-900">Open Dispute</div>
            <div className="text-sm text-gray-600 mt-2">
              Opening a dispute freezes payout until resolution.
            </div>

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
                value={disputeDescription}
                onChange={(e) => setDisputeDescription(e.target.value)}
                rows={7}
                className="mt-1 w-full border border-gray-300 rounded-xl px-3 py-2"
                placeholder="Minimum 100 characters…"
              />
              <div className="mt-2 text-xs text-gray-500">{disputeDescription.trim().length}/5000</div>
            </label>

            <div className="mt-5 flex gap-3 justify-end">
              <button
                disabled={disputeSubmitting}
                onClick={() => setDisputeOpen(false)}
                className="border border-gray-300 text-gray-700 hover:bg-gray-50 font-semibold px-4 py-2 rounded-lg"
              >
                Cancel
              </button>
              <button
                disabled={disputeSubmitting || disputeDescription.trim().length < 100}
                onClick={() => void openDispute()}
                className="bg-red-600 hover:bg-red-700 text-white font-semibold px-4 py-2 rounded-lg disabled:bg-gray-200 disabled:text-gray-500"
              >
                {disputeSubmitting ? "Submitting…" : "Submit dispute"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

