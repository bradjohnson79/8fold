import { eq } from "drizzle-orm";
import { db } from "@/db/drizzle";
import { seoSitemapCache } from "@/db/schema/seoSitemapCache";
import { jobs } from "@/db/schema/job";
import { contractors } from "@/db/schema/contractor";
import { getSeoSettings } from "./seoSettingsService";
import { getCanonicalBase } from "./canonicalUrlService";

type SitemapType = "index" | "jobs" | "services" | "contractors" | "cities" | "service-locations";

const SITEMAP_TTL_MS = 60 * 60 * 1000; // 1 hour

function xmlHeader(): string {
  return '<?xml version="1.0" encoding="UTF-8"?>';
}

function urlsetOpen(): string {
  return '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">';
}

function sitemapIndexOpen(): string {
  return '<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">';
}

function urlEntry(loc: string, lastmod?: string, changefreq = "weekly", priority = "0.7"): string {
  return [
    "  <url>",
    `    <loc>${loc}</loc>`,
    lastmod ? `    <lastmod>${lastmod}</lastmod>` : "",
    `    <changefreq>${changefreq}</changefreq>`,
    `    <priority>${priority}</priority>`,
    "  </url>",
  ]
    .filter(Boolean)
    .join("\n");
}

function sitemapEntry(loc: string, lastmod?: string): string {
  return [
    "  <sitemap>",
    `    <loc>${loc}</loc>`,
    lastmod ? `    <lastmod>${lastmod}</lastmod>` : "",
    "  </sitemap>",
  ]
    .filter(Boolean)
    .join("\n");
}

export async function getCachedSitemap(type: SitemapType): Promise<string | null> {
  const rows = await db
    .select()
    .from(seoSitemapCache)
    .where(eq(seoSitemapCache.sitemapType, type))
    .limit(1);

  const cached = rows[0];
  if (!cached) return null;

  const age = Date.now() - cached.generatedAt.getTime();
  if (age > SITEMAP_TTL_MS) return null;

  return cached.xmlContent;
}

async function writeSitemapCache(type: SitemapType, xmlContent: string, urlCount: number): Promise<void> {
  await db
    .insert(seoSitemapCache)
    .values({
      id: crypto.randomUUID(),
      sitemapType: type,
      xmlContent,
      urlCount,
      generatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: seoSitemapCache.sitemapType,
      set: { xmlContent, urlCount, generatedAt: new Date() },
    });
}

export async function generateIndexSitemap(): Promise<string> {
  const base = await getCanonicalBase();
  const today = new Date().toISOString().split("T")[0];

  const types: SitemapType[] = ["jobs", "services", "contractors", "cities", "service-locations"];
  const entries = types.map((t) => sitemapEntry(`${base}/api/public/sitemap-${t}.xml`, today));

  const xml = [xmlHeader(), sitemapIndexOpen(), ...entries, "</sitemapindex>"].join("\n");
  await writeSitemapCache("index", xml, types.length);
  return xml;
}

export async function generateJobsSitemap(): Promise<string> {
  const base = await getCanonicalBase();

  const rows = await db
    .select({ id: jobs.id, updatedAt: jobs.updated_at })
    .from(jobs)
    .where(eq(jobs.archived, false))
    .limit(10000);

  const entries = rows.map((j) => {
    const lastmod = j.updatedAt instanceof Date ? j.updatedAt.toISOString().split("T")[0] : undefined;
    return urlEntry(`${base}/jobs/${j.id}`, lastmod, "daily", "0.8");
  });

  const xml = [xmlHeader(), urlsetOpen(), ...entries, "</urlset>"].join("\n");
  await writeSitemapCache("jobs", xml, rows.length);
  return xml;
}

export async function generateContractorsSitemap(): Promise<string> {
  const base = await getCanonicalBase();

  const rows = await db
    .select({ id: contractors.id, approvedAt: contractors.approvedAt })
    .from(contractors)
    .where(eq(contractors.status, "APPROVED"))
    .limit(10000);

  const entries = rows.map((c) => {
    const lastmod = c.approvedAt instanceof Date ? c.approvedAt.toISOString().split("T")[0] : undefined;
    return urlEntry(`${base}/contractors/${c.id}`, lastmod, "weekly", "0.6");
  });

  const xml = [xmlHeader(), urlsetOpen(), ...entries, "</urlset>"].join("\n");
  await writeSitemapCache("contractors", xml, rows.length);
  return xml;
}

