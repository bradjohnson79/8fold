import { z } from "zod";
import { JobGeoSchema } from "./jobGeoSchema";

export const V4JobPosterProfileSchema = z.object({
  addressLine1: z.string().trim().min(1).max(200),
  addressLine2: z.string().trim().max(200).optional().default(""),
  city: z.string().trim().min(1).max(120),
  provinceState: JobGeoSchema.shape.provinceState,
  postalCode: z.string().trim().min(1).max(24),
  country: z.enum(["CA", "US"]),
  formattedAddress: JobGeoSchema.shape.formattedAddress,
  latitude: JobGeoSchema.shape.latitude,
  longitude: JobGeoSchema.shape.longitude,
  geocodeProvider: z.literal("OSM").default("OSM"),
});

export type V4JobPosterProfileInput = z.infer<typeof V4JobPosterProfileSchema>;
