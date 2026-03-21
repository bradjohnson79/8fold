export const JOB_POSTER_CATEGORIES = [
  "apartment_complex",
  "condo_management",
  "realtor",
  "property_management",
  "business",
  "developer",
] as const;

export type JobPosterCategory = (typeof JOB_POSTER_CATEGORIES)[number];
