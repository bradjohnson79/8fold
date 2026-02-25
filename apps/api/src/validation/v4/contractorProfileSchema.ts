import { z } from "zod";
import { TRADE_CATEGORIES_CANONICAL } from "./constants";

const TradeCategorySchema = z.enum(TRADE_CATEGORIES_CANONICAL);

export const V4ContractorProfileSchema = z.object({
  contactName: z.string().trim().min(1).max(120),
  phone: z.string().trim().min(7).max(40),
  businessName: z.string().trim().min(1).max(160),
  tradeCategories: z.array(TradeCategorySchema).min(1).max(10),
  serviceRadiusKm: z.number().int().min(1).max(500),
  homeLatitude: z.number().min(-90).max(90),
  homeLongitude: z.number().min(-180).max(180),
  stripeConnected: z.boolean().default(false),
});

export type V4ContractorProfileInput = z.infer<typeof V4ContractorProfileSchema>;
