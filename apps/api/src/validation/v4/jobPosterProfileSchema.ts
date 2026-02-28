import { z } from "zod";

const US_STATE_CODES = [
  "AL",
  "AK",
  "AZ",
  "AR",
  "CA",
  "CO",
  "CT",
  "DE",
  "FL",
  "GA",
  "HI",
  "ID",
  "IL",
  "IN",
  "IA",
  "KS",
  "KY",
  "LA",
  "ME",
  "MD",
  "MA",
  "MI",
  "MN",
  "MS",
  "MO",
  "MT",
  "NE",
  "NV",
  "NH",
  "NJ",
  "NM",
  "NY",
  "NC",
  "ND",
  "OH",
  "OK",
  "OR",
  "PA",
  "RI",
  "SC",
  "SD",
  "TN",
  "TX",
  "UT",
  "VT",
  "VA",
  "WA",
  "WV",
  "WI",
  "WY",
] as const;

const CA_PROVINCE_CODES = [
  "AB",
  "BC",
  "MB",
  "NB",
  "NL",
  "NS",
  "ON",
  "PE",
  "QC",
  "SK",
] as const;

const BaseSchema = z.object({
  phone: z.string().trim().min(1, "phone is required").max(40),
  country: z.enum(["US", "CA"]),
  region: z.string().trim().min(1, "region is required").max(60),
  city: z.string().trim().min(1, "city is required").max(120),
  address: z.string().trim().min(1, "address is required").max(280),
  latitude: z.number().finite(),
  longitude: z.number().finite(),
});

export const V4JobPosterProfileSchema = BaseSchema.superRefine((value, ctx) => {
  const region = value.region.trim().toUpperCase();
  if (
    value.country === "US" &&
    !US_STATE_CODES.includes(region as (typeof US_STATE_CODES)[number])
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["region"],
      message: "region must be a valid US state code",
    });
  }
  if (
    value.country === "CA" &&
    !CA_PROVINCE_CODES.includes(region as (typeof CA_PROVINCE_CODES)[number])
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["region"],
      message: "region must be a valid Canadian province code",
    });
  }
  if (value.latitude === 0 && value.longitude === 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["latitude"],
      message: "latitude/longitude must come from map selection",
    });
  }
});

export type V4JobPosterProfileInput = z.infer<typeof V4JobPosterProfileSchema>;
