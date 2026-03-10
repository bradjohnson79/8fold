/**
 * Internal endpoint: processes the seo_index_queue and submits URLs to IndexNow.
 * Called by Vercel Cron every 5 minutes (see vercel.json).
 * Protected by CRON_SECRET to prevent unauthorized access.
 */
import { isNull, inArray } from "drizzle-orm";
import { db } from "@/db/drizzle";
import { seoIndexQueue } from "@/db/schema/seoIndexQueue";
import { getSeoSettings } from "@/src/services/seo/seoSettingsService";
import { submitIndexNow } from "@/src/services/seo/indexNowService";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  // Validate Vercel Cron secret to prevent unauthenticated access
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const authHeader = req.headers.get("authorization");
    if (authHeader !== `Bearer ${cronSecret}`) {
      return new Response(JSON.stringify({ ok: false, error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }
  }

  const rows = await db
    .select()
    .from(seoIndexQueue)
    .where(isNull(seoIndexQueue.processedAt))
    .limit(50);

  if (!rows.length) {
    return Response.json({ ok: true, processed: 0 });
  }

  const settings = await getSeoSettings();
  const domain = settings?.canonicalDomain ?? "8fold.app";

  const absoluteUrls = rows.map((r) => `https://${domain}${r.url}`);
  await submitIndexNow(absoluteUrls);

  await db
    .update(seoIndexQueue)
    .set({ processedAt: new Date() })
    .where(inArray(seoIndexQueue.id, rows.map((r) => r.id)));

  console.log(`[SEO Cron] Processed ${rows.length} URL(s) from index queue`);
  return Response.json({ ok: true, processed: rows.length });
}
