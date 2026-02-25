import { z } from "zod";

export const V4RouterProfileSchema = z.object({
  contactName: z.string().trim().min(1).max(120),
  phone: z.string().trim().min(7).max(40),
  homeRegion: z.string().trim().min(1).max(40),
  homeCountryCode: z.string().trim().min(2).max(2),
  homeRegionCode: z.string().trim().min(1).max(10),
  serviceAreas: z.array(z.string().trim().min(1).max(40)).min(1).max(20),
  availability: z.array(z.string().trim().min(1).max(50)).min(1).max(50),
  homeLatitude: z.number().min(-90).max(90),
  homeLongitude: z.number().min(-180).max(180),
});

export type V4RouterProfileInput = z.infer<typeof V4RouterProfileSchema>;
