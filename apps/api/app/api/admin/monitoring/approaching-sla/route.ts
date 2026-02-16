import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/src/lib/auth/requireAdmin";
import { handleApiError } from "@/src/lib/errorHandler";
import { runMonitoringEvaluation } from "../../../../../src/services/monitoringService";
import { and, desc, eq, ilike, or, sql } from "drizzle-orm";
import { db } from "../../../../../db/drizzle";
import { jobs } from "../../../../../db/schema/job";
import { monitoringEvents } from "../../../../../db/schema/monitoringEvent";

const QuerySchema = z.object({
  cursor: z.string().trim().min(1).optional(),
  country: z.enum(["US", "CA"]).optional(),
  region: z.string().trim().min(1).optional(),
  tradeCategory: z.string().trim().min(1).optional()
});

function isTwoLetterRegion(s: string): boolean {
  return /^[A-Za-z]{2}$/.test(s.trim());
}

export async function GET(req: Request) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  try {

    // Ensure events are emitted (idempotent, append-only). Scheduler wiring comes later.
    await runMonitoringEvaluation();

    const url = new URL(req.url);
    const parsed = QuerySchema.safeParse({
      cursor: url.searchParams.get("cursor") ?? undefined,
      country: url.searchParams.get("country") ?? undefined,
      region: url.searchParams.get("region") ?? undefined,
      tradeCategory: url.searchParams.get("tradeCategory") ?? undefined
    });
    if (!parsed.success) return NextResponse.json({ ok: false, error: "invalid_query" }, { status: 400 });

    const { cursor, country, region, tradeCategory } = parsed.data;
    const regionUpper = region ? region.trim().toUpperCase() : null;
    const regionIsCode = regionUpper ? isTwoLetterRegion(regionUpper) : false;

    const take = 50;
    let cursorCreatedAt: Date | null = null;
    if (cursor) {
      const cur = await db
        .select({ createdAt: monitoringEvents.createdAt })
        .from(monitoringEvents)
        .where(eq(monitoringEvents.id, cursor as any))
        .limit(1);
      cursorCreatedAt = cur[0]?.createdAt ?? null;
    }

    const where = and(
      eq(monitoringEvents.type, "JOB_APPROACHING_24H"),
      ...(country ? ([eq(jobs.country, country as any)] as any[]) : ([] as any[])),
      ...(tradeCategory ? ([eq(jobs.tradeCategory, tradeCategory as any)] as any[]) : ([] as any[])),
      ...(regionUpper
        ? ([
            regionIsCode
              ? or(eq(jobs.regionCode, regionUpper), ilike(jobs.region, `%${regionUpper.toLowerCase()}%`))
              : ilike(jobs.region, `%${regionUpper.toLowerCase()}%`),
          ] as any[])
        : ([] as any[])),
      ...(cursor && cursorCreatedAt
        ? ([
            or(
              sql`${monitoringEvents.createdAt} < ${cursorCreatedAt}`,
              and(sql`${monitoringEvents.createdAt} = ${cursorCreatedAt}`, sql`${monitoringEvents.id}::text < ${cursor}`),
            ),
          ] as any[])
        : ([] as any[])),
    );

    const rows = await db
      .select({
        id: monitoringEvents.id,
        type: monitoringEvents.type,
        role: monitoringEvents.role,
        userId: monitoringEvents.userId,
        createdAt: monitoringEvents.createdAt,
        handledAt: monitoringEvents.handledAt,
        job: {
          id: jobs.id,
          title: jobs.title,
          status: jobs.status,
          country: jobs.country,
          region: jobs.region,
          regionCode: jobs.regionCode,
          tradeCategory: jobs.tradeCategory,
          postedAt: jobs.postedAt,
          routingDueAt: jobs.routingDueAt,
          routingStatus: jobs.routingStatus,
          firstRoutedAt: jobs.firstRoutedAt,
        },
      })
      .from(monitoringEvents)
      .innerJoin(jobs, eq(jobs.id, monitoringEvents.jobId))
      .where(where)
      .orderBy(desc(monitoringEvents.createdAt), desc(monitoringEvents.id))
      .limit(take + 1);

    const page = rows.slice(0, take);
    const nextCursor = rows.length > take ? (rows[take]?.id as any) ?? null : null;

    return NextResponse.json({
      ok: true,
      data: {
        events: page.map((e: any) => ({
        ...e,
        id: String(e.id),
        createdAt: (e.createdAt as any)?.toISOString?.() ?? String(e.createdAt),
        handledAt: (e.handledAt as any)?.toISOString?.() ?? null,
        job: {
          ...e.job,
          postedAt: (e.job.postedAt as any)?.toISOString?.() ?? String(e.job.postedAt),
          routingDueAt: (e.job.routingDueAt as any)?.toISOString?.() ?? null,
          firstRoutedAt: (e.job.firstRoutedAt as any)?.toISOString?.() ?? null,
        },
      })),
        nextCursor,
      },
    });
  } catch (err) {
    return handleApiError(err, "GET /api/admin/monitoring/approaching-sla", { userId: auth.userId });
  }
}

