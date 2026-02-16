import { NextResponse } from "next/server";
import { z } from "zod";
import crypto from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";
import { requireAdmin } from "@/src/lib/auth/requireAdmin";
import { handleApiError } from "@/src/lib/errorHandler";
import { db } from "@/db/drizzle";
import { auditLogs } from "@/db/schema/auditLog";
import { jobs } from "@/db/schema/job";
import { rewriteJobScope, scopeQualityScore } from "@/src/jobs/scopeHumanizer";
import { readJsonBody } from "@/src/lib/api/readJsonBody";

const BodySchema = z.object({
  jobIds: z.array(z.string().trim().min(1)).max(500).optional(),
  onlyFlagged: z.boolean().optional(),
  includeArchived: z.boolean().optional(),
  dryRun: z.boolean().optional(),
});

export async function POST(req: Request) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  try {
    const j = await readJsonBody(req);
    if (!j.ok) return j.resp;
    const body = BodySchema.safeParse(j.json);
    if (!body.success) return NextResponse.json({ ok: false, error: "invalid_input" }, { status: 400 });

    const onlyFlagged = body.data.onlyFlagged ?? true;
    const includeArchived = body.data.includeArchived ?? false;
    const dryRun = body.data.dryRun ?? false;

    const conditions: any[] = [];
    if (!includeArchived) conditions.push(eq(jobs.archived, false));
    if (body.data.jobIds?.length) conditions.push(inArray(jobs.id, body.data.jobIds));

    const rows = await db
      .select({
        id: jobs.id,
        title: jobs.title,
        scope: jobs.scope,
        tradeCategory: jobs.tradeCategory,
        archived: jobs.archived,
      })
      .from(jobs)
      .where(conditions.length ? and(...conditions) : undefined)
      .limit(500);

    const plan = rows
      .map((r: any) => {
        const beforeScope = String(r.scope ?? "");
        const beforeQ = scopeQualityScore(beforeScope);
        const rewrite = rewriteJobScope({
          id: r.id,
          scope: beforeScope,
          tradeCategory: r.tradeCategory,
          title: r.title,
        });
        return {
          id: r.id,
          archived: Boolean(r.archived),
          from: beforeScope,
          to: rewrite.scope,
          wouldChange: rewrite.changed,
          flags: beforeQ.flags,
          scoreBefore: beforeQ.score,
          scoreAfter: rewrite.qualityAfter.score,
          reasons: rewrite.reasons,
        };
      })
      .filter((p) => (onlyFlagged ? p.flags.length > 0 : true))
      .filter((p) => p.wouldChange);

    if (dryRun) {
      return NextResponse.json({ ok: true, data: { dryRun: true, count: plan.length, plan: plan.slice(0, 200) } });
    }

    const result = await db.transaction(async (tx: any) => {
      let updated = 0;
      const updatedIds: string[] = [];
      const now = new Date();

      for (const p of plan) {
        const existing = await tx.select({ scope: jobs.scope }).from(jobs).where(eq(jobs.id, p.id)).limit(1);
        const cur = existing[0]?.scope ?? null;
        if (String(cur ?? "") !== String(p.from ?? "")) {
          // Someone changed it; skip (idempotent safety).
          continue;
        }

        await tx.update(jobs).set({ scope: p.to, updatedAt: now } as any).where(eq(jobs.id, p.id));
        updated++;
        updatedIds.push(p.id);

        await tx.insert(auditLogs).values({
          id: crypto.randomUUID(),
          actorUserId: auth.userId,
          action: "ADMIN_DESCRIPTION_REWRITE",
          entityType: "Job",
          entityId: p.id,
          metadata: {
            from: p.from,
            to: p.to,
            flags: p.flags,
            scoreBefore: p.scoreBefore,
            scoreAfter: p.scoreAfter,
            reasons: p.reasons,
            note: "ADMIN_DESCRIPTION_REWRITE",
          } as any,
        });
      }

      return { updated, updatedIds };
    });

    return NextResponse.json({ ok: true, data: { updated: result.updated, updatedIds: result.updatedIds } });
  } catch (err) {
    return handleApiError(err, "POST /api/admin/jobs/scope-audit/rewrite", { userId: auth.userId });
  }
}

