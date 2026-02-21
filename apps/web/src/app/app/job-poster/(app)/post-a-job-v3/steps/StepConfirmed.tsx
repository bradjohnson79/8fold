"use client";

import type { useJobDraftV3 } from "../useJobDraftV3";

type DraftHook = ReturnType<typeof useJobDraftV3>;

export function StepConfirmed({ draft }: { draft: DraftHook }) {
  const paymentIntentId = String(draft.draft?.data?.payment?.paymentIntentId ?? "");

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-bold text-gray-900">Confirmed</h2>
      <div className="rounded-xl border border-green-200 bg-green-50 text-green-800 px-4 py-3">
        Job submitted successfully. Your payment hold is secured and will be captured after completion approvals.
      </div>
      {paymentIntentId ? (
        <div className="text-xs text-gray-600">
          Stripe PaymentIntent: <span className="font-mono">{paymentIntentId}</span>
        </div>
      ) : null}
      <a
        href="/app/job-poster/jobs"
        className="inline-flex bg-8fold-green hover:bg-8fold-green-dark text-white font-semibold px-4 py-2 rounded-lg"
      >
        Go to My Jobs
      </a>
    </div>
  );
}
