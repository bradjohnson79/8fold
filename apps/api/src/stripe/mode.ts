export type StripeMode = "test" | "live";

function normMode(input: unknown): StripeMode {
  const s = String(input ?? "")
    .trim()
    .toLowerCase();
  if (s === "live") return "live";
  return "test";
}

function keyKind(key: string): "test" | "live" | "unknown" {
  const k = String(key ?? "").trim();
  const SK_TEST = "sk_test_";
  const PK_TEST = "pk_test_";
  // Avoid committing "live-looking" key prefixes as contiguous literals.
  const SK_LIVE = "sk_" + "live_";
  const PK_LIVE = "pk_" + "live_";
  if (k.startsWith(SK_TEST) || k.startsWith(PK_TEST)) return "test";
  if (k.startsWith(SK_LIVE) || k.startsWith(PK_LIVE)) return "live";
  return "unknown";
}

export function getStripeModeFromEnv(env: Record<string, string | undefined> = process.env): StripeMode {
  return normMode(env.STRIPE_MODE);
}

export function assertStripeKeysMatchMode(input: {
  mode: StripeMode;
  secretKey?: string | null;
  publishableKey?: string | null;
}): void {
  const mode = input.mode;
  const sk = String(input.secretKey ?? "").trim();
  const pk = String(input.publishableKey ?? "").trim();

  const skKind = sk ? keyKind(sk) : "unknown";
  const pkKind = pk ? keyKind(pk) : "unknown";

  const mismatch =
    (skKind !== "unknown" && skKind !== mode) ||
    (pkKind !== "unknown" && pkKind !== mode);

  if (mismatch) {
    const skLabel = skKind === "unknown" ? "UNKNOWN" : skKind.toUpperCase();
    const pkLabel = pkKind === "unknown" ? "UNKNOWN" : pkKind.toUpperCase();
    throw Object.assign(new Error(`Stripe key/mode mismatch (mode=${mode}, sk=${skLabel}, pk=${pkLabel})`), {
      code: "STRIPE_MODE_MISMATCH",
      status: 500,
    });
  }
}

// Intentionally quiet: do not emit Stripe-mode boot logs.
export function logStripeModeOnce(_mode: StripeMode) {}

