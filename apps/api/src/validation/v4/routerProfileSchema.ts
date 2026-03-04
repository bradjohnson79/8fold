import { z } from "zod";

export const V4RouterProfileSchema = z.object({
  contactName: z.string().trim().min(1).max(120),
  phone: z.string().trim().min(7).max(40),
  homeRegion: z.string().trim().min(1).max(40),
  homeCountryCode: z.string().trim().min(2).max(2),
  homeRegionCode: z.string().trim().max(10).optional().default(""),
  homeLatitude: z.number().min(-90).max(90).optional(),
  homeLongitude: z.number().min(-180).max(180).optional(),
});

export type V4RouterProfileInput = z.infer<typeof V4RouterProfileSchema>;
