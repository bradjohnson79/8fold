/**
 * Normalize any URL or bare hostname into a clean root domain.
 * Returns null if the input cannot be parsed as a valid domain.
 *
 * Examples:
 *   "https://www.abcroofing.com/contact?utm=1" → "abcroofing.com"
 *   "www.company.com"                           → "company.com"
 *   "not a url"                                 → null
 */
export function normalizeDomain(raw: string): string | null {
  if (!raw || typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;

  try {
    const withScheme = trimmed.startsWith("http") ? trimmed : `https://${trimmed}`;
    const u = new URL(withScheme);
    const hostname = u.hostname.replace(/^www\./, "").toLowerCase();
    // Must look like a real domain (has at least one dot, no spaces)
    if (!hostname.includes(".") || hostname.includes(" ")) return null;
    return hostname;
  } catch {
    return null;
  }
}
