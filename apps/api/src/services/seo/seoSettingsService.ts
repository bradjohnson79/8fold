import { db } from "@/db/drizzle";
import { seoSettings } from "@/db/schema/seoSettings";
import { eq } from "drizzle-orm";
import type { SeoSettings } from "@/db/schema/seoSettings";

// 60-second in-memory cache — avoids a DB hit on every SSR request
let cache: { data: SeoSettings; at: number } | null = null;
const CACHE_TTL_MS = 60_000;

export async function getSeoSettings(): Promise<SeoSettings | null> {
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.data;
  try {
    const [row] = await db.select().from(seoSettings).limit(1);
    if (!row) return null;
    cache = { data: row, at: Date.now() };
    return cache.data;
  } catch {
    return null;
  }
}

/**
 * Normalizes a canonical domain string entered by an admin.
 * Strips protocol, trailing slashes, and forces lowercase.
 * Input:  "https://8fold.app/" → Output: "8fold.app"
 */
export function normalizeCanonicalDomain(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//i, "")
    .replace(/\/+$/, "");
}

export async function updateSeoSettings(
  data: Partial<Omit<SeoSettings, "id" | "updatedAt">>,
  adminId: string,
): Promise<void> {
  cache = null; // bust cache immediately

  if (data.canonicalDomain) {
    data.canonicalDomain = normalizeCanonicalDomain(data.canonicalDomain);
  }

  const existing = await db.select({ id: seoSettings.id }).from(seoSettings).limit(1);

  if (existing[0]) {
    await db
      .update(seoSettings)
      .set({ ...data, updatedAt: new Date(), updatedBy: adminId })
      .where(eq(seoSettings.id, existing[0].id));
  } else {
    await db.insert(seoSettings).values({
      ...data,
      updatedAt: new Date(),
      updatedBy: adminId,
    });
  }
}
