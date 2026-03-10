import { and, gte, sql } from "drizzle-orm";
import { requireAdminV4 } from "@/src/auth/requireAdminV4";
import { ok, err } from "@/src/lib/api/adminV4Response";
import { db } from "@/db/drizzle";
import { jobs } from "@/db/schema/job";
import { contractors } from "@/db/schema/contractor";
import { seoIndexingLog } from "@/db/schema/seoIndexingLog";
import { getSeoSettings } from "@/src/services/v4/seo/seoSettingsService";

export async function GET(req: Request) {
  const authed = await requireAdminV4(req);
  if (authed instanceof Response) return authed;

  try {
    const cutoff24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const cutoff7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const [
      jobsToday,
      contractorsTotal,
      indexingToday,
      indexingErrors7d,
      settings,
    ] = await Promise.all([
      db
        .select({ c: sql<number>`count(*)` })
        .from(jobs)
        .where(and(gte(jobs.created_at, cutoff24h), sql`${jobs.archived} = false`))
        .then((r) => Number(r[0]?.c ?? 0)),

      db
        .select({ c: sql<number>`count(*)` })
        .from(contractors)
        .where(sql`${contractors.status} = 'APPROVED'`)
        .then((r) => Number(r[0]?.c ?? 0)),

      db
        .select({ c: sql<number>`count(*)` })
        .from(seoIndexingLog)
        .where(gte(seoIndexingLog.createdAt, cutoff24h))
        .then((r) => Number(r[0]?.c ?? 0)),

      db
        .select({ c: sql<number>`count(*)` })
        .from(seoIndexingLog)
        .where(and(
          gte(seoIndexingLog.createdAt, cutoff7d),
          sql`${seoIndexingLog.status} = 'error'`,
        ))
        .then((r) => Number(r[0]?.c ?? 0)),

      getSeoSettings(),
    ]);

    return ok({
      analytics: {
        jobsCreatedToday: jobsToday,
        contractorsActive: contractorsTotal,
        indexingPingsToday: indexingToday,
        indexingErrors7d,
        integrations: {
          ga4Configured: Boolean(settings?.ga4MeasurementId),
          metaPixelConfigured: Boolean(settings?.metaPixelId),
          indexNowConfigured: Boolean(settings?.indexNowKey || process.env.INDEX_NOW_KEY),
          googleIndexingConfigured: Boolean(process.env.GOOGLE_INDEXING_SERVICE_ACCOUNT_JSON),
        },
      },
    });
  } catch (e) {
    console.error("[seo/analytics GET]", e);
    return err(500, "SEO_ANALYTICS_ERROR", "Failed to load SEO analytics");
  }
}
