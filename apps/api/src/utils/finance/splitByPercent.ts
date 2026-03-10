/**
 * Integer-safe percentage split for financial calculations.
 *
 * Guarantees: primary + remainder === amountCents (no cents lost or doubled).
 *
 * @param amountCents - total amount in cents (non-negative integer)
 * @param percent     - percentage for primary split (0–100 as whole number, e.g. 75 for 75%)
 *
 * @example
 *   const { primary, remainder } = splitByPercent(101, 75);
 *   // primary = 75, remainder = 26  (75 + 26 = 101 ✓)
 *
 * Poster cancels in window:
 *   const { primary: refundCents, remainder: payoutCents } = splitByPercent(amountCents, 75);
 *
 * Any full-refund scenario:
 *   refundCents = amountCents; payoutCents = 0;
 */
export function splitByPercent(
  amountCents: number,
  percent: number,
): { primary: number; remainder: number } {
  const primary = Math.floor((amountCents * percent) / 100);
  const remainder = amountCents - primary;
  return { primary, remainder };
}
