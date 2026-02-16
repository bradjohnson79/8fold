import { NextResponse } from "next/server";
import { z } from "zod";
import { and, desc, eq, ilike, or } from "drizzle-orm";
import { requireAdmin } from "@/src/lib/auth/requireAdmin";
import { handleApiError } from "@/src/lib/errorHandler";
import { db } from "@/server/db/drizzle";
import { jobs } from "@/db/schema/job";
import { rewriteJobScope, scopeQualityScore } from "@/src/jobs/scopeHumanizer";

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
        tradeCategory: jobs.tradeCategory,
        createdAt: jobs.createdAt,
        archived: jobs.archived,
      })
      .from(jobs)
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(desc(jobs.createdAt))
      .limit(take);

    const items = rows
      .map((j: any) => {
        const scope = String(j.scope ?? "");
        const quality = scopeQualityScore(scope);
        const rewrite = rewriteJobScope({ id: j.id, scope, tradeCategory: j.tradeCategory, title: j.title });
        return {
          id: j.id,
          createdAt: (j.createdAt as any)?.toISOString?.() ?? String(j.createdAt),
          archived: Boolean(j.archived),
          tradeCategory: String(j.tradeCategory),
          title: j.title,
          scope,
          scopeQualityScore: quality.score,
          scopeQualityFlags: quality.flags,
          suggestedScope: rewrite.scope,
          wouldChange: rewrite.changed,
          rewriteReasons: rewrite.reasons,
        };
      })
      .filter((x) => (onlyFlagged ? x.scopeQualityFlags.length > 0 : true));

    return NextResponse.json({ ok: true, data: { items } });
  } catch (err) {
    return handleApiError(err, "GET /api/admin/jobs/scope-audit", { userId: auth.userId });
  }
}

