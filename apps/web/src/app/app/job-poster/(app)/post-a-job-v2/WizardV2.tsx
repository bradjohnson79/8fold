"use client";

import React from "react";
import { useDraftV2 } from "./useDraftV2";
import { LoadingSpinner } from "@/components/LoadingSpinner";
import { ErrorDisplay } from "@/components/ErrorDisplay";
import { ProgressSteps } from "@/components/ProgressSteps";

const STEPS = [
  { id: "PROFILE", label: "Profile" },
  { id: "DETAILS", label: "Job Details" },
  { id: "PRICING", label: "Pricing & Availability" },
  { id: "PAYMENT", label: "Payment" },
  { id: "CONFIRMED", label: "Confirmed" },
];

export function WizardV2() {
  const {
    draft,
    loading,
    error,
    versionConflictBanner,
    pendingSaves,
    saveField,
    advanceStep,
    startAppraisal,
    createPaymentIntent,
    reload,
    dismissVersionBanner,
  } = useDraftV2();

  const [localError, setLocalError] = React.useState("");
  const [appraising, setAppraising] = React.useState(false);
  const [paymentLoading, setPaymentLoading] = React.useState(false);

  const currentIndex = STEPS.findIndex((s) => s.id === draft?.currentStep) ?? 0;

  if (loading && !draft) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-bold text-gray-900">Post a Job (V2)</h1>
        <p className="mt-2 text-gray-600">Loading...</p>
        <div className="mt-4">
          <LoadingSpinner />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <ErrorDisplay message={error} />
        <button
          onClick={() => void reload()}
          className="mt-4 bg-8fold-green hover:bg-8fold-green-dark text-white font-semibold px-4 py-2 rounded-lg"
        >
          Retry
        </button>
      </div>
    );
  }

  if (!draft) {
    return (
      <div className="p-6">
        <p className="text-gray-600">No draft available.</p>
      </div>
    );
  }

  const hasPendingSaves = pendingSaves.size > 0;

  const handleNext = async () => {
    const nextStep = STEPS[currentIndex + 1];
    if (!nextStep) return;
    setLocalError("");
    const ok = await advanceStep(nextStep.id);
    if (!ok) setLocalError("Could not advance. Please try again.");
  };

  const handleStartAppraisal = async () => {
    setAppraising(true);
    setLocalError("");
    try {
      const ok = await startAppraisal();
      if (!ok) setLocalError("Appraisal failed. Please contact support.");
    } finally {
      setAppraising(false);
    }
  };

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold text-gray-900">Post a Job (V2)</h1>

      {versionConflictBanner && (
        <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-lg text-amber-900 flex items-center justify-between">
          <span>Draft updated in another tab. Synced to latest version.</span>
          <button
            onClick={dismissVersionBanner}
            className="text-amber-700 hover:text-amber-900 font-semibold"
          >
            Dismiss
          </button>
        </div>
      )}

      <ProgressSteps
        steps={STEPS.map((s) => ({ label: s.label }))}
        currentIdx={currentIndex}
      />

      <div className="mt-6 border border-gray-200 rounded-xl p-6">
        <p className="text-gray-600">
          Step: <strong>{draft.currentStep}</strong> (v{draft.version})
        </p>
        {draft.currentStep === "PROFILE" && (
          <div className="mt-4">
            <p className="text-sm text-gray-500">Profile step — full UI to be wired from V1 components.</p>
            <button
              onClick={handleNext}
              disabled={hasPendingSaves}
              className="mt-4 bg-8fold-green hover:bg-8fold-green-dark disabled:opacity-50 text-white font-semibold px-4 py-2 rounded-lg"
            >
              Next: Job Details
            </button>
          </div>
        )}
        {draft.currentStep === "DETAILS" && (
          <div className="mt-4">
            <p className="text-sm text-gray-500">Job details step — full UI to be wired.</p>
            <button
              onClick={handleNext}
              disabled={hasPendingSaves}
              className="mt-4 bg-8fold-green hover:bg-8fold-green-dark disabled:opacity-50 text-white font-semibold px-4 py-2 rounded-lg"
            >
              Next: Pricing
            </button>
          </div>
        )}
        {draft.currentStep === "PRICING" && (
          <div className="mt-4">
            <p className="text-sm text-gray-500">Pricing step — AI appraisal required.</p>
            <button
              onClick={handleStartAppraisal}
              disabled={appraising || hasPendingSaves}
              className="mt-4 bg-8fold-green hover:bg-8fold-green-dark disabled:opacity-50 text-white font-semibold px-4 py-2 rounded-lg"
            >
              {appraising ? "Starting appraisal..." : "Start Pricing Appraisal"}
            </button>
            {(draft.data?.pricing as any)?.appraisalStatus === "ready" && (
              <button
                onClick={handleNext}
                disabled={hasPendingSaves}
                className="mt-4 ml-2 bg-8fold-green hover:bg-8fold-green-dark disabled:opacity-50 text-white font-semibold px-4 py-2 rounded-lg"
              >
                Next: Payment
              </button>
            )}
          </div>
        )}
        {draft.currentStep === "PAYMENT" && (
          <div className="mt-4">
            <p className="text-sm text-gray-500">Payment step — Stripe Elements to be wired.</p>
            <PaymentStep
              createPaymentIntent={createPaymentIntent}
              returnUrl={`${typeof window !== "undefined" ? window.location.origin : ""}/app/job-poster/payment/return-v2`}
              onLoadingChange={setPaymentLoading}
            />
          </div>
        )}
        {draft.currentStep === "CONFIRMED" && (
          <div className="mt-4">
            <p className="text-green-700 font-semibold">Job posted successfully!</p>
            <a
              href="/app/job-poster"
              className="inline-block mt-4 bg-8fold-green hover:bg-8fold-green-dark text-white font-semibold px-4 py-2 rounded-lg"
            >
              Back to Dashboard
            </a>
          </div>
        )}
      </div>

      {localError && (
        <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-800">
          {localError}
        </div>
      )}
    </div>
  );
}