export async function generateServicesSitemap(): Promise<string> {
  const base = await getCanonicalBase();

  const services = [
    "plumbing", "electrical", "hvac", "appliance", "handyman", "painting",
    "carpentry", "drywall", "roofing", "janitorial-cleaning", "landscaping",
    "fencing", "snow-removal", "junk-removal", "moving", "automotive",
    "furniture-assembly", "welding",
  ];

  const entries = services.map((s) =>
    urlEntry(`${base}/services/${s}`, undefined, "weekly", "0.7"),
  );

  const xml = [xmlHeader(), urlsetOpen(), ...entries, "</urlset>"].join("\n");
  await writeSitemapCache("services", xml, services.length);
  return xml;
}

export async function generateCitiesSitemap(): Promise<string> {
  const base = await getCanonicalBase();
  const { sql } = await import("drizzle-orm");

  const rows = await db
    .selectDistinct({ city: jobs.city, regionCode: jobs.region_code })
    .from(jobs)
    .where(sql`${jobs.city} is not null and ${jobs.archived} = false`)
    .limit(5000);

  const entries = rows
    .filter((r) => r.city)
    .map((r) => {
      const citySlug = (r.city ?? "").toLowerCase().replace(/\s+/g, "-");
      return urlEntry(`${base}/${citySlug}`, undefined, "weekly", "0.7");
    });

  const xml = [xmlHeader(), urlsetOpen(), ...entries, "</urlset>"].join("\n");
  await writeSitemapCache("cities", xml, entries.length);
  return xml;
}

const SERVICE_LOCATIONS_LIMIT = 10_000;

function slugCity(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/^-+|-+$/g, "");
}

export async function generateServiceLocationsSitemap(): Promise<string> {
  const base = await getCanonicalBase();
  const { sql } = await import("drizzle-orm");
  const { tradeCategoryToSlug: tcToSlug } = await import("@/src/utils/slug");

  const rows = await db
    .selectDistinct({
      country: jobs.country,
      regionCode: jobs.region_code,
      city: jobs.city,
      tradeCategory: jobs.trade_category,
    })
    .from(jobs)
    .where(
      sql`${jobs.archived} = false AND ${jobs.city} IS NOT NULL AND ${jobs.trade_category} IS NOT NULL AND ${jobs.region_code} IS NOT NULL`,
    )
    .limit(SERVICE_LOCATIONS_LIMIT + 1);

  const entries = rows.slice(0, SERVICE_LOCATIONS_LIMIT).map((r) => {
    const country = (r.country ?? "US").toString().toLowerCase();
    const regionCode = (r.regionCode ?? "").toString().toLowerCase();
    const citySlug = slugCity(r.city ?? "");
    const serviceSlug = r.tradeCategory ? tcToSlug(r.tradeCategory) : "handyman";
    return urlEntry(`${base}/jobs/${country}/${regionCode}/${citySlug}/${serviceSlug}`, undefined, "weekly", "0.7");
  });

  const xml = [xmlHeader(), urlsetOpen(), ...entries, "</urlset>"].join("\n");
  await writeSitemapCache("service-locations", xml, entries.length);
  return xml;
}

export async function getOrGenerateSitemap(type: SitemapType): Promise<string> {
  const cached = await getCachedSitemap(type);
  if (cached) return cached;

  switch (type) {
    case "index":
      return generateIndexSitemap();
    case "jobs":
      return generateJobsSitemap();
    case "contractors":
      return generateContractorsSitemap();
    case "services":
      return generateServicesSitemap();
    case "cities":
      return generateCitiesSitemap();
    case "service-locations":
      return generateServiceLocationsSitemap();
  }
}

export async function invalidateSitemapCache(type: SitemapType): Promise<void> {
  await db.delete(seoSitemapCache).where(eq(seoSitemapCache.sitemapType, type));
}
