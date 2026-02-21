import { z } from "zod";
import { TradeCategorySchema } from "./trades";
import type { FieldKey } from "./jobDraftV2.fieldKeys";

const NonEmptyTrimmedString = z.string().trim().min(1);

// --- Profile section ---
export const JobDraftV2ProfileSchema = z.object({
  fullName: z.string().trim().min(1).optional(),
  email: z.string().email().optional(),
  phone: z.string().trim().optional(),
  address: z.string().trim().optional(),
  city: z.string().trim().optional(),
  stateProvince: z.string().trim().optional(),
  country: z.enum(["US", "CA"]).optional(),
  lat: z.number().finite().nullable().optional(),
  lng: z.number().finite().nullable().optional(),
});
export type JobDraftV2Profile = z.infer<typeof JobDraftV2ProfileSchema>;

// --- Details section ---
export const JobDraftV2ItemSchema = z.object({
  category: NonEmptyTrimmedString,
  description: NonEmptyTrimmedString,
  quantity: z.number().int().min(1),
  notes: z.string().trim().optional(),
});

export const JobDraftV2GeoSchema = z.object({
  lat: z.number().finite(),
  lng: z.number().finite(),
  countryCode: z.enum(["US", "CA"]).optional(),
  stateCode: z.string().optional(),
  placeId: z.string().optional(),
});

export const JobDraftV2DetailsSchema = z.object({
  title: z.string().trim().min(5).optional(),
  scope: z.string().trim().min(20).optional(),
  tradeCategory: TradeCategorySchema.optional(),
  jobType: z.enum(["urban", "regional"]).optional(),
  timeWindow: z.string().trim().optional(),
  address: z.string().trim().optional(),
  geo: JobDraftV2GeoSchema.nullable().optional(),
  items: z.array(JobDraftV2ItemSchema).optional(),
  photoUrls: z.array(z.string().url()).optional(),
});
export type JobDraftV2Details = z.infer<typeof JobDraftV2DetailsSchema>;

// --- Pricing section ---
export const JobDraftV2AppraisalSchema = z.object({
  total: z.number().positive(),
  confidence: z.enum(["low", "medium", "high"]),
  createdAt: z.string(),
  model: z.string(),
});

export const JobDraftV2PricingSchema = z.object({
  selectedPriceCents: z.number().int().nonnegative().optional(),
  appraisal: JobDraftV2AppraisalSchema.optional(),
  appraisalStatus: z.enum(["pending", "ready", "failed"]).optional(),
});
export type JobDraftV2Pricing = z.infer<typeof JobDraftV2PricingSchema>;

// --- Availability section ---
const DayBlocksSchema = z.object({
  morning: z.boolean().optional(),
  afternoon: z.boolean().optional(),
  evening: z.boolean().optional(),
});

export const JobDraftV2AvailabilitySchema = z.object({
  monday: DayBlocksSchema.optional(),
  tuesday: DayBlocksSchema.optional(),
  wednesday: DayBlocksSchema.optional(),
  thursday: DayBlocksSchema.optional(),
  friday: DayBlocksSchema.optional(),
  saturday: DayBlocksSchema.optional(),
  sunday: DayBlocksSchema.optional(),
});
export type JobDraftV2Availability = z.infer<typeof JobDraftV2AvailabilitySchema>;

// --- Full data ---
export const JobDraftV2DataSchema = z.object({
  profile: JobDraftV2ProfileSchema.optional(),
  details: JobDraftV2DetailsSchema.optional(),
  pricing: JobDraftV2PricingSchema.optional(),
  availability: JobDraftV2AvailabilitySchema.optional(),
});
export type JobDraftV2Data = z.infer<typeof JobDraftV2DataSchema>;

