let warnedMissingIntegrityKey = false;

function getIntegrityReadKey(): string {
  return String(process.env.STRIPE_INTEGRITY_READ_KEY ?? "").trim();
}

export function requireStripeIntegrityReadKey(): string {
  const key = getIntegrityReadKey();
  if (!key) {
    throw new Error("STRIPE_INTEGRITY_READ_KEY_MISSING");
  }
  return key;
}

export function validateStripeIntegrityReadKeyOnStartup(): void {
  const key = getIntegrityReadKey();
  if (key) return;

  if (process.env.NODE_ENV === "production") {
    throw new Error("FATAL: STRIPE_INTEGRITY_READ_KEY not configured");
  }

  if (!warnedMissingIntegrityKey) {
    warnedMissingIntegrityKey = true;
    // eslint-disable-next-line no-console
    console.warn("[stripe.integrity] STRIPE_INTEGRITY_READ_KEY not configured (development)");
  }
}
