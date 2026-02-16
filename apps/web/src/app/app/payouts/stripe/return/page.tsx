export default function StripeReturnPage() {
  // Stripe redirects here after onboarding. We just send the user back to their dashboard.
  // Status will be finalized by Stripe webhook (account.updated).
  if (typeof window !== "undefined") {
    window.location.href = "/app";
  }
  return null;
}