// --- Step validators ---
export function profileComplete(profile: JobDraftV2Profile | undefined): boolean {
  if (!profile) return false;
  return Boolean(
    (profile.fullName ?? "").trim() &&
      (profile.email ?? "").trim() &&
      (profile.address ?? "").trim() &&
      (profile.city ?? "").trim() &&
      (profile.stateProvince ?? "").trim() &&
      (profile.country ?? "").trim() &&
      typeof profile.lat === "number" &&
      typeof profile.lng === "number"
  );
}

export function detailsComplete(details: JobDraftV2Details | undefined): boolean {
  if (!details) return false;
  const items = details.items ?? [];
  return Boolean(
    (details.title ?? "").trim().length >= 5 &&
      (details.scope ?? "").trim().length >= 20 &&
      details.tradeCategory &&
      details.jobType &&
      details.geo &&
      Array.isArray(items) &&
      items.length >= 1
  );
}

export function pricingComplete(pricing: JobDraftV2Pricing | undefined): boolean {
  if (!pricing) return false;
  return (
    pricing.appraisalStatus === "ready" &&
    typeof pricing.selectedPriceCents === "number" &&
    pricing.selectedPriceCents > 0
  );
}

export function paymentReady(data: JobDraftV2Data | undefined): boolean {
  return pricingComplete(data?.pricing) ?? false;
}

// --- Per-field validators (for save-field route) ---
export function validateFieldValue(fieldKey: FieldKey, value: unknown): { ok: true } | { ok: false; message: string } {
  try {
    switch (fieldKey) {
      case "profile.fullName":
        return z.string().trim().min(1).safeParse(value).success ? { ok: true } : { ok: false, message: "Name required" };
      case "profile.email":
        return z.string().email().safeParse(value).success ? { ok: true } : { ok: false, message: "Valid email required" };
      case "profile.phone":
        return { ok: true }; // optional
      case "profile.address":
      case "profile.city":
      case "profile.stateProvince":
        return z.string().trim().min(1).safeParse(value).success ? { ok: true } : { ok: false, message: "Required" };
      case "profile.country":
        return z.enum(["US", "CA"]).safeParse(value).success ? { ok: true } : { ok: false, message: "Invalid country" };
      case "profile.lat":
      case "profile.lng":
        return (typeof value === "number" && Number.isFinite(value)) ? { ok: true } : { ok: false, message: "Invalid coordinate" };
      case "details.title":
        return z.string().trim().min(5).safeParse(value).success ? { ok: true } : { ok: false, message: "At least 5 characters" };
      case "details.scope":
        return z.string().trim().min(20).safeParse(value).success ? { ok: true } : { ok: false, message: "At least 20 characters" };
      case "details.tradeCategory":
        return TradeCategorySchema.safeParse(value).success ? { ok: true } : { ok: false, message: "Invalid trade category" };
      case "details.jobType":
        return z.enum(["urban", "regional"]).safeParse(value).success ? { ok: true } : { ok: false, message: "Invalid job type" };
      case "details.timeWindow":
      case "details.address":
        return { ok: true }; // optional
      case "details.geo":
        return JobDraftV2GeoSchema.safeParse(value).success ? { ok: true } : { ok: false, message: "Invalid geo" };
      case "details.items":
        return z.array(JobDraftV2ItemSchema).min(1).safeParse(value).success ? { ok: true } : { ok: false, message: "At least one item" };
      case "details.photoUrls":
        return z.array(z.string().url()).safeParse(value).success ? { ok: true } : { ok: false, message: "Invalid photo URLs" };
      case "pricing.selectedPriceCents":
        return z.number().int().positive().safeParse(value).success ? { ok: true } : { ok: false, message: "Invalid price" };
      case "pricing.appraisal":
      case "pricing.appraisalStatus":
        return { ok: true }; // set by backend only
      case "availability.schedule":
        return JobDraftV2AvailabilitySchema.safeParse(value).success ? { ok: true } : { ok: false, message: "Invalid availability" };
      default:
        return { ok: false, message: "Unknown field" };
    }
  } catch {
    return { ok: false, message: "Validation failed" };
  }
}
