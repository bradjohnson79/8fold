import { getTradeDelta } from "./tradeDeltas";
import type { TradeCategory } from "../types/dbEnums";

export class PriceOutOfRangeError extends Error {
  constructor(
    public selectedPriceCents: number,
    public medianPriceCents: number,
    public allowedDeltaCents: number
  ) {
    super(
      `Price adjustment out of range. Selected: $${(selectedPriceCents / 100).toFixed(2)}, ` +
      `Median: $${(medianPriceCents / 100).toFixed(2)}, ` +
      `Allowed delta: ±$${(allowedDeltaCents / 100).toFixed(2)}`
    );
    this.name = "PriceOutOfRangeError";
  }
}

/**
 * Validate that price adjustment is within allowed delta
 * Rule: abs(selectedPrice - medianPrice) <= allowedDelta
 */
export function validatePriceAdjustment(
  selectedPriceCents: number,
  medianPriceCents: number,
  tradeCategory: TradeCategory
): { valid: boolean; error?: PriceOutOfRangeError } {
  const allowedDeltaCents = getTradeDelta(tradeCategory);
  const adjustment = Math.abs(selectedPriceCents - medianPriceCents);

  if (adjustment > allowedDeltaCents) {
    return {
      valid: false,
      error: new PriceOutOfRangeError(
        selectedPriceCents,
        medianPriceCents,
        allowedDeltaCents
      ),
    };
  }

  return { valid: true };
}

/**
 * Validate that job location is in same province/state as profile
 */
export function validateJobLocation(
  jobProvince: string,
  profileProvince: string
): { valid: boolean; error?: string } {
  // Normalize province codes (e.g., "BC" vs "British Columbia")
  const normalize = (p: string) => p.trim().toUpperCase().replace(/\s+/g, "");
  const jobNorm = normalize(jobProvince);
  const profileNorm = normalize(profileProvince);

  if (jobNorm !== profileNorm) {
    return {
      valid: false,
      error: `Job location (${jobProvince}) must be in same province/state as your profile (${profileProvince})`,
    };
  }

  return { valid: true };
}
