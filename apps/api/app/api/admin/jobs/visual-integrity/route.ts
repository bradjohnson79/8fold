import { NextResponse } from "next/server";
import { z } from "zod";
import { and, eq, lt, or, sql } from "drizzle-orm";
import { requireAdmin } from "@/src/lib/auth/requireAdmin";
import { handleApiError } from "@/src/lib/errorHandler";
import { db } from "@/db/drizzle";
import { jobs } from "@/db/schema/job";
import { jobPhotos } from "@/db/schema/jobPhoto";
import { titleQualityScore } from "@/src/jobs/titleHumanizer";

const QuerySchema = z.object({
  ageDays: z.coerce.number().int().min(1).max(365).optional(),
  includeArchived: z.coerce.boolean().optional(),
});

export async function GET(req: Request) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  try {
    const url = new URL(req.url);
    const parsed = QuerySchema.safeParse({
      ageDays: url.searchParams.get("ageDays") ?? undefined,
      includeArchived: url.searchParams.get("includeArchived") ?? undefined,
    });
    if (!parsed.success) return NextResponse.json({ ok: false, error: "invalid_query" }, { status: 400 });

    const ageDays = parsed.data.ageDays ?? 14;
    const includeArchived = parsed.data.includeArchived ?? false;
    const cutoff = new Date(Date.now() - ageDays * 24 * 60 * 60 * 1000);

    const base: any[] = [eq(jobs.isMock, false)];
    if (!includeArchived) base.push(eq(jobs.archived, false));
    const baseWhere = base.length ? and(...base) : undefined;

    const [totalRes, olderRes, unroutedRes, missingScopeRes, missingTradeRes, withImagesRes, titlesRes] = await Promise.all([
      db.select({ c: sql<number>`count(*)` }).from(jobs).where(baseWhere),
      db
        .select({ c: sql<number>`count(*)` })
        .from(jobs)
        .where(and(baseWhere, eq(jobs.status, "PUBLISHED"), lt(jobs.publishedAt, cutoff))),
      db
        .select({ c: sql<number>`count(*)` })
        .from(jobs)
        .where(and(baseWhere, eq(jobs.status, "PUBLISHED"), eq(jobs.routingStatus, "UNROUTED"))),
      db
        .select({ c: sql<number>`count(*)` })
        .from(jobs)
        .where(and(baseWhere, or(sql`length(trim(${jobs.scope})) = 0`, sql`${jobs.scope} is null`) as any)),
      db
        .select({ c: sql<number>`count(*)` })
        .from(jobs)
        .where(and(baseWhere, or(sql`${jobs.tradeCategory} is null`, sql`length(trim(${jobs.tradeCategory})) = 0`) as any)),
      db
        .select({ c: sql<number>`count(distinct ${jobPhotos.jobId})` })
        .from(jobPhotos)
        .innerJoin(jobs, eq(jobs.id, jobPhotos.jobId))
        .where(and(baseWhere, sql`${jobPhotos.url} is not null`, sql`length(trim(${jobPhotos.url})) > 0`) as any),
      // Title “humanized” percent computed via the deterministic JS scorer; if huge, we sample.
      db.select({ title: jobs.title }).from(jobs).where(baseWhere).limit(10000),
    ]);

    const total = Number((totalRes as any)?.[0]?.c ?? 0);
    const jobsOlderThanXDays = Number((olderRes as any)?.[0]?.c ?? 0);
    const unroutedJobs = Number((unroutedRes as any)?.[0]?.c ?? 0);
    const jobsMissingDescription = Number((missingScopeRes as any)?.[0]?.c ?? 0);
    const jobsMissingTrade = Number((missingTradeRes as any)?.[0]?.c ?? 0);
    const withImages = Number((withImagesRes as any)?.[0]?.c ?? 0);

    const titles = (titlesRes as any[]).map((r) => String(r.title ?? ""));
    let humanizedTitles = 0;
    for (const t of titles) {
      const q = titleQualityScore(t);
      if (q.score >= 85 && q.flags.length === 0) humanizedTitles++;
    }
    const titleSampleSize = titles.length;
    const titleSampled = total > titleSampleSize;

    const pct = (num: number, denom: number) => (denom <= 0 ? 0 : Math.round((num / denom) * 1000) / 10); // 0.1%

    return NextResponse.json({
      ok: true,
      data: {
        totalJobs: total,
        images: { withImages, pctWithImages: pct(withImages, total) },
        titles: {
          humanized: humanizedTitles,
          pctHumanized: pct(humanizedTitles, titleSampleSize || total || 1),
          sampleSize: titleSampleSize,
          sampled: titleSampled,
          threshold: { scoreGte: 85, flagsMustBeEmpty: true },
        },
        jobsOlderThanXDays: { ageDays, count: jobsOlderThanXDays },
        unroutedJobs,
        jobsMissingDescription,
        jobsMissingTrade,
      },
    });
  } catch (err) {
    return handleApiError(err, "GET /api/admin/jobs/visual-integrity", { userId: auth.userId });
  }
}

