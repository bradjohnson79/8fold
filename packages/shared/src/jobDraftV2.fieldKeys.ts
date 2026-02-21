/**
 * Canonical field keys for Job Draft V2.
 * Backend MUST reject any fieldKey not in ALL_FIELD_KEYS with 400 INVALID_FIELD_KEY.
 */

export type FieldKey =
  | "profile.fullName"
  | "profile.email"
  | "profile.phone"
  | "profile.address"
  | "profile.city"
  | "profile.stateProvince"
  | "profile.country"
  | "profile.lat"
  | "profile.lng"
  | "details.title"
  | "details.scope"
  | "details.tradeCategory"
  | "details.jobType"
  | "details.timeWindow"
  | "details.address"
  | "details.geo"
  | "details.items"
  | "details.photoUrls"
  | "pricing.selectedPriceCents"
  | "pricing.appraisal"
  | "pricing.appraisalStatus"
  | "availability.schedule";

export const ALL_FIELD_KEYS: readonly FieldKey[] = [
  "profile.fullName",
  "profile.email",
  "profile.phone",
  "profile.address",
  "profile.city",
  "profile.stateProvince",
  "profile.country",
  "profile.lat",
  "profile.lng",
  "details.title",
  "details.scope",
  "details.tradeCategory",
  "details.jobType",
  "details.timeWindow",
  "details.address",
  "details.geo",
  "details.items",
  "details.photoUrls",
  "pricing.selectedPriceCents",
  "pricing.appraisal",
  "pricing.appraisalStatus",
  "availability.schedule",
] as const;

export function isValidFieldKey(key: string): key is FieldKey {
  return (ALL_FIELD_KEYS as readonly string[]).includes(key);
}
