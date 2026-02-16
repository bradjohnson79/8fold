import { NextResponse } from "next/server";
import { z } from "zod";
import crypto from "node:crypto";
import { eq } from "drizzle-orm";
import { requireAdmin } from "@/src/lib/auth/requireAdmin";
import { handleApiError } from "@/src/lib/errorHandler";
import { db } from "@/db/drizzle";
import { auditLogs } from "@/db/schema/auditLog";
import { disputeCases } from "@/db/schema/disputeCase";
import { disputeEnforcementActions } from "@/db/schema/disputeEnforcementAction";
import { readJsonBody } from "@/src/lib/api/readJsonBody";

function getIdFromUrl(req: Request): string {
  const url = new URL(req.url);
  const parts = url.pathname.split("/");
  const idx = parts.indexOf("disputes") + 1;
  return parts[idx] ?? "";
}

const EnforcementActionSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("RELEASE_ESCROW_FULL"),
    payload: z
      .object({ notes: z.string().trim().max(500).optional() })
      .optional()
      .default({}),
  }),
  z.object({
    type: z.literal("WITHHOLD_FUNDS"),
    payload: z
      .object({ notes: z.string().trim().max(500).optional() })
      .optional()
      .default({}),
  }),
  z.object({
    type: z.literal("RELEASE_ESCROW_PARTIAL"),
    payload: z.object({
      withholdAmountCents: z.number().int().positive(),
      currency: z.enum(["USD", "CAD"]).default("USD"),
      notes: z.string().trim().max(500).optional(),
    }),
  }),
  z.object({
    type: z.literal("FLAG_ACCOUNT_INTERNAL"),
    payload: z.object({
      userId: z.string().min(1),
      flagType: z.enum(["DISPUTE_RISK", "FRAUD_REVIEW", "MANUAL_REVIEW"]).default("DISPUTE_RISK"),
      reason: z.string().trim().min(5).max(500),
    }),
  }),
]);

const BodySchema = z.object({
  decision: z.enum(["FAVOR_POSTER", "FAVOR_CONTRACTOR", "PARTIAL", "NO_ACTION", "FAVOR_JOB_POSTER"]),
  decisionSummary: z.string().trim().min(10).max(5000),
  enforcementActions: z.array(EnforcementActionSchema).max(10).optional(),
});

export async function POST(req: Request) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  try {
    const id = getIdFromUrl(req);
    const j = await readJsonBody(req);
    if (!j.ok) return j.resp;
    const body = BodySchema.safeParse(j.json);
    if (!body.success) return NextResponse.json({ ok: false, error: "Invalid input" }, { status: 400 });

    const now = new Date();

    const updated = await db.transaction(async (tx: any) => {
      const updatedRows = await tx
        .update(disputeCases)
        .set({
          decision: body.data.decision as any,
          decisionSummary: body.data.decisionSummary.trim(),
          decisionAt: now,
          status: "DECIDED",
          updatedAt: now,
        } as any)
        .where(eq(disputeCases.id, id))
        .returning({
          id: disputeCases.id,
          status: disputeCases.status,
          decision: disputeCases.decision,
          decisionSummary: disputeCases.decisionSummary,
          decisionAt: disputeCases.decisionAt,
          updatedAt: disputeCases.updatedAt,
          ticketId: disputeCases.ticketId,
          filedByUserId: disputeCases.filedByUserId,
          againstUserId: disputeCases.againstUserId,
        });
      const d = updatedRows[0] ?? null;
      if (!d) throw Object.assign(new Error("Not found"), { status: 404 });

      const actions = body.data.enforcementActions ?? [];
      if (actions.length > 0) {
        await tx.insert(disputeEnforcementActions).values(
          actions.map((a) => ({
            id: crypto.randomUUID(),
            disputeCaseId: d.id,
            type: a.type as any,
            status: "PENDING" as any,
            payload: (a as any).payload ?? null,
            requestedByUserId: auth.userId,
            updatedAt: now,
          })) as any,
        );
      }

      await tx.insert(auditLogs).values({
        id: crypto.randomUUID(),
        actorUserId: auth.userId,
        action: "DISPUTE_DECISION_SET",
        entityType: "DisputeCase",
        entityId: d.id,
        metadata: {
          decision: d.decision,
          status: d.status,
          ticketId: d.ticketId,
          enforcementActionsCount: actions.length,
        } as any,
      });

      return d;
    });

    return NextResponse.json({
      ok: true,
      data: {
        dispute: {
          ...updated,
          updatedAt: updated.updatedAt.toISOString(),
          decisionAt: updated.decisionAt ? updated.decisionAt.toISOString() : null,
        },
      },
    });
  } catch (err) {
    return handleApiError(err, "POST /api/admin/support/disputes/[id]/decision", {
      route: "/api/admin/support/disputes/[id]/decision",
      userId: auth.userId,
    });
  }
}
