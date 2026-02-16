import { stateProvinceMap } from "@8fold/shared";

export type RegionCountryCode = "US" | "CA";
export type RegionOption = { code: string; name: string };

const CA_CODES = ["AB", "BC", "MB", "NB", "NL", "NS", "NT", "NU", "ON", "PE", "QC", "SK", "YT"] as const;
const US_CODES = [
  "AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA","KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ","NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT","VA","WA","WV","WI","WY",
] as const;

function nameFor(code: string): string {
  const c = String(code ?? "").trim().toUpperCase();
  const n = (stateProvinceMap as any)[c] as string | undefined;
  return n ?? c;
}

function toOptions(codes: readonly string[]): RegionOption[] {
  return codes.map((code) => ({ code, name: nameFor(code) }));
}

/**
 * Deterministic, static region options.
 * - No DB lookups
 * - Stable ordering (as defined above)
 */
export const REGION_OPTIONS: Record<RegionCountryCode, readonly RegionOption[]> = {
  US: toOptions(US_CODES),
  CA: toOptions(CA_CODES),
} as const;

