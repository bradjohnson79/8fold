import { NextResponse } from "next/server";
import { z } from "zod";
import crypto from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import { requireAdminOrSeniorRouter } from "@/src/lib/auth/requireAdmin";
import { handleApiError } from "@/src/lib/errorHandler";
import { db } from "@/db/drizzle";
import { auditLogs } from "@/db/schema/auditLog";
import { disputeCases } from "@/db/schema/disputeCase";
import { disputeVotes } from "@/db/schema/disputeVote";
import { sanitizeText } from "@/src/utils/sanitizeText";
import { readJsonBody } from "@/src/lib/api/readJsonBody";

function getIdFromUrl(req: Request): string {
  const url = new URL(req.url);
  const parts = url.pathname.split("/");
  const idx = parts.indexOf("disputes") + 1;
  return parts[idx] ?? "";
}

const VoteSchema = z.object({
  decision: z.enum(["FAVOR_POSTER", "FAVOR_CONTRACTOR", "PARTIAL", "NO_ACTION", "CANCEL_JOB"]),
  reasoning: z.string().trim().min(10).max(5000),
});

export async function GET(req: Request) {
  const auth = await requireAdminOrSeniorRouter(req);
  if (auth instanceof NextResponse) return auth;

  try {
    const disputeId = getIdFromUrl(req);

    const votes = await db
      .select({
        id: disputeVotes.id,
        createdAt: disputeVotes.createdAt,
        disputeCaseId: disputeVotes.disputeCaseId,
        voterType: disputeVotes.voterType,
        voterUserId: disputeVotes.voterUserId,
        status: disputeVotes.status,
        vote: disputeVotes.vote,
        rationale: disputeVotes.rationale,
        model: disputeVotes.model,
        confidence: disputeVotes.confidence,
        payload: disputeVotes.payload,
      })
      .from(disputeVotes)
      .where(eq(disputeVotes.disputeCaseId, disputeId))
      .orderBy(desc(disputeVotes.createdAt), desc(disputeVotes.id))
      .limit(500);

    return NextResponse.json({
      ok: true,
      data: {
        votes: votes.map((v: any) => ({ ...v, createdAt: v.createdAt.toISOString() })),
      },
    });
  } catch (err) {
    return handleApiError(err, "GET /api/admin/support/disputes/[id]/votes", {
      route: "/api/admin/support/disputes/[id]/votes",
      userId: auth.user.userId,
    });
  }
}

export async function POST(req: Request) {
  const auth = await requireAdminOrSeniorRouter(req);
  if (auth instanceof NextResponse) return auth;

  try {
    const voterType = auth.isAdmin ? ("ADMIN" as const) : ("SENIOR_ROUTER" as const);
    const { user } = auth;
    const disputeId = getIdFromUrl(req);
    const j = await readJsonBody(req);
    if (!j.ok) return j.resp;
    const body = VoteSchema.safeParse(j.json);
    if (!body.success) return NextResponse.json({ ok: false, error: "Invalid input" }, { status: 400 });
    const reasoningRaw = body.data.reasoning;
    const reasoning = sanitizeText(reasoningRaw, { maxLen: 5000 });
    if (reasoning.length < 10) return NextResponse.json({ ok: false, error: "Invalid input" }, { status: 400 });

    const disputeRows = await db
      .select({ id: disputeCases.id, status: disputeCases.status })
      .from(disputeCases)
      .where(eq(disputeCases.id, disputeId))
      .limit(1);
    const dispute = disputeRows[0] ?? null;
    if (!dispute) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
    if (String(dispute.status) === "DECIDED" || String(dispute.status) === "CLOSED") {
      return NextResponse.json({ ok: false, error: "Dispute is closed to voting." }, { status: 409 });
    }

    const created = await db.transaction(async (tx) => {
      const existing = await tx
        .select({ id: disputeVotes.id })
        .from(disputeVotes)
        .where(and(eq(disputeVotes.disputeCaseId, disputeId), eq(disputeVotes.voterUserId, user.userId), eq(disputeVotes.voterType, voterType)))
        .limit(1);
      if (existing[0]?.id) {
        throw Object.assign(new Error("Vote already cast (immutable)"), { status: 409 });
      }

      const inserted = await tx
        .insert(disputeVotes)
        .values({
          id: crypto.randomUUID(),
          disputeCaseId: disputeId,
          voterType,
          voterUserId: user.userId,
          status: "ACTIVE",
          vote: body.data.decision,
          rationale: reasoning,
          model: null,
          confidence: null,
          payload: null,
        } as any)
        .returning({
          id: disputeVotes.id,
          createdAt: disputeVotes.createdAt,
          voterType: disputeVotes.voterType,
          voterUserId: disputeVotes.voterUserId,
          status: disputeVotes.status,
          vote: disputeVotes.vote,
          rationale: disputeVotes.rationale,
        });
      const v = inserted[0] as any;

      await tx.insert(auditLogs).values({
        id: crypto.randomUUID(),
        actorUserId: user.userId,
        action: "DISPUTE_VOTE_CAST",
        entityType: "DisputeCase",
        entityId: disputeId,
        metadata: {
          voterType,
          vote: body.data.decision,
          sanitized: true,
          truncated: reasoning.length < reasoningRaw.trim().length,
        } as any,
      });

      await tx
        .update(disputeCases)
        .set({ status: "UNDER_REVIEW" as any, updatedAt: new Date() } as any)
        .where(and(eq(disputeCases.id, disputeId), eq(disputeCases.status, "SUBMITTED" as any)));

      return v;
    });

    return NextResponse.json(
      {
        ok: true,
        data: { vote: { ...created, createdAt: created.createdAt.toISOString() } },
      },
      { status: 201 },
    );
  } catch (err) {
    return handleApiError(err, "POST /api/admin/support/disputes/[id]/votes", {
      route: "/api/admin/support/disputes/[id]/votes",
      userId: auth.user.userId,
    });
  }
}
