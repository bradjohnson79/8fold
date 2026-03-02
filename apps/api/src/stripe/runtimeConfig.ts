import { getStripeModeFromEnv, type StripeMode } from "./mode";

export type StripeKeyMode = StripeMode | "unknown";

export type StripeRuntimeConfig = {
  ok: boolean;
  stripeMode: StripeMode;
  pkMode: StripeKeyMode;
  skMode: StripeKeyMode;
  publishableKeyPresent: boolean;
  secretKeyPresent: boolean;
  errorCode?: "STRIPE_CONFIG_MISSING" | "STRIPE_MODE_MISMATCH";
  errorMessage?: string;
};

function keyMode(key: string | null | undefined): StripeKeyMode {
  const value = String(key ?? "").trim();
  if (!value) return "unknown";
  const SK_TEST = "sk_test_";
  const PK_TEST = "pk_test_";
  const SK_LIVE = "sk_" + "live_";
  const PK_LIVE = "pk_" + "live_";
  if (value.startsWith(SK_TEST) || value.startsWith(PK_TEST)) return "test";
  if (value.startsWith(SK_LIVE) || value.startsWith(PK_LIVE)) return "live";
  return "unknown";
}

export function getStripeRuntimeConfig(env: Record<string, string | undefined> = process.env): StripeRuntimeConfig {
  const secretKey = String(env.STRIPE_SECRET_KEY ?? "").trim();
  const publishableKey = String(env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? env.STRIPE_PUBLISHABLE_KEY ?? "").trim();

  const skMode = keyMode(secretKey);
  const pkMode = keyMode(publishableKey);
  const stripeMode = skMode !== "unknown" ? skMode : getStripeModeFromEnv(env);

  const publishableKeyPresent = publishableKey.length > 0;
  const secretKeyPresent = secretKey.length > 0;

  // API server authority requires only secret key presence.
  // Publishable key may exist only on web and is validated in web proxy config route.
  if (!secretKeyPresent) {
    return {
      ok: false,
      stripeMode,
      pkMode,
      skMode,
      publishableKeyPresent,
      secretKeyPresent,
      errorCode: "STRIPE_CONFIG_MISSING",
      errorMessage: "Stripe secret key is missing.",
    };
  }

  if (pkMode !== "unknown" && skMode !== "unknown" && pkMode !== skMode) {
    return {
      ok: false,
      stripeMode,
      pkMode,
      skMode,
      publishableKeyPresent,
      secretKeyPresent,
      errorCode: "STRIPE_MODE_MISMATCH",
      errorMessage: "Publishable and secret Stripe keys are configured for different modes.",
    };
  }

  return {
    ok: true,
    stripeMode,
    pkMode,
    skMode,
    publishableKeyPresent,
    secretKeyPresent,
  };
}
