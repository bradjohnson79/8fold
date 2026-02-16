import { NextResponse } from "next/server";
import { z } from "zod";
import crypto from "node:crypto";
import { requireAdmin } from "@/src/lib/auth/requireAdmin";
import { handleApiError } from "@/src/lib/errorHandler";
import { db } from "../../../../../db/drizzle";
import { auditLogs } from "../../../../../db/schema/auditLog";
import { ledgerEntries } from "../../../../../db/schema/ledgerEntry";
import { getWalletTotals } from "../../../../../src/wallet/totals";
import { adminAuditLog } from "@/src/audit/adminAudit";
import { readJsonBody } from "@/src/lib/api/readJsonBody";

const BodySchema = z.object({
  userId: z.string().trim().min(1),
  direction: z.enum(["CREDIT", "DEBIT"]),
  bucket: z.enum(["PENDING", "AVAILABLE", "PAID", "HELD"]).default("AVAILABLE"),
  amountCents: z.number().int().positive().max(100_000_000), // $1,000,000.00
  memo: z.string().trim().max(500).optional(),
});

export async function POST(req: Request) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  try {
    const j = await readJsonBody(req);
    if (!j.ok) return j.resp;
    const bodyParsed = BodySchema.safeParse(j.json);
    if (!bodyParsed.success) {
      return NextResponse.json({ ok: false, error: "invalid_input" }, { status: 400 });
    }
    const body = bodyParsed.data;

    // Guardrail: never allow AVAILABLE to go negative.
    if (body.direction === "DEBIT" && body.bucket === "AVAILABLE") {
      const totals = await getWalletTotals(body.userId);
      if (body.amountCents > totals.AVAILABLE) {
        return NextResponse.json(
          { ok: false, error: "insufficient_balance", available: totals.AVAILABLE },
          { status: 409 }
        );
      }
    }

    const now = new Date();
    const entryId = crypto.randomUUID();

    const result = await db.transaction(async (tx: any) => {
      const inserted = await tx
        .insert(ledgerEntries)
        .values({
          id: entryId,
          createdAt: now,
          userId: body.userId,
          type: "ADJUSTMENT",
          direction: body.direction,
          bucket: body.bucket,
          amountCents: body.amountCents,
          currency: "USD",
          memo: body.memo ?? "Manual adjustment",
        } as any)
        .returning();

      await tx.insert(auditLogs).values({
        id: crypto.randomUUID(),
        actorUserId: auth.userId,
        action: "LEDGER_ADJUSTMENT",
        entityType: "User",
        entityId: body.userId,
        metadata: {
          ledgerEntryId: entryId,
          direction: body.direction,
          bucket: body.bucket,
          amountCents: body.amountCents,
          memo: body.memo ?? null,
        } as any,
      });

      return { entry: inserted?.[0] ?? null };
    });

    await adminAuditLog(req, auth, {
      action: "ADMIN_LEDGER_ADJUSTMENT",
      entityType: "User",
      entityId: body.userId,
      metadata: {
        direction: body.direction,
        bucket: body.bucket,
        amountCents: body.amountCents,
        memo: body.memo ?? null,
      },
    });

    return NextResponse.json({ ok: true, data: result });
  } catch (err) {
    return handleApiError(err, "POST /api/admin/finance/adjustments", { userId: auth.userId });
  }
}

