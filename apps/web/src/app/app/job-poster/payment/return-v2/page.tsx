"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

type VerifySuccess = {
  success: true;
  jobId: string;
  funded: true;
  idempotent: boolean;
  traceId: string;
};

type VerifyFailure = {
  success?: false;
  code: string;
  traceId: string;
  requiresSupportTicket?: boolean;
};

export default function PaymentReturnV2Page() {
  const params = useSearchParams();
  const paymentIntent = useMemo(() => String(params.get("payment_intent") ?? "").trim(), [params]);
  const [state, setState] = useState<"loading" | "success" | "failure">("loading");
  const [result, setResult] = useState<VerifySuccess | null>(null);
  const [failure, setFailure] = useState<VerifyFailure | null>(null);

  useEffect(() => {
    let active = true;
    void (async () => {
      if (!paymentIntent) {
        if (!active) return;
        setState("failure");
        setFailure({
          code: "MISSING_PAYMENT_INTENT",
          traceId: "missing_payment_intent",
        });
        return;
      }

      const verifyResp = await fetch("/api/app/job-poster/drafts-v2/verify-payment", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ paymentIntentId: paymentIntent }),
      }).catch(() => null);

      const verifyJson = (await verifyResp?.json().catch(() => null)) as VerifySuccess | VerifyFailure | null;
      if (!verifyResp?.ok || !verifyJson?.success) {
        if (!active) return;
        setState("failure");
        setFailure({
          code: String((verifyJson as VerifyFailure)?.code ?? "PAYMENT_VERIFICATION_FAILED"),
          traceId: String((verifyJson as VerifyFailure)?.traceId ?? "unknown"),
          requiresSupportTicket: (verifyJson as VerifyFailure)?.requiresSupportTicket ?? true,
        });
        return;
      }

      if (!active) return;
      setResult(verifyJson as VerifySuccess);
      setState("success");
    })();
    return () => {
      active = false;
    };
  }, [paymentIntent]);

  const supportHref = useMemo(() => {
    const payload = failure ?? {
      code: "PAYMENT_VERIFICATION_FAILED",
      traceId: "unknown",
    };
    const sp = new URLSearchParams({
      category: "PAYMENT_VERIFICATION_FAILED",
      code: payload.code,
      traceId: payload.traceId,
    });
    return `/app/job-poster/support/help?${sp.toString()}`;
  }, [failure]);

  return (
    <div className="p-8">
      {state === "loading" ? (
        <>
          <h1 className="text-2xl font-bold text-gray-900">Verifying payment...</h1>
          <p className="mt-2 text-gray-600">Please wait while we verify your payment securely.</p>
        </>
      ) : null}

      {state === "success" && result ? (
        <>
          <h1 className="text-2xl font-bold text-green-700">Payment verified</h1>
          <p className="mt-2 text-gray-700">Your payment has been securely verified on the server.</p>
          <div className="mt-3 text-sm text-gray-600">
            Job ID: <span className="font-mono">{result.jobId}</span>
          </div>
          <a
            href="/app/job-poster"
            className="inline-block mt-4 bg-8fold-green hover:bg-8fold-green-dark text-white font-semibold px-4 py-2 rounded-lg"
          >
            Back to Dashboard
          </a>
        </>
      ) : null}

      {state === "failure" ? (
        <div className="border border-red-300 bg-red-50 text-red-900 rounded-xl p-5">
          <h1 className="text-xl font-bold">Payment verification failed</h1>
          <p className="mt-2">
            Payment could not be verified. Please submit a support ticket so our team can resolve this immediately.
          </p>
          <div className="mt-2 text-xs font-mono">
            Error code: {failure?.code ?? "PAYMENT_VERIFICATION_FAILED"} | Trace ID: {failure?.traceId ?? "unknown"}
          </div>
          <a
            href={supportHref}
            className="inline-block mt-4 bg-red-700 text-white hover:bg-red-800 font-semibold px-4 py-2 rounded-lg"
          >
            Submit Support Ticket
          </a>
        </div>
      ) : null}
    </div>
  );
}
