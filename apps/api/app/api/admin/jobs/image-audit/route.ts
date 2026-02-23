import { NextResponse } from "next/server";
import { z } from "zod";
import { and, eq, sql } from "drizzle-orm";
import { requireAdmin } from "@/src/lib/auth/requireAdmin";
import { handleApiError } from "@/src/lib/errorHandler";
import { db } from "@/server/db/drizzle";
import { jobs } from "@/db/schema/job";
import { jobPhotos } from "@/db/schema/jobPhoto";
import { TradeCategorySchema } from "@8fold/shared";

const QuerySchema = z.object({
  mockOnly: z.coerce.boolean().optional(),
  includeArchived: z.coerce.boolean().optional(),
});

export async function GET(req: Request) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  try {
    const url = new URL(req.url);
    const parsed = QuerySchema.safeParse({
      mockOnly: url.searchParams.get("mockOnly") ?? undefined,
      includeArchived: url.searchParams.get("includeArchived") ?? undefined,
    });
    if (!parsed.success) return NextResponse.json({ ok: false, error: "invalid_query" }, { status: 400 });

    const mockOnly = parsed.data.mockOnly ?? true;
    const includeArchived = parsed.data.includeArchived ?? false;

    const tradeCats = TradeCategorySchema.options;

    const baseWhere: any[] = [];
    if (!includeArchived) baseWhere.push(eq(jobs.archived, false));
    if (mockOnly) {
      baseWhere.push(eq(jobs.is_mock, true));
    } else {
      baseWhere.push(eq(jobs.is_mock, false));
    }

    // Single grouped query (distinct jobs + distinct jobs with at least one image url).
    const grouped = await db
      .select({
        tradeCategory: jobs.trade_category,
        totalJobs: sql<number>`count(distinct ${jobs.id})::int`,
        withImage: sql<number>`count(distinct case when ${jobPhotos.url} is not null and ${jobPhotos.url} <> '' then ${jobs.id} end)::int`,
      })
      .from(jobs)
      .leftJoin(jobPhotos, eq(jobPhotos.jobId, jobs.id))
      .where(and(...baseWhere))
      .groupBy(jobs.trade_category);

    const groupedByTrade = new Map<string, { totalJobs: number; withImage: number }>();
    for (const r of grouped as any[]) {
      groupedByTrade.set(String(r.tradeCategory), {
        totalJobs: Number(r.totalJobs ?? 0),
        withImage: Number(r.withImage ?? 0),
      });
    }

    const byTrade = tradeCats.map((t) => {
      const g = groupedByTrade.get(t) ?? { totalJobs: 0, withImage: 0 };
      const totalJobs = g.totalJobs;
      const withImage = g.withImage;
      const coveragePct = totalJobs ? Math.round((withImage / totalJobs) * 1000) / 10 : 0;
      return {
        tradeCategory: t,
        totalJobs,
        withImage,
        missingImage: Math.max(0, totalJobs - withImage),
        coveragePct,
      };
    });

    const overallTotal = byTrade.reduce((a, b) => a + b.totalJobs, 0);
    const overallWith = byTrade.reduce((a, b) => a + b.withImage, 0);
    const overallCoveragePct = overallTotal ? Math.round((overallWith / overallTotal) * 1000) / 10 : 0;

    return NextResponse.json({
      ok: true,
      data: {
        scope: { mockOnly, includeArchived },
        overall: {
          totalJobs: overallTotal,
          withImage: overallWith,
          missingImage: Math.max(0, overallTotal - overallWith),
          coveragePct: overallCoveragePct,
          targetPct: 80,
        },
        byTrade,
      },
    });
  } catch (err) {
    return handleApiError(err, "GET /api/admin/jobs/image-audit", { userId: auth.userId });
  }
}

