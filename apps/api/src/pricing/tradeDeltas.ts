import type { TradeCategory } from "../types/dbEnums";

/**
 * Trade-based price adjustment deltas (in cents)
 * These define the maximum allowed adjustment from median price for each trade.
 * 
 * Rule: abs(selectedPrice - medianPrice) <= tradeDelta
 */
export const TRADE_DELTAS: Record<TradeCategory, number> = {
  // ±$25 trades (standard)
  JANITORIAL_CLEANING: 25_00,
  PLUMBING: 25_00,
  ELECTRICAL: 25_00,
  AUTOMOTIVE: 25_00,
  HVAC: 25_00,
  APPLIANCE: 25_00,
  HANDYMAN: 25_00,
  LANDSCAPING: 25_00,
  FENCING: 25_00,
  SNOW_REMOVAL: 25_00,
  MOVING: 25_00,
  
  // ±$50 trades (higher variability)
  JUNK_REMOVAL: 50_00,
  DRYWALL: 50_00,
  PAINTING: 50_00,
  CARPENTRY: 50_00,
  ROOFING: 50_00,
};

/**
 * Get the allowed delta for a trade category
 */
export function getTradeDelta(tradeCategory: TradeCategory): number {
  return TRADE_DELTAS[tradeCategory] ?? 25_00; // Default to $25 if not found
}
