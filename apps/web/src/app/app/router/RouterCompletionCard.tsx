"use client";

import React from "react";

type ActiveJob = null | {
  id: string;
  title: string;
  region: string;
  status: string;
  paymentStatus?: string;
  payoutStatus?: string;
  contractorCompletedAt?: string | null;
  customerApprovedAt?: string | null;
  routerApprovedAt?: string | null;
};

function completionBadge(job: NonNullable<ActiveJob>): string | null {
  const contractorDone = Boolean(job.contractorCompletedAt);
  const customerDone = Boolean(job.customerApprovedAt);
  const routerDone = Boolean(job.routerApprovedAt);
  if (contractorDone && customerDone && routerDone) return "Completed";
  if (contractorDone && customerDone) return "Awaiting Router Confirmation";
  if (contractorDone) return "Awaiting Customer Confirmation";
  return null;
}

export function RouterCompletionCard() {
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState("");
  const [job, setJob] = React.useState<ActiveJob>(null);
  const [submitting, setSubmitting] = React.useState(false);

  async function load() {
    setLoading(true);
    setError("");
    try {
      const resp = await fetch("/api/app/router/active-job", { cache: "no-store" });
      const json = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error(json?.error || "Failed to load");
      setJob((json as any)?.job ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }

  React.useEffect(() => {
    void load();
  }, []);

  const badge = job ? completionBadge(job) : null;
  const isDisputed = String(job?.status ?? "").toUpperCase() === "DISPUTED";
  const canConfirm = Boolean(job?.contractorCompletedAt) && Boolean(job?.customerApprovedAt) && !job?.routerApprovedAt;

  async function confirm() {
    if (!job?.id) return;
    setSubmitting(true);
    setError("");
    try {
      const resp = await fetch(`/api/app/router/jobs/${encodeURIComponent(job.id)}/confirm-completion`, { method: "POST" });
      const json = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error(json?.error || "Failed to confirm completion");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to confirm");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mt-6 border border-gray-200 rounded-2xl p-6 shadow-sm bg-white">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-gray-900">Completion confirmation</h2>
          <p className="text-gray-600 mt-1">Router is the final gate before automatic fund release.</p>
        </div>
        <button
          onClick={() => void load()}
          disabled={loading || submitting}
          className="bg-gray-100 hover:bg-gray-200 text-gray-900 font-semibold px-4 py-2 rounded-lg disabled:bg-gray-200 disabled:text-gray-500"
        >
          Refresh
        </button>
      </div>

      {error ? <div className="mt-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">{error}</div> : null}

      {loading ? <div className="mt-4 text-sm text-gray-600">Loading…</div> : null}

      {!loading && !job ? <div className="mt-4 text-sm text-gray-700">No active job.</div> : null}

      {!loading && job ? (
        <div className="mt-4">
          <div className="font-semibold text-gray-900">{job.title}</div>
          <div className="text-sm text-gray-600 mt-1">
            Status: <span className="font-mono">{job.status}</span> · Payment:{" "}
            <span className="font-mono">{String(job.paymentStatus ?? "—")}</span> · Payout:{" "}
            <span className="font-mono">{String(job.payoutStatus ?? "—")}</span>
          </div>

          <div className="mt-2 flex items-center gap-2 flex-wrap">
            {isDisputed ? (
              <span className="inline-flex px-2 py-1 rounded-full text-xs font-semibold border bg-red-50 text-red-800 border-red-200">
                Disputed
              </span>
            ) : null}
            {badge ? (
              <span className="inline-flex px-2 py-1 rounded-full text-xs font-semibold border bg-blue-50 text-blue-800 border-blue-200">
                {badge}
              </span>
            ) : null}
          </div>

          <div className="mt-4">
            {isDisputed ? (
              <span className="bg-gray-100 text-gray-700 font-semibold px-5 py-2.5 rounded-lg opacity-80 cursor-not-allowed">
                Router confirmation disabled
              </span>
            ) : canConfirm ? (
              <button
                onClick={() => void confirm()}
                disabled={submitting}
                className="bg-8fold-green hover:bg-8fold-green-dark text-white font-semibold px-5 py-2.5 rounded-lg disabled:bg-gray-200 disabled:text-gray-500"
              >
                {submitting ? "Confirming…" : "Confirm Completion"}
              </button>
            ) : job.routerApprovedAt ? (
              <span className="bg-gray-100 text-gray-700 font-semibold px-5 py-2.5 rounded-lg opacity-80 cursor-not-allowed">
                Completion Confirmed
              </span>
            ) : (
              <span className="text-sm text-gray-600">Awaiting contractor and customer confirmations.</span>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}

