"use client";

import { StepDetails } from "./steps/StepDetails";
import { StepPricingAvailability } from "./steps/StepPricingAvailability";
import { StepPayment } from "./steps/StepPayment";
import { StepConfirmed } from "./steps/StepConfirmed";
import { useJobDraftV3 } from "./useJobDraftV3";

const STEP_ORDER = ["DETAILS", "PRICING", "PAYMENT", "CONFIRMED"] as const;
type Step = (typeof STEP_ORDER)[number];

export function WizardV3() {
  const draft = useJobDraftV3();
  const rawStep = (draft.draft?.step as string | undefined) ?? "DETAILS";
  const currentStep = rawStep === "AVAILABILITY" ? "PRICING" : rawStep;
  const idx = Math.max(0, STEP_ORDER.indexOf(currentStep as Step));

  return (
    <div className="max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900">Post Job</h1>
      <p className="text-sm text-gray-600 mt-2">
        AI-powered pricing, autosave, escrow-first payment hold.
      </p>

      <div className="mt-4 flex gap-2 flex-wrap">
        {STEP_ORDER.map((step, i) => (
          <div
            key={step}
            className={
              "px-3 py-1 rounded-full text-xs font-semibold border " +
              (i <= idx ? "bg-green-50 border-green-200 text-green-800" : "bg-gray-50 border-gray-200 text-gray-500")
            }
          >
            {step === "PRICING" ? "AI + Pricing + Availability" : step}
          </div>
        ))}
      </div>

      {draft.error ? (
        <div className="mt-4 rounded-lg border border-red-200 bg-red-50 text-red-700 px-4 py-3">{draft.error}</div>
      ) : null}

      <div className="mt-6 border border-gray-200 rounded-2xl p-6">
        {draft.loading ? <div className="text-gray-600">Loading draft...</div> : null}
        {!draft.loading && currentStep === "DETAILS" ? <StepDetails draft={draft} /> : null}
        {!draft.loading && (currentStep === "PRICING" || currentStep === "AVAILABILITY") ? (
          <StepPricingAvailability draft={draft} />
        ) : null}
        {!draft.loading && currentStep === "PAYMENT" ? <StepPayment draft={draft} /> : null}
        {!draft.loading && currentStep === "CONFIRMED" ? <StepConfirmed draft={draft} /> : null}
      </div>
    </div>
  );
}
