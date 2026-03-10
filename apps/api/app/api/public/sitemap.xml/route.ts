import { db } from "@/db/drizzle";
import { jobs } from "@/db/schema/job";
import { getSeoSettings } from "@/src/services/seo/seoSettingsService";
import { and, eq, inArray, isNull, isNotNull } from "drizzle-orm";

export const dynamic = "force-dynamic";

// Job statuses that represent publicly visible/active listings on the marketplace
const PUBLIC_JOB_STATUSES = ["PUBLISHED", "OPEN_FOR_ROUTING", "IN_PROGRESS"] as const;

function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "");
}

function xmlEscape(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function buildUrlset(urls: { loc: string; changefreq?: string; priority?: string }[]): string {
  const entries = urls
    .map(
      ({ loc, changefreq = "daily", priority = "0.7" }) =>
        `  <url>\n    <loc>${xmlEscape(loc)}</loc>\n    <changefreq>${changefreq}</changefreq>\n    <priority>${priority}</priority>\n  </url>`,
    )
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries}\n</urlset>`;
}

export async function GET() {
  const settings = await getSeoSettings();
  const domain = settings?.canonicalDomain ?? "8fold.app";
  const base = `https://${domain}`;

  // Query distinct location combos from publicly visible jobs only
  const rows = await db
    .selectDistinct({
      country_code: jobs.country_code,
      state_code: jobs.state_code,
      city: jobs.city,
      service_type: jobs.service_type,
    })
    .from(jobs)
    .where(
      and(
        inArray(jobs.status, [...PUBLIC_JOB_STATUSES]),
        isNull(jobs.archived_at),
        isNotNull(jobs.country_code),
        isNotNull(jobs.state_code),
      ),
    );

  const urlSet = new Set<string>();

  // Always include the root jobs directory
  urlSet.add(`${base}/jobs`);

  for (const row of rows) {
    if (!row.country_code || !row.state_code) continue;

    const country = row.country_code.toLowerCase();
    const state = row.state_code.toLowerCase();

    urlSet.add(`${base}/jobs/${country}`);
    urlSet.add(`${base}/jobs/${country}/${state}`);

    if (row.city) {
      const city = slugify(row.city);
      urlSet.add(`${base}/jobs/${country}/${state}/${city}`);

      if (row.service_type) {
        const service = row.service_type.toLowerCase().replace(/\s+/g, "-");
        urlSet.add(`${base}/jobs/${country}/${state}/${city}/${service}`);
      }
    }
  }

  const urls = Array.from(urlSet).map((loc) => ({
    loc,
    changefreq: loc === `${base}/jobs` ? "hourly" : "daily",
    priority: loc === `${base}/jobs` ? "1.0" : "0.7",
  }));

  const xml = buildUrlset(urls);

  return new Response(xml, {
    status: 200,
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, max-age=3600, stale-while-revalidate=600",
    },
  });
}
