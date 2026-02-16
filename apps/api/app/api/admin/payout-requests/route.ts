import { NextResponse } from "next/server";
import { requireAdmin } from "@/src/lib/auth/requireAdmin";
import { handleApiError } from "@/src/lib/errorHandler";
import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "@/server/db/drizzle";
import { payouts } from "../../../../db/schema/payout";
import { payoutRequests } from "../../../../db/schema/payoutRequest";
import { users } from "../../../../db/schema/user";

export async function GET(req: Request) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  try {
    const url = new URL(req.url);
    const status = url.searchParams.get("status") ?? "REQUESTED";

    const PAYOUT_REQUEST_STATUS_VALUES = new Set(["REQUESTED", "REJECTED", "PAID", "CANCELLED"]);
    if (!PAYOUT_REQUEST_STATUS_VALUES.has(status)) {
      return NextResponse.json({ ok: false, error: "invalid_status" }, { status: 400 });
    }

    const rows = await db
      .select({
        id: payoutRequests.id,
        createdAt: payoutRequests.createdAt,
        status: payoutRequests.status,
        userId: payoutRequests.userId,
        amountCents: payoutRequests.amountCents,
        payoutId: payoutRequests.payoutId,

        user: {
          id: users.id,
          email: users.email,
          role: users.role,
        },
        payout: {
          id: payouts.id,
          paidAt: payouts.paidAt,
          externalReference: payouts.externalReference,
          notesInternal: payouts.notesInternal,
          status: payouts.status,
        },
      })
      .from(payoutRequests)
      .innerJoin(users, eq(users.id, payoutRequests.userId))
      .leftJoin(payouts, eq(payouts.id, payoutRequests.payoutId))
      .where(and(eq(payoutRequests.status, status as any)))
      .orderBy(desc(payoutRequests.createdAt))
      .limit(200);

    const payoutRequestsOut = rows.map((r: any) => ({
      id: r.id,
      createdAt: r.createdAt,
      status: r.status,
      userId: r.userId,
      amountCents: r.amountCents,
      payoutId: r.payoutId,
      user: r.user,
      payout: r.payout?.id ? r.payout : null,
    }));

    return NextResponse.json({ ok: true, data: { payoutRequests: payoutRequestsOut } });
  } catch (err) {
    return handleApiError(err, "GET /api/admin/payout-requests", { userId: auth.userId });
  }
}

