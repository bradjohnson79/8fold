"use client";

import { useMemo, useState } from "react";
import { loadStripe } from "@stripe/stripe-js";
import { Elements, PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";
import type { useJobDraftV3 } from "../useJobDraftV3";

type DraftHook = ReturnType<typeof useJobDraftV3>;

function HoldConfirm(props: {
  clientSecret: string;
  onHeld: () => void;
  onError: (message: string) => void;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [submitting, setSubmitting] = useState(false);

  return (
    <div className="space-y-3">
      <PaymentElement />
      <button
        disabled={!stripe || !elements || submitting}
        onClick={() => {
          void (async () => {
            setSubmitting(true);
            try {
              const result = await stripe!.confirmPayment({
                elements: elements!,
                redirect: "if_required",
              });
              if (result.error) throw new Error(result.error.message || "Payment confirmation failed.");
              if (result.paymentIntent?.status !== "requires_capture") {
                throw new Error("Payment hold not secured. Status is not requires_capture.");
              }
              props.onHeld();
            } catch (e) {
              props.onError(e instanceof Error ? e.message : "Payment confirmation failed.");
            } finally {
              setSubmitting(false);
            }
          })();
        }}
        className="bg-8fold-green hover:bg-8fold-green-dark text-white font-semibold px-4 py-2 rounded-lg disabled:bg-gray-200 disabled:text-gray-500"
      >
        {submitting ? "Confirming..." : "Confirm payment hold"}
      </button>
    </div>
  );
}

export function StepPayment({ draft }: { draft: DraftHook }) {
  const details = (draft.draft?.data?.details ?? {}) as Record<string, any>;
  const pricing = (draft.draft?.data?.pricing ?? {}) as Record<string, any>;
  const selectedPriceCents = Number(pricing.selectedPriceCents ?? 0);
  const isRegional = Boolean(pricing.isRegional ?? details.isRegional);
  const countryCode = String(details.countryCode ?? "US").toUpperCase();
  const currency = countryCode === "CA" ? "CAD" : "USD";
  const regionalFeeCents = isRegional ? 2000 : 0;
  const totalCents = selectedPriceCents + regionalFeeCents;
  const totalLabel = `$${(totalCents / 100).toFixed(2)} ${currency}`;

  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [holdSecured, setHoldSecured] = useState(false);
  const [localError, setLocalError] = useState("");
  const stripePromise = useMemo(() => {
    const pk = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
    return pk ? loadStripe(pk) : null;
  }, []);

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-bold text-gray-900">Payment</h2>
      <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
        <div className="font-semibold text-gray-900">🔒 Secure Payment Authorization</div>
        <div className="text-sm text-gray-700 mt-2">
          Your card will be authorized for this job amount today.
          This is a temporary hold — you will not be charged unless a contractor accepts your job.
        </div>
        <div className="text-sm text-gray-700 mt-2">
          If no contractor is assigned within 5 days,
          the authorization will automatically expire and no charge will be made.
        </div>
        <div className="text-xs text-gray-500 mt-3">
          Funds are securely processed through Stripe.
          8Fold does not store your card details.
        </div>
      </div>
      <div className="text-sm font-semibold text-gray-900">
        Total: {totalLabel}
        {isRegional && (
          <span className="text-gray-600 font-normal ml-1">
            (job + $20 {currency} regional fee → contractor on acceptance)
          </span>
        )}
      </div>

      {localError ? (
        <div className="rounded-lg border border-red-200 bg-red-50 text-red-700 px-4 py-3">{localError}</div>
      ) : null}

      {!clientSecret ? (
        <button
          onClick={() => {
            setLocalError("");
            void draft
              .createPaymentIntent(selectedPriceCents, isRegional)
              .then((res) => setClientSecret(res.clientSecret))
              .catch((e) => setLocalError(e instanceof Error ? e.message : "Failed to prepare payment."));
          }}
          disabled={draft.saving || selectedPriceCents <= 0}
          className="bg-8fold-green hover:bg-8fold-green-dark text-white font-semibold px-4 py-2 rounded-lg disabled:bg-gray-200 disabled:text-gray-500"
        >
          {draft.saving ? "Preparing..." : "Prepare payment hold"}
        </button>
      ) : stripePromise ? (
        <Elements stripe={stripePromise} options={{ clientSecret }}>
          <HoldConfirm
            clientSecret={clientSecret}
            onHeld={() => setHoldSecured(true)}
            onError={(msg) => setLocalError(msg)}
          />
        </Elements>
      ) : (
        <div className="text-sm text-red-700">Stripe publishable key missing.</div>
      )}

      <div className="pt-2 flex gap-2">
        <button
          onClick={() => void draft.patchDraft({ step: "AVAILABILITY" })}
          className="border border-gray-300 text-gray-700 font-semibold px-4 py-2 rounded-lg"
        >
          Back
        </button>
        <button
          onClick={() => {
            setLocalError("");
            void draft
              .submit()
              .then(() => draft.patchDraft({ step: "CONFIRMED" }))
              .catch((e) => setLocalError(e instanceof Error ? e.message : "Submit failed."));
          }}
          disabled={!holdSecured || draft.saving}
          className="bg-8fold-green hover:bg-8fold-green-dark text-white font-semibold px-4 py-2 rounded-lg disabled:bg-gray-200 disabled:text-gray-500"
        >
          {draft.saving ? "Submitting..." : "Submit Job"}
        </button>
      </div>
    </div>
  );
}
