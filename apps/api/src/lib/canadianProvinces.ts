/** Canadian provinces/territories for tax region configuration */
export const CANADIAN_PROVINCES = [
  { code: "AB", name: "Alberta" },
  { code: "BC", name: "British Columbia" },
  { code: "MB", name: "Manitoba" },
  { code: "NB", name: "New Brunswick" },
  { code: "NL", name: "Newfoundland and Labrador" },
  { code: "NS", name: "Nova Scotia" },
  { code: "ON", name: "Ontario" },
  { code: "PE", name: "Prince Edward Island" },
  { code: "QC", name: "Quebec" },
  { code: "SK", name: "Saskatchewan" },
  { code: "NT", name: "Northwest Territories" },
  { code: "NU", name: "Nunavut" },
  { code: "YT", name: "Yukon" },
] as const;

export const CANADIAN_PROVINCE_CODES = new Set<string>(CANADIAN_PROVINCES.map((p) => p.code));

export function getProvinceByCode(code: string): { code: string; name: string } | null {
  const upper = String(code ?? "").trim().toUpperCase();
  return CANADIAN_PROVINCES.find((p) => p.code === upper) ?? null;
}
