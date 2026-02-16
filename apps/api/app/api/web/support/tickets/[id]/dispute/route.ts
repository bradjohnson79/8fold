import { NextResponse } from "next/server";
import { requireUser } from "../../../../../../../src/auth/rbac";
import { toHttpError } from "../../../../../../../src/http/errors";
import { eq } from "drizzle-orm";
import { db } from "../../../../../../../db/drizzle";
import { disputeCases } from "../../../../../../../db/schema/disputeCase";
import { supportTickets } from "../../../../../../../db/schema/supportTicket";

function getIdFromUrl(req: Request): string {
  const url = new URL(req.url);
  const parts = url.pathname.split("/");
  const idx = parts.indexOf("tickets") + 1;
  return parts[idx] ?? "";
}

export async function GET(req: Request) {
  try {
    const user = await requireUser(req);
    const ticketId = getIdFromUrl(req);

    const ticketRows = await db
      .select({
        id: supportTickets.id,
        createdById: supportTickets.createdById,
        type: supportTickets.type,
        againstUserId: disputeCases.againstUserId,
      })
      .from(supportTickets)
      .leftJoin(disputeCases, eq(disputeCases.ticketId, supportTickets.id))
      .where(eq(supportTickets.id, ticketId))
      .limit(1);
    const ticket = ticketRows[0] ?? null;
    if (!ticket) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const isCreator = ticket.createdById === user.userId;
    const isAgainstParty = ticket.type === "DISPUTE" && ticket.againstUserId === user.userId;
    if (!isCreator && !isAgainstParty) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const disputeRows = await db
      .select({
        id: disputeCases.id,
        createdAt: disputeCases.createdAt,
        updatedAt: disputeCases.updatedAt,
        ticketId: disputeCases.ticketId,
        jobId: disputeCases.jobId,
        filedByUserId: disputeCases.filedByUserId,
        againstUserId: disputeCases.againstUserId,
        againstRole: disputeCases.againstRole,
        disputeReason: disputeCases.disputeReason,
        description: disputeCases.description,
        status: disputeCases.status,
        decision: disputeCases.decision,
        decisionSummary: disputeCases.decisionSummary,
        decisionAt: disputeCases.decisionAt,
        deadlineAt: disputeCases.deadlineAt,
      })
      .from(disputeCases)
      .where(eq(disputeCases.ticketId, ticketId))
      .limit(1);
    const dispute = disputeRows[0] ?? null;

    if (!dispute) return NextResponse.json({ dispute: null });

    return NextResponse.json({
      dispute: {
        ...dispute,
        createdAt: dispute.createdAt.toISOString(),
        updatedAt: dispute.updatedAt.toISOString(),
        decisionAt: dispute.decisionAt ? dispute.decisionAt.toISOString() : null,
        deadlineAt: dispute.deadlineAt.toISOString(),
      },
    });
  } catch (err) {
    const { status, message } = toHttpError(err);
    return NextResponse.json({ error: message }, { status });
  }
}

