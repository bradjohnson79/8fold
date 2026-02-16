export type CountryCode2 = "US" | "CA";

const US_ZIP_RE = /^\d{5}(-\d{4})?$/;
const CA_POSTAL_RE = /^[A-Za-z]\d[A-Za-z][ -]?\d[A-Za-z]\d$/;

export function normalizePostalCode(raw: string): string {
  const trimmed = raw.trim().toUpperCase();
  // Collapse multiple spaces
  const collapsed = trimmed.replace(/\s+/g, " ");

  // If it's a CA postal without a space, normalize to "A1A 1A1"
  const compact = collapsed.replace(/ /g, "");
  if (compact.length === 6 && /^[A-Z]\d[A-Z]\d[A-Z]\d$/.test(compact)) {
    return `${compact.slice(0, 3)} ${compact.slice(3)}`;
  }
  return collapsed;
}

export function validatePostalCode(country: CountryCode2, raw: string): boolean {
  const normalized = normalizePostalCode(raw);
  if (country === "US") return US_ZIP_RE.test(normalized);
  return CA_POSTAL_RE.test(normalized);
}

export function validateAndNormalizePostalCode(
  country: CountryCode2,
  raw: string | null | undefined
): string | null {
  if (raw == null) return null;
  const trimmed = String(raw).trim();
  if (!trimmed) return null;
  const normalized = normalizePostalCode(trimmed);
  if (!validatePostalCode(country, normalized)) return null;
  return normalized;
}

