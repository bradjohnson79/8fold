import Stripe from "stripe";

const stripeSecretKey = process.env.STRIPE_SECRET_KEY;

if (!stripeSecretKey) {
  // eslint-disable-next-line no-console
  console.warn("[stripe] STRIPE_SECRET_KEY not set. Stripe integration will fail.");
}

export const stripe = stripeSecretKey
  ? new Stripe(stripeSecretKey, {
      // Pin an API version (do not rely on Stripe dashboard "latest").
      apiVersion: "2025-02-24.acacia",
    })
  : null;

