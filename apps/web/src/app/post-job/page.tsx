"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";

type AppraisalResult = {
  priceRange: { low: number; high: number };
  suggestedTotal: number;
  rationale: string;
  modelUsed: string;
  promptVersion: string;
};

export default function PostJobPage() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [tradeCategory, setTradeCategory] = useState("");
  const [isRegional, setIsRegional] = useState(false);
  const [stateProvince, setStateProvince] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [appraisal, setAppraisal] = useState<AppraisalResult | null>(null);
  const [sliderValue, setSliderValue] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleBeginAppraisal() {
    setError(null);
    setModalOpen(true);
    try {
      const resp = await fetch("/api/job/appraise-preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim() || "Job",
          description: description.trim() || "Job description",
          tradeCategory: tradeCategory.trim() || "Handyman",
          stateProvince: stateProvince.trim() || "CA",
          isRegional,
        }),
      });
      const data = (await resp.json()) as AppraisalResult | { error?: string };
      if (!resp.ok) {
        throw new Error((data as { error?: string }).error ?? "Appraisal failed");
      }
      const result = data as AppraisalResult;
      setAppraisal(result);
      setSliderValue(result.suggestedTotal);
      setModalOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Appraisal failed");
    }
  }

  const suggestedTotal = appraisal?.suggestedTotal ?? 0;
  const currentValue = sliderValue ?? suggestedTotal;
  const step = 5;
  const low = appraisal?.priceRange.low ?? 50;
  const high = appraisal?.priceRange.high ?? 500;

  let behavioralMessage: string | null = null;
  if (appraisal && sliderValue != null) {
    if (sliderValue < suggestedTotal) {
      behavioralMessage =
        "Lower pricing may result in slower response from 8Fold Contractors.";
    } else if (sliderValue > suggestedTotal) {
      behavioralMessage =
        "Higher pricing encourages faster response from 8Fold Contractors.";
    }
  }

  async function handlePostJob() {
    if (isSubmitting) return;
    setIsSubmitting(true);
    setSubmitError(null);
    const t = title.trim();
    const d = description.trim();
    const tc = tradeCategory.trim();
    const sp = stateProvince.trim();
    if (!t) {
      setSubmitError("Title is required.");
      return;
    }
    if (!d) {
      setSubmitError("Description is required.");
      return;
    }
    if (!tc) {
      setSubmitError("Trade category is required.");
      return;
    }
    if (!sp) {
      setSubmitError("State / Province is required.");
      return;
    }
    const laborCents = Math.round((sliderValue ?? suggestedTotal ?? 200) * 100);
    try {
      const resp = await fetch("/api/job/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: t,
          scope: d,
          region: sp,
          state_code: sp.slice(0, 10),
          country: "US",
          trade_category: tc,
          job_type: isRegional ? "regional" : "urban",
          labor_total_cents: laborCents,
        }),
      });
      const data = (await resp.json()) as { ok?: boolean; jobId?: string; error?: string };
      if (!resp.ok) {
        throw new Error(data.error ?? "Job create failed");
      }
      if (data.ok && data.jobId) {
        setSubmitSuccess(true);
        router.push("/app/job-poster");
      } else {
        setSubmitError("Job created but redirect failed.");
      }
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Job create failed.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <h1 className="text-4xl font-bold text-gray-900">Post a Job (v4 Portal)</h1>
        <p className="text-gray-600 mt-3">Stateless Intake Version</p>

        <div className="mt-8 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">Title</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
              placeholder="e.g. Fix leaky faucet"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={4}
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
              placeholder="Describe the job..."
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Trade Category</label>
            <input
              type="text"
              value={tradeCategory}
              onChange={(e) => setTradeCategory(e.target.value)}
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
              placeholder="e.g. Plumbing, Electrical, Handyman"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">State / Province</label>
            <input
              type="text"
              value={stateProvince}
              onChange={(e) => setStateProvince(e.target.value)}
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
              placeholder="e.g. CA, TX"
            />
          </div>
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="isRegional"
              checked={isRegional}
              onChange={(e) => setIsRegional(e.target.checked)}
              className="h-4 w-4 rounded border-gray-300 text-green-600 focus:ring-green-500"
            />
            <label htmlFor="isRegional" className="text-sm font-medium text-gray-700">
              Regional job
            </label>
          </div>

          <div className="mt-6 flex gap-3">
            <button
              type="button"
              onClick={handleBeginAppraisal}
              className="inline-flex items-center rounded-md bg-green-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-green-500 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2"
            >
              Begin Appraisal
            </button>
            <button
              type="button"
              onClick={handlePostJob}
              disabled={isSubmitting}
              className="inline-flex items-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2"
            >
              {isSubmitting ? "Posting..." : "Post Job"}
            </button>
          </div>
        </div>

        {error && (
          <div className="mt-4 rounded-md bg-red-50 p-4 text-sm text-red-700">
            {error}
          </div>
        )}

        {appraisal && (
          <div className="mt-12 space-y-6 border-t border-gray-200 pt-8">
            <section>
              <h2 className="text-lg font-semibold text-gray-900">Rationale</h2>
              <p className="mt-2 text-gray-700">{appraisal.rationale}</p>
            </section>
            <section>
              <h2 className="text-lg font-semibold text-gray-900">Suggested Price</h2>
              <div className="mt-4">
                <input
                  type="range"
                  min={low}
                  max={high}
                  step={step}
                  value={currentValue}
                  onChange={(e) => setSliderValue(Number(e.target.value))}
                  className="w-full accent-green-600"
                />
                <div className="mt-2 flex justify-between text-sm text-gray-500">
                  <span>${low}</span>
                  <span className="font-semibold text-gray-900">${currentValue}</span>
                  <span>${high}</span>
                </div>
              </div>
              {behavioralMessage && (
                <p className="mt-3 text-sm text-amber-700">{behavioralMessage}</p>
              )}
            </section>
          </div>
        )}

        {submitSuccess && (
          <div className="mt-4 rounded-md bg-green-50 p-4 text-sm text-green-700">
            Job posted successfully. Redirecting…
          </div>
        )}
        {submitError && (
          <div className="mt-4 rounded-md bg-red-50 p-4 text-sm text-red-700">{submitError}</div>
        )}

        {modalOpen && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
            role="dialog"
            aria-modal="true"
            aria-label="Processing"
          >
            <div className="rounded-lg bg-white px-8 py-6 shadow-xl">
              <div className="flex items-center gap-3">
                <svg
                  className="h-6 w-6 animate-spin text-green-600"
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  />
                </svg>
                <span className="text-gray-900">8Fold processing...</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
