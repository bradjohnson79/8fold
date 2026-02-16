export default function StripeRefreshPage() {
  // Stripe redirects here if the onboarding link expires. Send the user back to profile to retry.
  if (typeof window !== "undefined") {
    window.location.href = "/app";
  }
  return null;
}

