import { z } from "zod";
import { JobGeoSchema } from "./jobGeoSchema";
import { TRADE_CATEGORIES_CANONICAL } from "./constants";

const TradeCategorySchema = z.enum(TRADE_CATEGORIES_CANONICAL);

export const V4JobAppraiseBodySchema = z.object({
  title: z.string().trim().min(1, "title is required").max(200),
  description: z.string().trim().min(1, "description is required").max(5000),
  tradeCategory: TradeCategorySchema,
  provinceState: z.string().trim().min(1, "provinceState is required").max(50),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  isRegionalRequested: z.boolean(),
});

export const AppraisalTokenClaimsSchema = z.object({
  v: z.literal(1),
  userId: z.string().trim().min(1).max(100),
  payloadHash: z.string().trim().min(16).max(128),
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().min(1).max(5000),
  tradeCategory: TradeCategorySchema,
  provinceState: z.string().trim().min(1).max(50),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  isRegionalRequested: z.boolean(),
  iat: z.number().int().nonnegative(),
  exp: z.number().int().nonnegative(),
});

export const V4JobCreateBodySchema = z.object({
  title: z.string().trim().min(1, "title is required").max(200),
  scope: z.string().trim().min(1, "scope is required").max(10000),
  region: z.string().trim().min(1, "region is required").max(100),
  state_code: z.string().trim().min(1, "state_code is required").max(10),
  country: z.enum(["US", "CA"]).default("US"),
  trade_category: TradeCategorySchema,
  appraisalCompleted: z.literal(true),
  appraisalToken: z.string().trim().min(16, "appraisalToken is required"),
  labor_total_cents: z.number().int().min(1, "price is required"),
  city: z.string().trim().max(100).optional(),
  address_full: z.string().trim().max(500).optional(),
  provinceState: JobGeoSchema.shape.provinceState,
  latitude: JobGeoSchema.shape.latitude,
  longitude: JobGeoSchema.shape.longitude,
  isRegionalRequested: z.boolean().default(false),
  uploadIds: z.array(z.string().trim().min(8)).max(25).default([]),
  availability: z.object({
    monday: z.object({ morning: z.boolean(), afternoon: z.boolean(), evening: z.boolean() }),
    tuesday: z.object({ morning: z.boolean(), afternoon: z.boolean(), evening: z.boolean() }),
    wednesday: z.object({ morning: z.boolean(), afternoon: z.boolean(), evening: z.boolean() }),
    thursday: z.object({ morning: z.boolean(), afternoon: z.boolean(), evening: z.boolean() }),
    friday: z.object({ morning: z.boolean(), afternoon: z.boolean(), evening: z.boolean() }),
    saturday: z.object({ morning: z.boolean(), afternoon: z.boolean(), evening: z.boolean() }),
    sunday: z.object({ morning: z.boolean(), afternoon: z.boolean(), evening: z.boolean() }),
  }),
});

export type V4JobAppraiseBody = z.infer<typeof V4JobAppraiseBodySchema>;
export type V4JobCreateBody = z.infer<typeof V4JobCreateBodySchema>;
export type AppraisalTokenClaims = z.infer<typeof AppraisalTokenClaimsSchema>;
