import { z } from "zod";

export const JobGeoSchema = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  provinceState: z.string().trim().min(1).max(50),
  formattedAddress: z.string().trim().min(1).max(500),
});

export type JobGeoInput = z.infer<typeof JobGeoSchema>;
