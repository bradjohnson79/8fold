import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { requireAdminV4 } from "@/src/auth/requireAdminV4";
import { ok, err } from "@/src/lib/api/adminV4Response";
import { db } from "@/db/drizzle";
import { seoPageGenerationQueue } from "@/db/schema/seoPageGenerationQueue";

export async function GET(req: Request) {
  const authed = await requireAdminV4(req);
  if (authed instanceof Response) return authed;

  try {
    const url = new URL(req.url);
    const statusFilter = url.searchParams.get("status");
    const limitParam = url.searchParams.get("limit");
    const limit = Math.min(200, Math.max(1, limitParam ? Number(limitParam) : 50));

    const query = db
      .select()
      .from(seoPageGenerationQueue)
      .orderBy(desc(seoPageGenerationQueue.createdAt))
      .limit(isNaN(limit) ? 50 : limit);

    const rows = statusFilter
      ? await db
          .select()
          .from(seoPageGenerationQueue)
          .where(eq(seoPageGenerationQueue.status, statusFilter))
          .orderBy(desc(seoPageGenerationQueue.createdAt))
          .limit(isNaN(limit) ? 50 : limit)
      : await query;

    return ok({ queue: rows, total: rows.length });
  } catch (e) {
    console.error("[seo/local-seo/queue GET]", e);
    return err(500, "LOCAL_SEO_QUEUE_ERROR", "Failed to load page generation queue");
  }
}
