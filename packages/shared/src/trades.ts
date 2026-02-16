import { z } from "zod";

// AUTHORITATIVE v1 (LOCKED) — do not rename enum values.
export const TradeCategorySchema = z.enum([
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
  "FURNITURE_ASSEMBLY",
  "AUTOMOTIVE"
]);
export type TradeCategory = z.infer<typeof TradeCategorySchema>;

export const TradeCategoryLabel: Record<TradeCategory, string> = {
  PLUMBING: "Plumbing",
  ELECTRICAL: "Electrical",
  HVAC: "HVAC (Light Duty)",
  APPLIANCE: "Appliance Repair",
  HANDYMAN: "Handyman",
  PAINTING: "Painting",
  CARPENTRY: "Carpentry (Light)",
  DRYWALL: "Drywall",
  ROOFING: "Roofing (Minor)",
  JANITORIAL_CLEANING: "Janitorial & Cleaning",
  LANDSCAPING: "Landscaping & Yard Work",
  FENCING: "Fence Repair",
  SNOW_REMOVAL: "Snow Removal",
  JUNK_REMOVAL: "Junk Removal",
  MOVING: "Light Moving",
  FURNITURE_ASSEMBLY: "Furniture Assembly",
  AUTOMOTIVE: "Automotive (Light)"
};

