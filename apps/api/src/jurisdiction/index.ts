export function normalizeCountryCode(value: string | null | undefined): string {
  return String(value ?? "")
    .trim()
    .toUpperCase();
}

export function normalizeStateCode(value: string | null | undefined): string {
  return String(value ?? "")
    .trim()
    .toUpperCase()
    .replace(/[\s._-]+/g, "");
}

export function isSameJurisdiction(
  aCountry: string | null | undefined,
  aState: string | null | undefined,
  bCountry: string | null | undefined,
  bState: string | null | undefined,
): boolean {
  const ac = normalizeCountryCode(aCountry);
  const as = normalizeStateCode(aState);
  const bc = normalizeCountryCode(bCountry);
  const bs = normalizeStateCode(bState);
  if (!ac || !as || !bc || !bs) return false;
  return ac === bc && as === bs;
}
