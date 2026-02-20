"use client";

import { useSearchParams } from "next/navigation";
import { useEffect } from "react";

export default function PaymentReturnPage() {
  const params = useSearchParams();
  const paymentIntent = params.get("payment_intent");
  const redirectStatus = params.get("redirect_status");

  useEffect(() => {
    // Placeholder while backend verification flow is implemented.
    // eslint-disable-next-line no-console
    console.log("Stripe return:", {
      paymentIntent,
      redirectStatus,
    });
  }, [paymentIntent, redirectStatus]);

  return (
    <div className="p-8">
      <h1>Processing payment...</h1>
      <p>Please wait while we verify your payment.</p>
    </div>
  );
}
