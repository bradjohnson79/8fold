"use client";

import React from "react";

const REASONS = [
  "Misleading information",
  "Inappropriate language",
  "Nudity or explicit photo",
  "Disturbing content",
  "Spam",
  "Other",
] as const;

export function FlagJobModal(props: {
  open: boolean;
  jobTitle: string;
  onClose: () => void;
  onSubmit: (reason: string) => Promise<void>;
}) {
  const [reason, setReason] = React.useState<(typeof REASONS)[number]>("Misleading information");
  const [other, setOther] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState("");
  const [ok, setOk] = React.useState(false);

  React.useEffect(() => {
    if (!props.open) return;
    setError("");
    setOk(false);
    setSubmitting(false);
    setReason("Misleading information");
    setOther("");
  }, [props.open]);

  if (!props.open) return null;

  const finalReason = reason === "Other" ? other.trim() : reason;
  const canSubmit = Boolean(finalReason && finalReason.length >= 3) && !submitting;

  async function submit() {
    if (!canSubmit) return;
    setSubmitting(true);
    setError("");
    try {
      await props.onSubmit(finalReason);
      setOk(true);
      // Short delay so the user sees confirmation.
      setTimeout(() => props.onClose(), 650);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to submit flag");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
      <div className="w-full max-w-md rounded-2xl bg-white border border-gray-200 shadow-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-lg font-extrabold text-gray-900">Flag job</div>
            <div className="text-sm text-gray-600 mt-1 truncate">{props.jobTitle}</div>
          </div>
          <button
            type="button"
            onClick={props.onClose}
            className="text-gray-400 hover:text-gray-700 font-bold px-2"
            aria-label="Close"
            disabled={submitting}
          >
            ×
          </button>
        </div>

        <div className="px-5 py-4">
          {error ? (
            <div className="mb-3 rounded-lg border border-red-200 bg-red-50 text-red-700 text-sm px-3 py-2">
              {error}
            </div>
          ) : null}
          {ok ? (
            <div className="mb-3 rounded-lg border border-green-200 bg-green-50 text-green-800 text-sm px-3 py-2">
              Flag submitted. Thank you.
            </div>
          ) : null}

          <div className="text-sm font-semibold text-gray-800 mb-2">Reason</div>
          <select
            value={reason}
            onChange={(e) => setReason(e.target.value as any)}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 bg-white"
            disabled={submitting}
          >
            {REASONS.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>

          {reason === "Other" ? (
            <div className="mt-3">
              <div className="text-xs font-semibold text-gray-700 mb-1">Describe (optional)</div>
              <input
                value={other}
                onChange={(e) => setOther(e.target.value)}
                placeholder="Short description"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 bg-white"
                disabled={submitting}
                maxLength={200}
              />
            </div>
          ) : null}
        </div>

        <div className="px-5 py-4 border-t border-gray-100 bg-gray-50 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={props.onClose}
            className="px-4 py-2 rounded-lg border border-gray-200 bg-white text-gray-700 font-semibold"
            disabled={submitting}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void submit()}
            className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 disabled:bg-gray-200 disabled:text-gray-500 text-white font-extrabold"
            disabled={!canSubmit}
          >
            {submitting ? "Submitting…" : "Submit flag"}
          </button>
        </div>
      </div>
    </div>
  );
}

