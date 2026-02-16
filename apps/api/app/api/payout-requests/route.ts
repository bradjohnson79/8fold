import { NextResponse } from "next/server";
import { requireUser } from "../../../src/auth/rbac";
import { toHttpError } from "../../../src/http/errors";
import { getWalletTotals } from "../../../src/wallet/totals";
import { z } from "zod";
import crypto from "node:crypto";
import { db } from "../../../db/drizzle";
import { auditLogs } from "../../../db/schema/auditLog";
import { payoutRequests } from "../../../db/schema/payoutRequest";
import { logApiError } from "@/src/lib/errors/errorLogger";

const BodySchema = z.object({
  amountCents: z.number().int().positive().optional()
});

export async function POST(req: Request) {
  try {
    const user = await requireUser(req);
    let raw: unknown = {};
    try {
      raw = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid input" }, { status: 400 });
    }
    const body = BodySchema.safeParse(raw);
    if (!body.success) {
      return NextResponse.json({ error: "Invalid input" }, { status: 400 });
    }

    const totals = await getWalletTotals(user.userId);
    const available = totals.AVAILABLE;
    const amountCents = body.data.amountCents ?? available;

    if (amountCents <= 0) {
      return NextResponse.json({ error: "No available balance" }, { status: 409 });
    }
    if (amountCents > available) {
      return NextResponse.json({ error: "Amount exceeds available balance" }, { status: 409 });
    }

    const payoutRequest = await db.transaction(async (tx) => {
      const created = await tx
        .insert(payoutRequests)
        .values({
          id: crypto.randomUUID(),
          userId: user.userId,
          status: "REQUESTED",
          amountCents,
        })
        .returning();

      const pr = created[0] as any;
      await tx.insert(auditLogs).values({
        id: crypto.randomUUID(),
        actorUserId: user.userId,
        action: "PAYOUT_REQUEST_CREATE",
        entityType: "PayoutRequest",
        entityId: pr.id,
        metadata: { amountCents } as any,
      });
      return pr;
    });

    return NextResponse.json({ payoutRequest }, { status: 201 });
  } catch (err) {
    logApiError({ context: "POST /api/payout-requests", err });
    const { status, message } = toHttpError(err);
    return NextResponse.json({ error: message }, { status });
  }
}

