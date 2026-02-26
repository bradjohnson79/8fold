import { z } from "zod";
import { TRADE_CATEGORIES_CANONICAL } from "./constants";

const TradeCategorySchema = z.enum(TRADE_CATEGORIES_CANONICAL);
const CONTRACTOR_TOS_VERSION = "v1.0";

export const V4ContractorProfileSchema = z.object({
  contactName: z.string().trim().min(1).max(120),
  phone: z.string().trim().min(7).max(40),
  businessName: z.string().trim().min(1).max(160),
  businessNumber: z.string().trim().max(64).nullable().optional(),
  startedTradeYear: z.number().int().min(1900).max(2100),
  startedTradeMonth: z.number().int().min(1).max(12),
  streetAddress: z.string().trim().min(1).max(160),
  city: z.string().trim().min(1).max(120),
  postalCode: z.string().trim().min(1).max(32),
  countryCode: z.string().trim().min(2).max(2).transform((v) => v.toUpperCase()),
  formattedAddress: z.string().trim().min(1).max(255),
  tradeCategories: z.array(TradeCategorySchema).min(1).max(10),
  homeLatitude: z.number().min(-90).max(90),
  homeLongitude: z.number().min(-180).max(180),
  acceptedTos: z.literal(true),
  tosVersion: z.literal(CONTRACTOR_TOS_VERSION),
});

export type V4ContractorProfileInput = z.infer<typeof V4ContractorProfileSchema>;
