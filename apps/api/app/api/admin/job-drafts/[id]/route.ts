import { NextResponse } from "next/server";
import { requireAdmin } from "@/src/lib/auth/requireAdmin";
import { handleApiError } from "@/src/lib/errorHandler";
import { JobDraftUpdateInputSchema, calculatePayoutBreakdown } from "@8fold/shared";
import crypto from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "../../../../../db/drizzle";
import { auditLogs } from "../../../../../db/schema/auditLog";
import { jobDrafts } from "../../../../../db/schema/jobDraft";
import { jobs } from "../../../../../db/schema/job";

function getIdFromUrl(req: Request): string {
  const url = new URL(req.url);
  const parts = url.pathname.split("/");
  return parts[parts.length - 1] ?? "";
}

export async function GET(req: Request) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  try {
    const id = getIdFromUrl(req);
    const rows = await db
      .select({ jobDraft: jobDrafts, publishedJob: jobs })
      .from(jobDrafts)
      .leftJoin(jobs, eq(jobs.id, jobDrafts.publishedJobId))
      .where(eq(jobDrafts.id, id))
      .limit(1);
    const row = rows[0] ?? null;
    if (!row?.jobDraft) {
      return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
    }
    return NextResponse.json({
      ok: true,
      data: {
        jobDraft: {
          ...(row.jobDraft as any),
          publishedJob: row.publishedJob?.id ? (row.publishedJob as any) : null,
        },
      },
    });
  } catch (err) {
    return handleApiError(err, "GET /api/admin/job-drafts/:id", { route: "/api/admin/job-drafts/[id]", userId: auth.userId });
  }
}

export async function PATCH(req: Request) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  try {
    const id = getIdFromUrl(req);
    const body = await req.json();
    const parsed = JobDraftUpdateInputSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { ok: false, error: "Invalid input", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const result = await db.transaction(async (tx: any) => {
      const existingRows = await tx.select().from(jobDrafts).where(eq(jobDrafts.id, id)).limit(1);
      const existing = existingRows[0] ?? null;
      if (!existing) return { kind: "not_found" as const };

      const { laborTotalCents, materialsTotalCents, ...rest } = parsed.data;

      // If either labor or materials is provided, we recalculate the whole breakdown
      const nextLabor = laborTotalCents !== undefined ? laborTotalCents : (existing as any).laborTotalCents;
      const nextMaterials =
        materialsTotalCents !== undefined ? materialsTotalCents : (existing as any).materialsTotalCents;
      const breakdown = calculatePayoutBreakdown(nextLabor, nextMaterials);

      const now = new Date();
      const updated = await tx
        .update(jobDrafts)
        .set({
          ...rest,
          laborTotalCents: breakdown.laborTotalCents,
          materialsTotalCents: breakdown.materialsTotalCents,
          transactionFeeCents: breakdown.transactionFeeCents,
          contractorPayoutCents: breakdown.contractorPayoutCents,
          routerEarningsCents: breakdown.routerEarningsCents,
          brokerFeeCents: breakdown.platformFeeCents,
          updatedAt: now,
        } as any)
        .where(eq(jobDrafts.id, id))
        .returning();
      const jobDraft = updated[0] as any;

      await tx.insert(auditLogs).values({
        id: crypto.randomUUID(),
        actorUserId: auth.userId,
        action: "JOB_DRAFT_UPDATE",
        entityType: "JobDraft",
        entityId: jobDraft.id,
        metadata: { updatedFields: Object.keys(parsed.data) } as any,
      });

      return { kind: "ok" as const, jobDraft };
    });

    if (result.kind === "not_found") return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
    return NextResponse.json({ ok: true, data: { jobDraft: result.jobDraft } });
  } catch (err) {
    return handleApiError(err, "PATCH /api/admin/job-drafts/:id", { route: "/api/admin/job-drafts/[id]", userId: auth.userId });
  }
}

