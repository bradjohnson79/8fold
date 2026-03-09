"use client";

import React, { useState } from "react";

type Props = {
  threadId: string;
  jobTitle: string;
  jobDescription: string | null;
  currentPriceCents: number;
  tradeCategory: string | null;
  address: string | null;
  onClose: () => void;
  onSuccess: () => void;
};

function formatMoney(cents: number) {
  return `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function parsePriceInput(raw: string): number {
  return parseFloat(raw.replace(/[^0-9.]/g, "")) || 0;
}

function formatPriceDisplay(raw: string): string {
  const num = parsePriceInput(raw);
  if (!num) return raw;
  return num.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function AppraisalRequestModal({
  threadId,
  jobTitle,
  jobDescription,
  currentPriceCents,
  tradeCategory,
  address,
  onClose,
  onSuccess,
}: Props) {
  const [contractorScope, setContractorScope] = useState("");
  const [additionalScope, setAdditionalScope] = useState("");
  const [requestedPrice, setRequestedPrice] = useState("");
  const [priceEditing, setPriceEditing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [submittedPriceCents, setSubmittedPriceCents] = useState<number | null>(null);

  async function handleSubmit() {
    const priceDollars = parsePriceInput(requestedPrice);
    if (!priceDollars || priceDollars <= 0) {
      setError("Enter a valid total price.");
      return;
    }
    const requestedPriceCents = Math.round(priceDollars * 100);
    if (requestedPriceCents <= currentPriceCents) {
      setError("The new total price must be greater than the current job price.");
      return;
    }
    if (!contractorScope.trim()) {
      setError("Please describe the work you are willing to complete at the current price.");
      return;
    }
    if (!additionalScope.trim()) {
      setError("Please describe the additional work required.");
      return;
    }

    setSubmitting(true);
    setError("");
    try {
      const resp = await fetch(
        `/api/web/v4/contractor/messages/thread/${encodeURIComponent(threadId)}/appraisal-request`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            requestedPriceCents,
            contractorScopeDetails: contractorScope.trim(),
            additionalScopeDetails: additionalScope.trim(),
          }),
        },
      );
      const json = await resp.json().catch(() => ({} as any));
      if (!resp.ok) throw new Error(json?.error ?? "Failed to submit request");
      setSubmittedPriceCents(requestedPriceCents);
      onSuccess();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to submit request");
    } finally {
      setSubmitting(false);
    }
  }

  if (submittedPriceCents !== null) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
        <div className="w-full max-w-xl rounded-xl bg-white p-6 shadow-xl">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 text-lg">✓</span>
            <h3 className="text-lg font-semibold text-emerald-700">Request Submitted</h3>
          </div>
          <p className="mt-3 text-sm text-slate-600">
            Your 2nd appraisal request has been submitted. Our team will review the request and contact the Job Poster within 24 hours.
          </p>
          <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 divide-y divide-slate-200 text-sm">
            <div className="flex justify-between px-4 py-2.5">
              <span className="text-slate-500">Current job price</span>
              <span className="font-semibold text-slate-700">{formatMoney(currentPriceCents)}</span>
            </div>
            <div className="flex justify-between px-4 py-2.5">
              <span className="text-slate-500">Requested price</span>
              <span className="font-semibold text-emerald-700">{formatMoney(submittedPriceCents)}</span>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="mt-5 w-full rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700"
          >
            Done
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-xl max-h-[90vh] overflow-y-auto rounded-xl bg-white p-6 shadow-xl">
        <div className="flex items-start justify-between gap-3">
          <h3 className="text-lg font-semibold text-slate-900">Request 2nd Appraisal</h3>
          <button type="button" onClick={onClose} className="rounded border border-slate-300 px-2 py-1 text-xs">
            Close
          </button>
        </div>

        <div className="mt-4 rounded-lg bg-slate-50 p-3 text-sm text-slate-700 space-y-1">
          <p><span className="font-semibold">Job:</span> {jobTitle}</p>
          {jobDescription && <p><span className="font-semibold">Description:</span> {jobDescription}</p>}
          {tradeCategory && <p><span className="font-semibold">Trade:</span> {tradeCategory}</p>}
          {address && <p><span className="font-semibold">Location:</span> {address}</p>}
          <p><span className="font-semibold">Current Price:</span> {formatMoney(currentPriceCents)}</p>
        </div>

        {error && (
          <p className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>
        )}

        <div className="mt-4 space-y-3">
          <div>
            <label className="text-sm font-medium text-slate-700">
              What work are you willing to complete for the Job Poster&apos;s current price?
            </label>
            <textarea
              rows={3}
              value={contractorScope}
              onChange={(e) => setContractorScope(e.target.value)}
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              placeholder="Describe the scope you can deliver at the current price..."
            />
          </div>

          <div>
            <label className="text-sm font-medium text-slate-700">
              Please enter the additional details required to complete a second appraisal.
            </label>
            <textarea
              rows={3}
              value={additionalScope}
              onChange={(e) => setAdditionalScope(e.target.value)}
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              placeholder="Describe the additional work that was not included in the original scope..."
            />
          </div>

          <div>
            <label className="text-sm font-medium text-slate-700">
              New Total Price for the Job ($)
            </label>
            <div className="relative mt-1">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-400">$</span>
              <input
                type="text"
                inputMode="decimal"
                value={priceEditing ? requestedPrice : (requestedPrice ? formatPriceDisplay(requestedPrice) : "")}
                onFocus={() => {
                  setPriceEditing(true);
                  setRequestedPrice(requestedPrice.replace(/[^0-9.]/g, ""));
                }}
                onBlur={() => {
                  setPriceEditing(false);
                }}
                onChange={(e) => setRequestedPrice(e.target.value)}
                className="w-full rounded-md border border-slate-300 py-2 pl-7 pr-3 text-sm"
                placeholder="1,200.00"
              />
            </div>
            <p className="mt-1.5 text-xs text-slate-500">
              Enter the total price required to complete the job including the additional work described above. The system will calculate the difference automatically.
            </p>
          </div>

          <button
            type="button"
            onClick={() => void handleSubmit()}
            disabled={submitting}
            className="w-full rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:bg-slate-300"
          >
            {submitting ? "Submitting..." : "Submit 2nd Appraisal Request"}
          </button>
        </div>
      </div>
    </div>
  );
}