function PaymentStep({
  createPaymentIntent,
  returnUrl,
  onLoadingChange,
}: {
  createPaymentIntent: () => Promise<{ clientSecret: string; returnUrl: string } | null>;
  returnUrl: string;
  onLoadingChange: (v: boolean) => void;
}) {
  const [clientSecret, setClientSecret] = React.useState<string | null>(null);
  const stripePromise = React.useMemo(() => {
    const pk = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
    return pk ? import("@stripe/stripe-js").then((m) => m.loadStripe(pk)) : null;
  }, []);

  React.useEffect(() => {
    let cancelled = false;
    onLoadingChange(true);
    createPaymentIntent()
      .then((r) => {
        if (!cancelled && r) setClientSecret(r.clientSecret);
      })
      .finally(() => {
        if (!cancelled) onLoadingChange(false);
      });
    return () => {
      cancelled = true;
    };
  }, [createPaymentIntent, onLoadingChange]);

  const handleConfirm = async () => {
    const stripe = await stripePromise;
    if (!stripe || !clientSecret) return;
    const { error } = await stripe.confirmPayment({
      clientSecret,
      confirmParams: { return_url: returnUrl },
    });
    if (error) {
      console.error("Payment error:", error);
    }
  };

  if (!clientSecret) {
    return <p className="text-gray-500">Loading payment form...</p>;
  }

  return (
    <div className="mt-4">
      <p className="text-sm text-gray-600 mb-2">Click to proceed to Stripe payment.</p>
      <button
        onClick={handleConfirm}
        className="bg-8fold-green hover:bg-8fold-green-dark text-white font-semibold px-4 py-2 rounded-lg"
      >
        Pay with Stripe
      </button>
    </div>
  );
}
