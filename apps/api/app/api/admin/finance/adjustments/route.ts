import { NextResponse } from "next/server";
import { z } from "zod";
import crypto from "node:crypto";
import { eq } from "drizzle-orm";
import { handleApiError } from "@/src/lib/errorHandler";
import { db } from "../../../../../db/drizzle";
import { auditLogs } from "../../../../../db/schema/auditLog";
import { adminAdjustmentIdempotency } from "../../../../../db/schema/adminAdjustmentIdempotency";
import { ledgerEntries } from "../../../../../db/schema/ledgerEntry";
import { getWalletTotals } from "../../../../../src/wallet/totals";
import { adminAuditLog } from "@/src/audit/adminAudit";
import { readJsonBody } from "@/src/lib/api/readJsonBody";
import { enforceTier, requireAdminIdentityWithTier } from "../../_lib/adminTier";

const BodySchema = z.object({
  userId: z.string().trim().min(1),
  direction: z.enum(["CREDIT", "DEBIT"]),
  bucket: z.enum(["PENDING", "AVAILABLE", "PAID", "HELD"]).default("AVAILABLE"),
  amountCents: z.number().int().positive().max(100_000_000), // $1,000,000.00
  memo: z.string().trim().max(500).optional(),
  requestId: z.string().trim().min(1).max(200).optional(),
});

export async function POST(req: Request) {
  const identity = await requireAdminIdentityWithTier(req);
  if (identity instanceof NextResponse) return identity;
  const forbidden = enforceTier(identity, "ADMIN_SUPER");
  if (forbidden) return forbidden;

  try {
    const j = await readJsonBody(req);
    if (!j.ok) return j.resp;
    const bodyParsed = BodySchema.safeParse(j.json);
    if (!bodyParsed.success) {
      return NextResponse.json({ ok: false, error: "invalid_input" }, { status: 400 });
    }
    const body = bodyParsed.data;
    const idempotencyKeyHeader = String(req.headers.get("Idempotency-Key") ?? "").trim();
    const idempotencyKeyBody = body.requestId ? `adjustment:${body.requestId}` : "";
    const idempotencyKey = idempotencyKeyHeader || idempotencyKeyBody;
    if (!idempotencyKey) {
      return NextResponse.json({ ok: false, error: "missing_idempotency_key" }, { status: 400 });
    }

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
      const idemInsert = await tx
        .insert(adminAdjustmentIdempotency)
        .values({
          idempotencyKey,
          ledgerEntryId: entryId,
          createdByUserId: identity.userId,
        } as any)
        .onConflictDoNothing({ target: adminAdjustmentIdempotency.idempotencyKey })
        .returning({ id: adminAdjustmentIdempotency.id });
      if ((idemInsert?.length ?? 0) === 0) {
        const existing = await tx
          .select({ ledgerEntryId: adminAdjustmentIdempotency.ledgerEntryId })
          .from(adminAdjustmentIdempotency)
          .where(eq(adminAdjustmentIdempotency.idempotencyKey, idempotencyKey))
          .limit(1);
        const existingLedgerEntryId = existing[0]?.ledgerEntryId ?? null;
        const existingEntryRows = existingLedgerEntryId
          ? await tx.select().from(ledgerEntries).where(eq(ledgerEntries.id, existingLedgerEntryId)).limit(1)
          : [];
        return {
          kind: "duplicate" as const,
          ledgerEntryId: existingLedgerEntryId,
          entry: existingEntryRows[0] ?? null,
        };
      }

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
        actorUserId: identity.userId,
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

      return { kind: "ok" as const, entry: inserted?.[0] ?? null };
    });
    if (result.kind === "duplicate") {
      return NextResponse.json(
        {
          ok: true,
          data: {
            duplicate: true,
            ledgerEntryId: result.ledgerEntryId,
            entry: result.entry,
            message: "Adjustment already applied",
          },
        },
        { status: 200 },
      );
    }

    await adminAuditLog(req, {
      userId: identity.userId,
      role: "ADMIN",
      authSource: identity.authSource,
    }, {
      action: "ADMIN_LEDGER_ADJUSTMENT",
      entityType: "User",
      entityId: body.userId,
      metadata: {
        direction: body.direction,
        bucket: body.bucket,
        amountCents: body.amountCents,
        memo: body.memo ?? null,
        idempotencyKey,
      },
    });

    return NextResponse.json({ ok: true, data: { entry: result.entry } });
  } catch (err) {
    return handleApiError(err, "POST /api/admin/finance/adjustments", { userId: identity.userId });
  }
}

