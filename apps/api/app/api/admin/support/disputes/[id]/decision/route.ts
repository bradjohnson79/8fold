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

// Ops decision API (stable surface). Internally mapped to DB `DisputeDecision` enum.
const OpsDecisionSchema = z.discriminatedUnion("decision", [
  z.object({
    decision: z.literal("CLOSE_NO_ACTION"),
    decisionSummary: z.string().trim().min(10).max(5000),
  }),
  z.object({
    decision: z.literal("WITHHOLD_ESCROW"),
    decisionSummary: z.string().trim().min(10).max(5000),
    notes: z.string().trim().max(500).optional(),
  }),
  z.object({
    decision: z.literal("RELEASE_ESCROW_FULL"),
    decisionSummary: z.string().trim().min(10).max(5000),
    notes: z.string().trim().max(500).optional(),
  }),
  z.object({
    decision: z.literal("PARTIAL_RELEASE"),
    decisionSummary: z.string().trim().min(10).max(5000),
    withholdAmountCents: z.number().int().positive(),
    currency: z.enum(["USD", "CAD"]).default("USD"),
    notes: z.string().trim().max(500).optional(),
  }),
]);

const BodySchema = z.object({
  // Back-compat: allow legacy decisions + explicit enforcement actions if sent.
  legacyDecision: z.enum(["FAVOR_POSTER", "FAVOR_CONTRACTOR", "PARTIAL", "NO_ACTION", "FAVOR_JOB_POSTER"]).optional(),
  legacyDecisionSummary: z.string().trim().min(10).max(5000).optional(),
  enforcementActions: z.array(EnforcementActionSchema).max(10).optional(),

  // Preferred ops surface:
  ops: OpsDecisionSchema.optional(),
});

function normalizeDecisionInput(body: z.infer<typeof BodySchema>): {
  decision: "FAVOR_POSTER" | "FAVOR_CONTRACTOR" | "PARTIAL" | "NO_ACTION" | "FAVOR_JOB_POSTER";
  decisionSummary: string;
  enforcementActions: Array<z.infer<typeof EnforcementActionSchema>>;
  opsDecision?: z.infer<typeof OpsDecisionSchema>["decision"];
} {
  if (body.ops) {
    const s = body.ops.decisionSummary.trim();
    if (body.ops.decision === "CLOSE_NO_ACTION") {
      return { decision: "NO_ACTION", decisionSummary: s, enforcementActions: [], opsDecision: "CLOSE_NO_ACTION" };
    }
    if (body.ops.decision === "WITHHOLD_ESCROW") {
      return {
        decision: "PARTIAL",
        decisionSummary: s,
        enforcementActions: [{ type: "WITHHOLD_FUNDS", payload: { notes: body.ops.notes } } as any],
        opsDecision: "WITHHOLD_ESCROW",
      };
    }
    if (body.ops.decision === "RELEASE_ESCROW_FULL") {
      return {
        decision: "FAVOR_CONTRACTOR",
        decisionSummary: s,
        enforcementActions: [{ type: "RELEASE_ESCROW_FULL", payload: { notes: body.ops.notes } } as any],
        opsDecision: "RELEASE_ESCROW_FULL",
      };
    }
    // PARTIAL_RELEASE
    return {
      decision: "PARTIAL",
      decisionSummary: s,
      enforcementActions: [
        {
          type: "RELEASE_ESCROW_PARTIAL",
          payload: { withholdAmountCents: body.ops.withholdAmountCents, currency: body.ops.currency, notes: body.ops.notes },
        } as any,
      ],
      opsDecision: "PARTIAL_RELEASE",
    };
  }

  const decision = body.legacyDecision ?? "NO_ACTION";
  const decisionSummary = (body.legacyDecisionSummary ?? "").trim();
  const enforcementActions = body.enforcementActions ?? [];
  return { decision, decisionSummary, enforcementActions };
}

export async function POST(req: Request) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  try {
    const id = getIdFromUrl(req);
    const j = await readJsonBody(req);
    if (!j.ok) return j.resp;
    const body = BodySchema.safeParse(j.json);
    if (!body.success) return NextResponse.json({ ok: false, error: "Invalid input" }, { status: 400 });

    const normalized = normalizeDecisionInput(body.data);
    if (!normalized.decisionSummary || normalized.decisionSummary.trim().length < 10) {
      return NextResponse.json({ ok: false, error: "Invalid input" }, { status: 400 });
    }

    const now = new Date();

    const updated = await db.transaction(async (tx: any) => {
      // Require dispute exists; also used for audit metadata.
      const existingRows = await tx
        .select({ id: disputeCases.id, status: disputeCases.status, ticketId: disputeCases.ticketId, jobId: disputeCases.jobId })
        .from(disputeCases)
        .where(eq(disputeCases.id, id))
        .limit(1);
      const existing = existingRows[0] ?? null;
      if (!existing) throw Object.assign(new Error("Not found"), { status: 404 });
      if (String(existing.status) === "CLOSED") {
        // Deterministic state machine: closed disputes are terminal.
        throw Object.assign(new Error("Dispute is closed"), { status: 409, code: "dispute_closed" });
      }

      const nextStatus = normalized.opsDecision === "CLOSE_NO_ACTION" ? ("CLOSED" as const) : ("DECIDED" as const);

      const updatedRows = await tx
        .update(disputeCases)
        .set({
          decision: normalized.decision as any,
          decisionSummary: normalized.decisionSummary.trim(),
          decisionAt: now,
          status: nextStatus as any,
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

      const actions = normalized.enforcementActions ?? [];
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
          opsDecision: normalized.opsDecision ?? null,
          decision: d.decision,
          status: d.status,
          ticketId: d.ticketId,
          jobId: existing.jobId,
          enforcementActionsCount: actions.length,
          enforcementActionTypes: actions.map((a) => a.type),
          decisionSummaryLen: normalized.decisionSummary.trim().length,
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
