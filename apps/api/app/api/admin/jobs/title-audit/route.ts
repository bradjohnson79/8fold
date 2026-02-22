import { NextResponse } from "next/server";
import { z } from "zod";
import { and, desc, eq, ilike, or } from "drizzle-orm";
import { requireAdmin } from "@/src/lib/auth/requireAdmin";
import { handleApiError } from "@/src/lib/errorHandler";
import { db } from "@/db/drizzle";
import { jobs } from "@/db/schema/job";
import { rewriteJobTitle, titleQualityScore } from "@/src/jobs/titleHumanizer";

const QuerySchema = z.object({
  q: z.string().trim().max(120).optional(),
  onlyFlagged: z.coerce.boolean().optional(),
  take: z.coerce.number().int().min(1).max(500).optional(),
  includeArchived: z.coerce.boolean().optional(),
});

export async function GET(req: Request) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  try {
    const url = new URL(req.url);
    const parsed = QuerySchema.safeParse({
      q: url.searchParams.get("q") ?? undefined,
      onlyFlagged: url.searchParams.get("onlyFlagged") ?? undefined,
      take: url.searchParams.get("take") ?? undefined,
      includeArchived: url.searchParams.get("includeArchived") ?? undefined,
    });
    if (!parsed.success) return NextResponse.json({ ok: false, error: "invalid_query" }, { status: 400 });

    const take = parsed.data.take ?? 200;
    const q = (parsed.data.q ?? "").trim();
    const onlyFlagged = parsed.data.onlyFlagged ?? true;
    const includeArchived = parsed.data.includeArchived ?? false;

    const conditions: any[] = [];
    if (!includeArchived) conditions.push(eq(jobs.archived, false));
    if (q) {
      const pat = `%${q}%`;
      conditions.push(or(eq(jobs.id, q), ilike(jobs.title, pat), ilike(jobs.scope, pat)) as any);
    }

    const rows = await db
      .select({
        id: jobs.id,
        title: jobs.title,
        scope: jobs.scope,
        tradeCategory: jobs.trade_category,
        junkHaulingItems: jobs.junk_hauling_items,
        createdAt: jobs.created_at,
        archived: jobs.archived,
      })
      .from(jobs)
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(desc(jobs.created_at))
      .limit(take);

    const items = rows
      .map((j: any) => {
        const quality = titleQualityScore(j.title);
        const rewrite = rewriteJobTitle({
          id: j.id,
          title: j.title,
          scope: j.scope,
          tradeCategory: j.tradeCategory,
          junkHaulingItems: j.junkHaulingItems,
        });
        return {
          id: j.id,
          createdAt: (j.createdAt as any)?.toISOString?.() ?? String(j.createdAt),
          archived: Boolean(j.archived),
          tradeCategory: String(j.tradeCategory),
          title: j.title,
          titleQualityScore: quality.score,
          titleQualityFlags: quality.flags,
          suggestedTitle: rewrite.title,
          wouldChange: rewrite.changed,
          rewriteReasons: rewrite.reasons,
          suggestedFrom: rewrite.suggestedFrom ?? null,
        };
      })
      .filter((x) => (onlyFlagged ? x.titleQualityFlags.length > 0 : true));

    return NextResponse.json({ ok: true, data: { items } });
  } catch (err) {
    return handleApiError(err, "GET /api/admin/jobs/title-audit", { userId: auth.userId });
  }
}

