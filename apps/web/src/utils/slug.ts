/**
 * Creates a URL-friendly slug from text.
 * Handles: spaces, accents, special characters, case normalization.
 *
 * Examples:
 *   "New Westminster" → "new-westminster"
 *   "San José" → "san-jose"
 *   "British Columbia" → "british-columbia"
 */
export function slugify(input: string): string {
  return input
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Converts a slug back to Title Case for display/API.
 * Example: "new-westminster" → "New Westminster"
 */
export function slugToTitleCase(slug: string): string {
  return slug
    .trim()
    .replace(/-/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}
