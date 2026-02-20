import { NextResponse } from "next/server";
import { z } from "zod";
import { and, desc, eq, gte, lte } from "drizzle-orm";
import { requireAdmin } from "@/src/lib/auth/requireAdmin";
import { handleApiError } from "@/src/lib/errorHandler";
import { db } from "@/server/db/drizzle";
import { transferRecords } from "@/db/schema/transferRecord";
import { users } from "@/db/schema/user";
import { jobs } from "@/db/schema/job";

const QuerySchema = z.object({
  take: z.coerce.number().int().min(1).max(200).optional(),
  role: z.enum(["CONTRACTOR", "ROUTER", "PLATFORM"]).optional(),
  method: z.enum(["STRIPE"]).optional(),
  status: z.enum(["PENDING", "SENT", "FAILED", "REVERSED"]).optional(),
  userId: z.string().min(1).optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
});

export async function GET(req: Request) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  try {
    const url = new URL(req.url);
    const parsed = QuerySchema.safeParse({
      take: url.searchParams.get("take") ?? undefined,
      role: url.searchParams.get("role") ?? undefined,
      method: url.searchParams.get("method") ?? undefined,
      status: url.searchParams.get("status") ?? undefined,
      userId: url.searchParams.get("userId") ?? undefined,
      from: url.searchParams.get("from") ?? undefined,
      to: url.searchParams.get("to") ?? undefined,
    });
    if (!parsed.success) return NextResponse.json({ ok: false, error: "invalid_query" }, { status: 400 });

    const take = parsed.data.take ?? 20;
    const fromD = parsed.data.from ? new Date(parsed.data.from) : null;
    const toD = parsed.data.to ? new Date(parsed.data.to) : null;

    const whereParts: any[] = [];
    if (parsed.data.role) whereParts.push(eq(transferRecords.role, parsed.data.role));
    if (parsed.data.method) whereParts.push(eq(transferRecords.method, parsed.data.method));
    if (parsed.data.status) whereParts.push(eq(transferRecords.status, parsed.data.status));
    if (parsed.data.userId) whereParts.push(eq(transferRecords.userId, parsed.data.userId));
    if (fromD) whereParts.push(gte(transferRecords.createdAt, fromD as any));
    if (toD) whereParts.push(lte(transferRecords.createdAt, toD as any));

    const where = whereParts.length ? and(...whereParts) : undefined;

    const rows = await db
      .select({
        id: transferRecords.id,
        createdAt: transferRecords.createdAt,
        releasedAt: transferRecords.releasedAt,
        status: transferRecords.status,
        method: transferRecords.method,
        role: transferRecords.role,
        userId: transferRecords.userId,
        amountCents: transferRecords.amountCents,
        currency: transferRecords.currency,
        stripeTransferId: transferRecords.stripeTransferId,
        externalRef: transferRecords.externalRef,
        failureReason: transferRecords.failureReason,
        jobId: transferRecords.jobId,
        user: { id: users.id, email: users.email, name: (users as any).name },
        job: { id: jobs.id, title: jobs.title },
      })
      .from(transferRecords)
      .innerJoin(users, eq(users.id, transferRecords.userId))
      .leftJoin(jobs, eq(jobs.id, transferRecords.jobId))
      .where(where as any)
      .orderBy(desc(transferRecords.createdAt))
      .limit(take);

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
      user: {
        id: String(r.user?.id ?? ""),
        email: r.user?.email ?? null,
        name: r.user?.name ?? null,
      },
      job: r.job?.id ? { id: String(r.job.id), title: r.job.title ?? null } : null,
    }));

    return NextResponse.json({ ok: true, data: { items } }, { status: 200 });
  } catch (err) {
    return handleApiError(err, "GET /api/admin/finance/transfers", { userId: auth.userId });
  }
}

