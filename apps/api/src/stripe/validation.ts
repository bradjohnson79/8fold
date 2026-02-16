export type StripeCurrency = "cad" | "usd";

export function normalizeStripeCurrency(v: unknown): StripeCurrency {
  const raw = String(v ?? "").trim();
  if (!raw) return "cad";
  const lower = raw.toLowerCase();
  if (lower === "cad" || lower === "usd") return lower as StripeCurrency;
  const upper = raw.toUpperCase();
  if (upper === "CAD") return "cad";
  if (upper === "USD") return "usd";
  throw Object.assign(new Error("Unsupported currency"), { status: 400 });
}

export function assertStripeMinimumAmount(amountCents: number, currency: StripeCurrency) {
  // Stripe minimums vary by currency/payment method. For card payments in CAD/USD,
  // the common minimum is 50 of the currency's smallest unit.
  const min = currency === "cad" ? 50 : 50;
  if (!Number.isInteger(amountCents) || amountCents < min) {
    throw Object.assign(new Error(`Amount must be at least ${min} cents`), { status: 400 });
  }
}

