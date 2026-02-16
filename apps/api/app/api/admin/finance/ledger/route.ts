import { NextResponse } from "next/server";
import { z } from "zod";
import { and, desc, eq } from "drizzle-orm";
import { requireAdmin } from "@/src/lib/auth/requireAdmin";
import { handleApiError } from "@/src/lib/errorHandler";
import { db } from "../../../../../db/drizzle";
import { ledgerEntries } from "../../../../../db/schema/ledgerEntry";

const QuerySchema = z.object({
  userId: z.string().trim().min(1).optional(),
  take: z.coerce.number().int().min(1).max(500).optional(),
  bucket: z.enum(["PENDING", "AVAILABLE", "PAID", "HELD"]).optional(),
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
});

export async function GET(req: Request) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  try {
    const url = new URL(req.url);
    const parsed = QuerySchema.safeParse({
      userId: url.searchParams.get("userId") ?? undefined,
      take: url.searchParams.get("take") ?? undefined,
      bucket: url.searchParams.get("bucket") ?? undefined,
      type: url.searchParams.get("type") ?? undefined,
    });
    if (!parsed.success) return NextResponse.json({ ok: false, error: "invalid_query" }, { status: 400 });

    const where = and(
      ...(parsed.data.userId ? [eq(ledgerEntries.userId, parsed.data.userId)] : []),
      ...(parsed.data.bucket ? [eq(ledgerEntries.bucket, parsed.data.bucket as any)] : []),
      ...(parsed.data.type ? [eq(ledgerEntries.type, parsed.data.type as any)] : [])
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
        memo: ledgerEntries.memo,
      })
      .from(ledgerEntries)
      .where(where)
      .orderBy(desc(ledgerEntries.createdAt))
      .limit(parsed.data.take ?? 200);

    return NextResponse.json({ ok: true, data: { entries: rows } });
  } catch (err) {
    return handleApiError(err, "GET /api/admin/finance/ledger", { userId: auth.userId });
  }
}

