export const TRADE_CATEGORIES_CANONICAL = [
  "PLUMBING",
  "ELECTRICAL",
  "HVAC",
  "APPLIANCE",
  "HANDYMAN",
  "PAINTING",
  "CARPENTRY",
  "DRYWALL",
  "ROOFING",
  "JANITORIAL_CLEANING",
  "LANDSCAPING",
  "FENCING",
  "SNOW_REMOVAL",
  "JUNK_REMOVAL",
  "MOVING",
  "AUTOMOTIVE",
  "FURNITURE_ASSEMBLY",
] as const;

export type TradeCategoryCanonical = (typeof TRADE_CATEGORIES_CANONICAL)[number];

export const TRADE_CATEGORIES_UI_ORDER: readonly TradeCategoryCanonical[] = [
  "HANDYMAN",
  "PLUMBING",
  "ELECTRICAL",
  "HVAC",
  "APPLIANCE",
  "CARPENTRY",
  "PAINTING",
  "DRYWALL",
  "ROOFING",
  "LANDSCAPING",
  "JUNK_REMOVAL",
  "FURNITURE_ASSEMBLY",
  "MOVING",
  "FENCING",
  "SNOW_REMOVAL",
  "JANITORIAL_CLEANING",
  "AUTOMOTIVE",
] as const;

export const URBAN_RADIUS_KM = 50;

export function isCanonicalTradeCategory(value: string): value is TradeCategoryCanonical {
  return TRADE_CATEGORIES_CANONICAL.includes(value as TradeCategoryCanonical);
}
