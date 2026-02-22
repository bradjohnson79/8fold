import { NextResponse } from "next/server";
import { z } from "zod";
import crypto from "node:crypto";
import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";
import { requireAdmin } from "@/src/lib/auth/requireAdmin";
import { handleApiError } from "@/src/lib/errorHandler";
import { db } from "@/server/db/drizzle";
import { auditLogs } from "@/db/schema/auditLog";
import { jobs } from "@/db/schema/job";
import { jobPhotos } from "@/db/schema/jobPhoto";
import { MOCK_JOB_IMAGES, TradeCategorySchema, type TradeCategory } from "@8fold/shared";
import { readJsonBody } from "@/src/lib/api/readJsonBody";

const BodySchema = z.object({
  mockOnly: z.boolean().optional(),
  includeArchived: z.boolean().optional(),
  dryRun: z.boolean().optional(),
  take: z.number().int().min(1).max(2000).optional(),
});

type PlanRow = {
  jobId: string;
  tradeCategory: TradeCategory;
  url: string;
  imageIndex: number;
};

function pickRotating(pool: string[], idx: number): { url: string; imageIndex: number } {
  const n = pool.length;
  const i = n ? idx % n : 0;
  return { url: pool[i] ?? "/images/jobs/carpentry/carpentry1.png", imageIndex: i };
}

export async function POST(req: Request) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  try {
    const j = await readJsonBody(req);
    if (!j.ok) return j.resp;
    const body = BodySchema.safeParse(j.json);
    if (!body.success) return NextResponse.json({ ok: false, error: "invalid_input" }, { status: 400 });

    const mockOnly = body.data.mockOnly ?? true;
    const includeArchived = body.data.includeArchived ?? false;
    const dryRun = body.data.dryRun ?? false;
    const take = body.data.take ?? 1000;

    // Find jobs in scope that have zero photos (any kind) OR only photos with null/empty url.
    // We treat "has image" as: exists JobPhoto with non-empty url.
    const baseWhere: any[] = [];
    if (!includeArchived) baseWhere.push(eq(jobs.archived, false));
    if (mockOnly) baseWhere.push(eq(jobs.is_mock, true));
    else baseWhere.push(eq(jobs.is_mock, false));

    // Identify candidates via grouped join.
    const candidates = await db
      .select({
        id: jobs.id,
        tradeCategory: jobs.trade_category,
        createdAt: jobs.created_at,
        hasImage: sql<number>`max(case when ${jobPhotos.url} is not null and ${jobPhotos.url} <> '' then 1 else 0 end)::int`,
      })
      .from(jobs)
      .leftJoin(jobPhotos, eq(jobPhotos.jobId, jobs.id))
      .where(and(...baseWhere))
      .groupBy(jobs.id, jobs.trade_category, jobs.created_at)
      .orderBy(asc(jobs.created_at), asc(jobs.id))
      .limit(take);

    const needs = candidates.filter((c: any) => Number(c.hasImage ?? 0) === 0) as Array<{
      id: string;
      tradeCategory: TradeCategory;
    }>;

    // Plan: per trade, rotate evenly through that trade’s image pool (no repeats until exhausted).
    const byTrade = new Map<TradeCategory, string[]>();
    for (const t of TradeCategorySchema.options) {
      byTrade.set(t as TradeCategory, MOCK_JOB_IMAGES[t as TradeCategory] ?? []);
    }

    const counter = new Map<TradeCategory, number>();
    const plan: PlanRow[] = [];
    for (const c of needs) {
      const trade = c.tradeCategory as TradeCategory;
      const pool = byTrade.get(trade) ?? [];
      const idx = counter.get(trade) ?? 0;
      const picked = pickRotating(pool, idx);
      counter.set(trade, idx + 1);
      plan.push({ jobId: c.id, tradeCategory: trade, url: picked.url, imageIndex: picked.imageIndex });
    }

    if (dryRun) {
      return NextResponse.json({
        ok: true,
        data: {
          dryRun: true,
          scope: { mockOnly, includeArchived },
          scanned: candidates.length,
          missingImage: needs.length,
          wouldAssign: plan.length,
          sample: plan.slice(0, 50),
        },
      });
    }

    // Apply: insert a TRADE_STOCK JobPhoto for each job (idempotent: re-check no image inside tx).
    const result = await db.transaction(async (tx: any) => {
      let inserted = 0;
      for (const p of plan) {
        const existing = await tx
          .select({ id: jobPhotos.id })
          .from(jobPhotos)
          .where(and(eq(jobPhotos.jobId, p.jobId), sql`${jobPhotos.url} is not null`, sql`${jobPhotos.url} <> ''`))
          .limit(1);
        if (existing[0]?.id) continue;

        await tx.insert(jobPhotos).values({
          id: crypto.randomUUID(),
          jobId: p.jobId,
          kind: "TRADE_STOCK",
          actor: null,
          url: p.url,
          storageKey: null,
          metadata: { tradeCategory: p.tradeCategory, imageIndex: p.imageIndex } as any,
          createdAt: new Date(),
        } as any);
        inserted++;

        await tx.insert(auditLogs).values({
          id: crypto.randomUUID(),
          actorUserId: auth.userId,
          action: "JOB_IMAGE_ASSIGNED_TRADE_STOCK",
          entityType: "Job",
          entityId: p.jobId,
          metadata: { url: p.url, tradeCategory: p.tradeCategory, imageIndex: p.imageIndex } as any,
        });
      }
      return { inserted };
    });

    return NextResponse.json({
      ok: true,
      data: {
        scope: { mockOnly, includeArchived },
        inserted: result.inserted,
        attempted: plan.length,
      },
    });
  } catch (err) {
    return handleApiError(err, "POST /api/admin/jobs/image-audit/assign", { userId: auth.userId });
  }
}

