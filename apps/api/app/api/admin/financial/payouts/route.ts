import { NextResponse } from "next/server";
import { and, desc, eq, gte, sql } from "drizzle-orm";
import { handleApiError } from "@/src/lib/errorHandler";
import { db } from "@/db/drizzle";
import { transferRecords } from "@/db/schema/transferRecord";
import { users } from "@/db/schema/user";
import { jobs } from "@/db/schema/job";
import { requireFinancialTier } from "../_lib/requireFinancial";

export async function GET(req: Request) {
  const auth = await requireFinancialTier(req, "ADMIN_OPERATOR");
  if (auth instanceof NextResponse) return auth;

  try {
    // Pull enough recent transfer legs to populate the queue tables + weekly aggregates.
    const rows = await db
      .select({
        id: transferRecords.id,
        createdAt: transferRecords.createdAt,
        releasedAt: transferRecords.releasedAt,
        status: transferRecords.status,
        method: transferRecords.method,
        role: transferRecords.role,
        userId: transferRecords.userId,
        jobId: transferRecords.jobId,
        amountCents: transferRecords.amountCents,
        currency: transferRecords.currency,
        stripeTransferId: transferRecords.stripeTransferId,
        externalRef: transferRecords.externalRef,
        failureReason: transferRecords.failureReason,
        retryCount: (transferRecords as any).retryCount ?? sql<number>`0`,
        user: { id: users.id, email: users.email, name: (users as any).name },
        job: { id: jobs.id, title: jobs.title },
      })
      .from(transferRecords)
      .innerJoin(users, eq(users.id, transferRecords.userId))
      .leftJoin(jobs, eq(jobs.id, transferRecords.jobId))
      .orderBy(desc(transferRecords.createdAt))
      .limit(500);

    const items = rows.map((r: any) => ({
      id: String(r.id),
      createdAt: (r.createdAt as Date)?.toISOString?.() ?? String(r.createdAt ?? ""),
      releasedAt: r.releasedAt ? ((r.releasedAt as Date)?.toISOString?.() ?? String(r.releasedAt)) : null,
      status: String(r.status ?? ""),
      method: String(r.method ?? ""),
      role: String(r.role ?? ""),
      userId: String(r.userId ?? ""),
      jobId: String(r.jobId ?? ""),
      amountCents: Number(r.amountCents ?? 0),
      currency: String(r.currency ?? ""),
      stripeTransferId: r.stripeTransferId ?? null,
      externalRef: r.externalRef ?? null,
      failureReason: r.failureReason ?? null,
      retryCount: Number(r.retryCount ?? 0),
      user: {
        id: String(r.user?.id ?? ""),
        email: r.user?.email ?? null,
        name: r.user?.name ?? null,
      },
      job: r.job?.id ? { id: String(r.job.id), title: r.job.title ?? null } : null,
    }));

    const pending = items.filter((t) => t.status === "PENDING").slice(0, 200);
    const failed = items.filter((t) => t.status === "FAILED" || t.status === "REVERSED").slice(0, 200);

    // Weekly aggregates (last 8 weeks) computed from DB (UTC week starting Monday).
    const since = new Date(Date.now() - 56 * 24 * 60 * 60 * 1000);
    const weeklyRows = await db
      .select({
        weekStart: sql<string>`to_char(date_trunc('week', ${transferRecords.createdAt}), 'YYYY-MM-DD')`,
        pendingCents: sql<number>`coalesce(sum(case when ${transferRecords.status} = 'PENDING' then ${transferRecords.amountCents} else 0 end), 0)::int`,
        failedCents: sql<number>`coalesce(sum(case when ${transferRecords.status} in ('FAILED','REVERSED') then ${transferRecords.amountCents} else 0 end), 0)::int`,
        sentCents: sql<number>`coalesce(sum(case when ${transferRecords.status} = 'SENT' then ${transferRecords.amountCents} else 0 end), 0)::int`,
      })
      .from(transferRecords)
      .where(gte(transferRecords.createdAt, since))
      .groupBy(sql`date_trunc('week', ${transferRecords.createdAt})`)
      .orderBy(sql`date_trunc('week', ${transferRecords.createdAt}) desc`)
      .limit(16);

    const weekly = weeklyRows.map((r: any) => ({
      weekStart: String(r.weekStart),
      pendingCents: Number(r.pendingCents ?? 0),
      failedCents: Number(r.failedCents ?? 0),
      sentCents: Number(r.sentCents ?? 0),
    }));

    return NextResponse.json({ ok: true, data: { pending, failed, weekly } }, { status: 200 });
  } catch (err) {
    return handleApiError(err, "GET /api/admin/financial/payouts", { userId: auth.userId });
  }
}

