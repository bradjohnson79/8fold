import { db } from "@/db/drizzle";
import { seoIndexQueue } from "@/db/schema/seoIndexQueue";
import { slugify, tradeCategoryToSlug } from "@/src/utils/slug";

type IndexAction = "CREATE" | "UPDATE" | "DELETE";

/**
 * Enqueues the URL hierarchy for a job into seo_index_queue.
 *
 * URL structure derived from job location fields (uses region_code for consistency with routes):
 *   /jobs
 *   /jobs/{country_code}
 *   /jobs/{country_code}/{region_code}
 *   /jobs/{country_code}/{region_code}/{city}          (if city present)
 *   /jobs/{country_code}/{region_code}/{city}/{service} (if city + trade_category present)
 *
 * Only enqueues paths for pages that actually exist in the web app.
 * The partial unique index on (url, action) WHERE processed_at IS NULL
 * silently deduplicates repeated events via ON CONFLICT DO NOTHING.
 */
export async function enqueueJobIndexing(
  job: {
    country_code?: string | null;
    state_code?: string | null;
    region_code?: string | null;
    city?: string | null;
    service_type?: string | null;
    trade_category?: string | null;
  },
  action: IndexAction,
): Promise<void> {
  const country = job.country_code?.trim().toLowerCase();
  const region = (job.region_code ?? job.state_code)?.trim().toLowerCase();

  if (!country || !region) return; // Skip jobs with incomplete location data

  const urls: string[] = ["/jobs", `/jobs/${country}`, `/jobs/${country}/${region}`];

  if (job.city?.trim()) {
    const citySlug = slugify(job.city);
    urls.push(`/jobs/${country}/${region}/${citySlug}`);

    const serviceSlug = job.trade_category?.trim()
      ? tradeCategoryToSlug(job.trade_category)
      : job.service_type?.trim()
        ? job.service_type.trim().toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "")
        : null;

    if (serviceSlug) {
      urls.push(`/jobs/${country}/${region}/${citySlug}/${serviceSlug}`);
    }
  }

  try {
    await db
      .insert(seoIndexQueue)
      .values(urls.map((url) => ({ url, action })))
      .onConflictDoNothing();
  } catch (error) {
    console.error("[SEO] Failed to enqueue indexing URLs:", error);
  }
}
