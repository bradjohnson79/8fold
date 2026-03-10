import { db } from "@/db/drizzle";
import { seoIndexQueue } from "@/db/schema/seoIndexQueue";

type IndexAction = "CREATE" | "UPDATE" | "DELETE";

/**
 * Converts a city name to a URL-safe slug.
 * "Fort Langley" → "fort-langley"
 */
function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "");
}

/**
 * Enqueues the URL hierarchy for a job into seo_index_queue.
 *
 * URL structure derived from job location fields:
 *   /jobs
 *   /jobs/{country_code}
 *   /jobs/{country_code}/{state_code}
 *   /jobs/{country_code}/{state_code}/{city}          (if city present)
 *   /jobs/{country_code}/{state_code}/{city}/{service} (if city present)
 *
 * Only enqueues paths for pages that actually exist in the web app.
 * The partial unique index on (url, action) WHERE processed_at IS NULL
 * silently deduplicates repeated events via ON CONFLICT DO NOTHING.
 */
export async function enqueueJobIndexing(
  job: {
    country_code?: string | null;
    state_code?: string | null;
    city?: string | null;
    service_type?: string | null;
  },
  action: IndexAction,
): Promise<void> {
  const country = job.country_code?.trim().toLowerCase();
  const state = job.state_code?.trim().toLowerCase();

  if (!country || !state) return; // Skip jobs with incomplete location data

  const urls: string[] = ["/jobs", `/jobs/${country}`, `/jobs/${country}/${state}`];

  if (job.city?.trim()) {
    const city = slugify(job.city);
    urls.push(`/jobs/${country}/${state}/${city}`);

    if (job.service_type?.trim()) {
      const service = job.service_type.trim().toLowerCase().replace(/\s+/g, "-");
      urls.push(`/jobs/${country}/${state}/${city}/${service}`);
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
