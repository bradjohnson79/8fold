import { NextResponse } from "next/server";
import { z } from "zod";
import { and, desc, eq } from "drizzle-orm";
import { requireAdmin } from "@/src/lib/auth/requireAdmin";
import { handleApiError } from "@/src/lib/errorHandler";
import { db } from "../../../../../db/drizzle";
import { payoutRequests } from "../../../../../db/schema/payoutRequest";
import { payouts } from "../../../../../db/schema/payout";
import { users } from "../../../../../db/schema/user";

const QuerySchema = z.object({
  role: z.enum(["ADMIN", "CONTRACTOR", "JOB_POSTER", "ROUTER"]).optional(),
  status: z.enum(["REQUESTED", "REJECTED", "PAID", "CANCELLED"]).optional(),
  take: z.coerce.number().int().min(1).max(500).optional(),
});

export async function GET(req: Request) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  try {
    const url = new URL(req.url);
    const parsed = QuerySchema.safeParse({
      role: url.searchParams.get("role") ?? undefined,
      status: url.searchParams.get("status") ?? undefined,
      take: url.searchParams.get("take") ?? undefined,
    });
    if (!parsed.success) {
      return NextResponse.json({ ok: false, error: "invalid_query" }, { status: 400 });
    }

    const take = parsed.data.take ?? 200;
    const status = parsed.data.status ?? "PAID";

    const where = and(
      eq(payoutRequests.status, status as any),
      ...(parsed.data.role ? [eq(users.role, parsed.data.role as any)] : [])
    );

    const rows = await db
      .select({
        id: payoutRequests.id,
        createdAt: payoutRequests.createdAt,
        status: payoutRequests.status,
        userId: payoutRequests.userId,
        amountCents: payoutRequests.amountCents,
        payoutId: payoutRequests.payoutId,

        user: { id: users.id, email: users.email, role: users.role },
        payout: {
          id: payouts.id,
          createdAt: payouts.createdAt,
          paidAt: payouts.paidAt,
          status: payouts.status,
          provider: payouts.provider,
          currency: payouts.currency,
          amountCents: payouts.amountCents,
          externalReference: payouts.externalReference,
          notesInternal: payouts.notesInternal,
          failureReason: payouts.failureReason,
        },
      })
      .from(payoutRequests)
      .innerJoin(users, eq(users.id, payoutRequests.userId))
      .leftJoin(payouts, eq(payouts.id, payoutRequests.payoutId))
      .where(where)
      .orderBy(desc(payoutRequests.createdAt))
      .limit(take);

    const items = rows.map((r: any) => ({
      id: r.id,
      createdAt: r.createdAt,
      status: r.status,
      userId: r.userId,
      amountCents: r.amountCents,
      payoutId: r.payoutId,
      user: r.user,
      payout: r.payout?.id ? r.payout : null,
    }));

    return NextResponse.json({ ok: true, data: { items } });
  } catch (err) {
    return handleApiError(err, "GET /api/admin/finance/payout-history", { userId: auth.userId });
  }
}

