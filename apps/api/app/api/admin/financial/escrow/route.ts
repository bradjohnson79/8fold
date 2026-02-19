import { NextResponse } from "next/server";
import { z } from "zod";
import { and, desc, eq, gte, lte, sql } from "drizzle-orm";
import { handleApiError } from "@/src/lib/errorHandler";
import { db } from "@/db/drizzle";
import { escrows } from "@/db/schema/escrow";
import { jobs } from "@/db/schema/job";
import { requireFinancialTier } from "../_lib/requireFinancial";

const QuerySchema = z.object({
  status: z.enum(["HELD", "RELEASED", "FAILED", "ALL"]).optional(),
  express: z.union([z.literal("1"), z.literal("0"), z.literal("true"), z.literal("false")]).optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  take: z.coerce.number().int().min(1).max(500).optional(),
});

export async function GET(req: Request) {
  const auth = await requireFinancialTier(req, "ADMIN_OPERATOR");
  if (auth instanceof NextResponse) return auth;

  try {
    const url = new URL(req.url);
    const parsed = QuerySchema.safeParse({
      status: url.searchParams.get("status") ?? undefined,
      express: url.searchParams.get("express") ?? undefined,
      from: url.searchParams.get("from") ?? undefined,
      to: url.searchParams.get("to") ?? undefined,
      take: url.searchParams.get("take") ?? undefined,
    });
    if (!parsed.success) return NextResponse.json({ ok: false, error: "invalid_query" }, { status: 400 });

    const take = parsed.data.take ?? 200;
    const fromD = parsed.data.from ? new Date(parsed.data.from) : null;
    const toD = parsed.data.to ? new Date(parsed.data.to) : null;
    const expressOnly = parsed.data.express === "1" || parsed.data.express === "true";

    const whereParts: any[] = [];
    if (fromD) whereParts.push(gte(escrows.createdAt, fromD as any));
    if (toD) whereParts.push(lte(escrows.createdAt, toD as any));
    if (expressOnly) whereParts.push(sql`${jobs.transactionFeeCents} > 0`);

    const status = parsed.data.status ?? "HELD";
    if (status === "HELD") whereParts.push(sql`${escrows.status} in ('PENDING','FUNDED')`);
    if (status === "RELEASED") whereParts.push(eq(escrows.status, "RELEASED" as any));
    if (status === "FAILED") whereParts.push(eq(escrows.status, "FAILED" as any));

    const where = whereParts.length ? and(...whereParts) : undefined;

    const rows = await db
      .select({
        escrowId: escrows.id,
        jobId: escrows.jobId,
        createdAt: escrows.createdAt,
        posterPaidCents: jobs.amountCents,
        contractorShareCents: jobs.contractorPayoutCents,
        routerShareCents: jobs.routerEarningsCents,
        platformShareCents: jobs.brokerFeeCents,
        expressFeeCents: jobs.transactionFeeCents,
        escrowStatus: escrows.status,
        releaseStatus: jobs.payoutStatus,
        stripePaymentIntentId: escrows.stripePaymentIntentId,
      })
      .from(escrows)
      .innerJoin(jobs, eq(jobs.id, escrows.jobId))
      .where(where as any)
      .orderBy(desc(escrows.createdAt))
      .limit(take);

    const out = rows.map((r: any) => ({
      escrowId: String(r.escrowId),
      jobId: String(r.jobId),
      createdAt: (r.createdAt as Date)?.toISOString?.() ?? String(r.createdAt ?? ""),
      posterPaidCents: Number(r.posterPaidCents ?? 0),
      contractorShareCents: Number(r.contractorShareCents ?? 0),
      routerShareCents: Number(r.routerShareCents ?? 0),
      platformShareCents: Number(r.platformShareCents ?? 0),
      expressFeeCents: Number(r.expressFeeCents ?? 0),
      escrowStatus: String(r.escrowStatus ?? ""),
      releaseStatus: String(r.releaseStatus ?? ""),
      stripePaymentIntentId: r.stripePaymentIntentId ?? null,
    }));

    return NextResponse.json({ ok: true, data: { rows: out } }, { status: 200 });
  } catch (err) {
    return handleApiError(err, "GET /api/admin/financial/escrow", { userId: auth.userId });
  }
}

