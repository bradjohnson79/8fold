import Stripe from "stripe";
import { assertStripeKeysMatchMode, getStripeModeFromEnv, logStripeModeOnce } from "./mode";

const stripeSecretKey = process.env.STRIPE_SECRET_KEY;

if (!stripeSecretKey) {
  // Fail fast in production so we don't limp along with `stripe=null` and 500s at runtime.
  if (process.env.NODE_ENV === "production") {
    throw new Error("STRIPE_SECRET_KEY is required in production");
  }
  // eslint-disable-next-line no-console
  console.warn("[stripe] STRIPE_SECRET_KEY not set. Stripe integration will fail.");
}

const stripeMode = getStripeModeFromEnv();
logStripeModeOnce(stripeMode);
assertStripeKeysMatchMode({
  mode: stripeMode,
  secretKey: stripeSecretKey ?? null,
  publishableKey: process.env.STRIPE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? null,
});

export const stripe = stripeSecretKey
  ? new Stripe(stripeSecretKey, {
      // Pin an API version (do not rely on Stripe dashboard "latest").
      apiVersion: "2025-02-24.acacia",
    })
  : null;

