import { NextResponse } from "next/server";
import { z } from "zod";
import { and, desc, eq, gte, lte } from "drizzle-orm";
import { handleApiError } from "@/src/lib/errorHandler";
import { db } from "@/db/drizzle";
import { ledgerEntries } from "@/db/schema/ledgerEntry";
import { requireFinancialTier } from "../_lib/requireFinancial";

const QuerySchema = z.object({
  take: z.coerce.number().int().min(1).max(500).optional(),
  type: z
    .enum([
      "ROUTER_EARNING",
      "BROKER_FEE",
      "PAYOUT",
      "ADJUSTMENT",
      "ESCROW_FUND",
      "PNM_FUND",
      "ESCROW_RELEASE",
      "ESCROW_REFUND",
      "PLATFORM_FEE",
      "ROUTER_EARN",
      "CONTRACTOR_EARN",
    ])
    .optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
});

export async function GET(req: Request) {
  const auth = await requireFinancialTier(req, "ADMIN_OPERATOR");
  if (auth instanceof NextResponse) return auth;

  try {
    const url = new URL(req.url);
    const parsed = QuerySchema.safeParse({
      take: url.searchParams.get("take") ?? undefined,
      type: url.searchParams.get("type") ?? undefined,
      from: url.searchParams.get("from") ?? undefined,
      to: url.searchParams.get("to") ?? undefined,
    });
    if (!parsed.success) return NextResponse.json({ ok: false, error: "invalid_query" }, { status: 400 });

    const take = parsed.data.take ?? 200;
    const fromD = parsed.data.from ? new Date(parsed.data.from) : null;
    const toD = parsed.data.to ? new Date(parsed.data.to) : null;

    const where = and(
      ...(parsed.data.type ? [eq(ledgerEntries.type, parsed.data.type as any)] : []),
      ...(fromD ? [gte(ledgerEntries.createdAt, fromD as any)] : []),
      ...(toD ? [lte(ledgerEntries.createdAt, toD as any)] : []),
    );

    const rows = await db
      .select({
        id: ledgerEntries.id,
        createdAt: ledgerEntries.createdAt,
        userId: ledgerEntries.userId,
        jobId: ledgerEntries.jobId,
        escrowId: ledgerEntries.escrowId,
        type: ledgerEntries.type,
        direction: ledgerEntries.direction,
        bucket: ledgerEntries.bucket,
        amountCents: ledgerEntries.amountCents,
        currency: ledgerEntries.currency,
        stripeRef: ledgerEntries.stripeRef,
      })
      .from(ledgerEntries)
      .where(where)
      .orderBy(desc(ledgerEntries.createdAt))
      .limit(take);

    return NextResponse.json(
      {
        ok: true,
        data: {
          entries: rows.map((r: any) => ({
            id: String(r.id),
            createdAt: (r.createdAt as Date)?.toISOString?.() ?? String(r.createdAt ?? ""),
            userId: String(r.userId ?? ""),
            jobId: r.jobId ?? null,
            escrowId: r.escrowId ?? null,
            type: String(r.type ?? ""),
            direction: String(r.direction ?? ""),
            bucket: String(r.bucket ?? ""),
            amountCents: Number(r.amountCents ?? 0),
            currency: String(r.currency ?? ""),
            stripeRef: r.stripeRef ?? null,
          })),
        },
      },
      { status: 200 },
    );
  } catch (err) {
    return handleApiError(err, "GET /api/admin/financial/ledger", { userId: auth.userId });
  }
}

