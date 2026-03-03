"use client";

import React, { useEffect, useState } from "react";

type Job = { id: string; title: string };

export function CancelJobRequestModal({
  job,
  open,
  onClose,
  onSuccess,
}: {
  job: Job;
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (open) {
      setReason("");
      setError("");
      setSubmitting(false);
    }
  }, [open]);

  if (!open) return null;

  const canSubmit = reason.trim().length >= 1 && !submitting;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    setError("");
    try {
      const resp = await fetch(`/api/web/v4/job-poster/jobs/${encodeURIComponent(job.id)}/cancel-request`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ reason: reason.trim() }),
      });
      const data = await resp.json().catch(() => null);
      if (!resp.ok) {
        const msg = data?.error?.message ?? (data?.error ?? "Request failed");
        throw new Error(msg);
      }
      onSuccess();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to submit");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40" aria-modal="true" role="dialog">
      <div className="w-full max-w-lg rounded-2xl bg-white border border-gray-200 shadow-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex items-start justify-between gap-3">
          <h3 className="text-lg font-extrabold text-gray-900">Cancel Job Request</h3>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-gray-700 font-bold px-2"
            aria-label="Close"
            disabled={submitting}
          >
            ×
          </button>
        </div>

        <form onSubmit={submit} className="px-5 py-4">
          <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-4">
            Only jobs that are currently unassigned can be cancelled through this request form. To cancel a job that has
            been assigned to a contractor, you must complete the cancellation through the Messenger section.
          </p>

          {error ? (
            <div className="mb-3 rounded-lg border border-red-200 bg-red-50 text-red-700 text-sm px-3 py-2">
              {error}
            </div>
          ) : null}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Reason for cancellation</label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={4}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-gray-900"
              placeholder="Reason for cancellation"
              required
            />
          </div>

          <div className="mt-6 flex justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
              disabled={submitting}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!canSubmit}
              className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting ? "Submitting…" : "Submit Cancellation Request"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
