/**
 * Schema lock: production MUST use public schema explicitly.
 * Ensures DATABASE_URL has ?schema=public in production.
 * No dynamic schema based on env; public is canonical.
 */
const PRODUCTION = process.env.NODE_ENV === "production";

/** Call before creating DB pool. Ensures production URL has schema=public. */
export function ensureProductionSchema(): void {
  if (!PRODUCTION) return;
  const url = process.env.DATABASE_URL;
  if (!url || typeof url !== "string") return;
  try {
    const u = new URL(url);
    const existing = u.searchParams.get("schema");
    if (existing !== "public") {
      u.searchParams.set("schema", "public");
      process.env.DATABASE_URL = u.toString();
    }
  } catch {
    // Invalid URL; let connection fail elsewhere
  }
}

/** Resolved schema at runtime. Production => always "public". */
export function getResolvedSchema(): string {
  ensureProductionSchema();
  const url = process.env.DATABASE_URL ?? "";
  try {
    const u = new URL(url);
    const s = u.searchParams.get("schema");
    if (PRODUCTION) return "public";
    return s && /^[a-zA-Z0-9_]+$/.test(s) ? s : "public";
  } catch {
    return "public";
  }
}

/** Database name for logging (masked). */
export function getDatabaseForLog(): string {
  const url = process.env.DATABASE_URL ?? "";
  try {
    const u = new URL(url);
    const db = u.pathname?.replace(/^\//, "")?.split("?")[0] ?? "unknown";
    return db || "unknown";
  } catch {
    return "unknown";
  }
}
