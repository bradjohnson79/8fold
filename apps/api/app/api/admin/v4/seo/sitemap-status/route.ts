/**
 * Admin API for sitemap status and rebuild.
 */
import { requireAdminV4 } from "@/src/auth/requireAdminV4";
import { ok, err } from "@/src/lib/api/adminV4Response";
import { db } from "@/db/drizzle";
import { seoSitemapCache } from "@/db/schema/seoSitemapCache";
import { eq } from "drizzle-orm";
import {
  getOrGenerateSitemap,
  invalidateSitemapCache,
  generateIndexSitemap,
  generateJobsSitemap,
  generateContractorsSitemap,
  generateCitiesSitemap,
  generateServiceLocationsSitemap,
  generateServicesSitemap,
} from "@/src/services/v4/seo/sitemapService";

type SitemapType = "index" | "jobs" | "services" | "contractors" | "cities" | "service-locations";

export async function GET(req: Request) {
  const authed = await requireAdminV4(req);
  if (authed instanceof Response) return authed;

  try {
    const rows = await db.select().from(seoSitemapCache);
    const byType: Record<string, { urlCount: number; generatedAt: string | null }> = {};
    for (const r of rows) {
      byType[r.sitemapType] = {
        urlCount: r.urlCount ?? 0,
        generatedAt: r.generatedAt instanceof Date ? r.generatedAt.toISOString() : null,
      };
    }

    // Ensure all types exist (with 0 if not cached)
    const types: SitemapType[] = ["index", "jobs", "services", "contractors", "cities", "service-locations"];
    for (const t of types) {
      if (!byType[t]) byType[t] = { urlCount: 0, generatedAt: null };
    }

    return ok({ sitemaps: byType });
  } catch (e) {
    console.error("[seo/sitemap-status GET]", e);
    return err(500, "SITEMAP_STATUS_ERROR", "Failed to load sitemap status");
  }
}

export async function POST(req: Request) {
  const authed = await requireAdminV4(req);
  if (authed instanceof Response) return authed;

  try {
    const raw = await req.json().catch(() => ({}));
    const type = (raw?.type as string) ?? "all";

    if (type === "all") {
      for (const t of ["index", "jobs", "services", "contractors", "cities", "service-locations"] as const) {
        await invalidateSitemapCache(t);
      }
      await generateIndexSitemap();
      await generateJobsSitemap();
      await generateServicesSitemap();
      await generateContractorsSitemap();
      await generateCitiesSitemap();
      await generateServiceLocationsSitemap();
    } else {
      const valid: SitemapType[] = ["index", "jobs", "services", "contractors", "cities", "service-locations"];
      if (!valid.includes(type as SitemapType)) {
        return err(400, "INVALID_TYPE", `type must be one of: ${valid.join(", ")}, or "all"`);
      }
      await invalidateSitemapCache(type as SitemapType);
      await getOrGenerateSitemap(type as SitemapType);
    }

    const rows = await db.select().from(seoSitemapCache);
    const byType: Record<string, { urlCount: number; generatedAt: string | null }> = {};
    for (const r of rows) {
      byType[r.sitemapType] = {
        urlCount: r.urlCount ?? 0,
        generatedAt: r.generatedAt instanceof Date ? r.generatedAt.toISOString() : null,
      };
    }
    return ok({ sitemaps: byType, rebuilt: type });
  } catch (e) {
    console.error("[seo/sitemap-status POST]", e);
    return err(500, "SITEMAP_REBUILD_ERROR", "Failed to rebuild sitemap");
  }
}
