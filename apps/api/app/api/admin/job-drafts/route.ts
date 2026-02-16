import { NextResponse } from "next/server";
import { requireAdmin } from "@/src/lib/auth/requireAdmin";
import { handleApiError } from "@/src/lib/errorHandler";
import { JobDraftCreateInputSchema, JobDraftListQuerySchema, calculatePayoutBreakdown } from "@8fold/shared";
import crypto from "node:crypto";
import { and, desc, eq, ilike, or } from "drizzle-orm";
import { db } from "@/server/db/drizzle";
import { auditLogs } from "../../../../db/schema/auditLog";
import { jobDrafts } from "../../../../db/schema/jobDraft";
import { jobs } from "../../../../db/schema/job";

export async function GET(req: Request) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  try {
    const url = new URL(req.url);
    const parsed = JobDraftListQuerySchema.safeParse({
      status: url.searchParams.get("status") ?? undefined,
      q: url.searchParams.get("q") ?? undefined
    });
    if (!parsed.success) {
      return NextResponse.json({ ok: false, error: "Invalid query" }, { status: 400 });
    }

    const { status, q } = parsed.data;
    const where = and(
      ...(status ? ([eq(jobDrafts.status, status as any)] as any[]) : ([] as any[])),
      ...(q
        ? ([
            or(
              ilike(jobDrafts.title, `%${q}%`),
              ilike(jobDrafts.scope, `%${q}%`),
              ilike(jobDrafts.region, `%${q}%`),
              ilike(jobDrafts.serviceType, `%${q}%`),
            ),
          ] as any[])
        : ([] as any[])),
    );

    const rows = await db
      .select({
        jobDraft: jobDrafts,
        publishedJob: jobs,
      })
      .from(jobDrafts)
      .leftJoin(jobs, eq(jobs.id, jobDrafts.publishedJobId))
      .where(where)
      .orderBy(desc(jobDrafts.createdAt))
      .limit(250);

    const jobDraftsOut = rows.map((r: any) => ({
      ...(r.jobDraft as any),
      publishedJob: r.publishedJob?.id ? (r.publishedJob as any) : null,
    }));

    return NextResponse.json({ ok: true, data: { jobDrafts: jobDraftsOut } });
  } catch (err) {
    return handleApiError(err, "GET /api/admin/job-drafts", { route: "/api/admin/job-drafts", userId: auth.userId });
  }
}

export async function POST(req: Request) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  try {
    const body = await req.json();
    const parsed = JobDraftCreateInputSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { ok: false, error: "Invalid input", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { laborTotalCents, materialsTotalCents, ...rest } = parsed.data;
    const breakdown = calculatePayoutBreakdown(laborTotalCents, materialsTotalCents);

    const now = new Date();
    const jobDraft = await db.transaction(async (tx: any) => {
      const created = await tx
        .insert(jobDrafts)
        .values({
          id: crypto.randomUUID(),
          status: "DRAFT",
          ...rest,
          laborTotalCents: breakdown.laborTotalCents,
          materialsTotalCents: breakdown.materialsTotalCents,
          transactionFeeCents: breakdown.transactionFeeCents,
          contractorPayoutCents: breakdown.contractorPayoutCents,
          routerEarningsCents: breakdown.routerEarningsCents,
          brokerFeeCents: breakdown.platformFeeCents,
          createdByAdminUserId: auth.userId,
          updatedAt: now,
        } as any)
        .returning();
      const row = created[0] as any;

      await tx.insert(auditLogs).values({
        id: crypto.randomUUID(),
        actorUserId: auth.userId,
        action: "JOB_DRAFT_CREATE",
        entityType: "JobDraft",
        entityId: row.id,
        metadata: {
          status: row.status,
          title: row.title,
          region: row.region,
          serviceType: row.serviceType,
          laborTotalCents: row.laborTotalCents,
          contractorPayoutCents: row.contractorPayoutCents,
          routerEarningsCents: row.routerEarningsCents,
          brokerFeeCents: row.brokerFeeCents,
          transactionFeeCents: row.transactionFeeCents,
        } as any,
      });

      return row;
    });

    return NextResponse.json({ ok: true, data: { jobDraft } }, { status: 201 });
  } catch (err) {
    return handleApiError(err, "POST /api/admin/job-drafts", { route: "/api/admin/job-drafts", userId: auth.userId });
  }
}

