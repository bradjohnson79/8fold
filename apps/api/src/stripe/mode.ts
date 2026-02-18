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
  if (k.startsWith("sk_test_") || k.startsWith("pk_test_")) return "test";
  if (k.startsWith("sk_live_") || k.startsWith("pk_live_")) return "live";
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

let bootLogged = false;

export function logStripeModeOnce(mode: StripeMode) {
  if (bootLogged) return;
  bootLogged = true;
  // eslint-disable-next-line no-console
  console.log(`[FINANCE] Stripe mode: ${mode === "live" ? "LIVE" : "TEST"}`);
}

