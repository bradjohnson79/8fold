import { and, desc, eq } from "drizzle-orm";
import { db } from "@/server/db/drizzle";
import { disputes } from "@/db/schema/dispute";
import { v4AdminDisputes } from "@/db/schema/v4AdminDispute";
import { requireAdminV4 } from "@/src/auth/requireAdminV4";
import { ok } from "@/src/lib/api/adminV4Response";

export async function GET(req: Request) {
  const authed = await requireAdminV4(req);
  if (authed instanceof Response) return authed;

  const { searchParams } = new URL(req.url);
  const status = String(searchParams.get("status") ?? "").trim();
  const limit = Math.max(1, Math.min(200, Number(searchParams.get("take") ?? searchParams.get("limit") ?? 100)));

  try {
    const [adminRows, messengerRows] = await Promise.all([
      db
        .select()
        .from(v4AdminDisputes)
        .where(status ? and(eq(v4AdminDisputes.status, status)) : undefined)
        .orderBy(desc(v4AdminDisputes.createdAt))
        .limit(limit),
      db
        .select({
          id: disputes.id,
          status: disputes.status,
          createdAt: disputes.createdAt,
          updatedAt: disputes.createdAt,
          source: disputes.status,
          userId: disputes.userId,
          role: disputes.role,
          jobId: disputes.jobId,
          conversationId: disputes.conversationId,
          subject: disputes.subject,
          message: disputes.message,
        })
        .from(disputes)
        .where(status ? and(eq(disputes.status, status)) : undefined)
        .orderBy(desc(disputes.createdAt))
        .limit(limit),
    ]);

    const rows = [
      ...adminRows.map((r) => ({ ...r, source: "LEGACY_SUPPORT_DISPUTE" as const })),
      ...messengerRows.map((r) => ({
        id: r.id,
        ticketId: null,
        jobId: r.jobId,
        filedByUserId: r.userId,
        againstUserId: null,
        againstRole: null,
        disputeReason: "MESSENGER_SUPPORT_DISPUTE",
        description: r.message,
        status: r.status,
        decision: null,
        decisionSummary: null,
        decisionAt: null,
        deadlineAt: null,
        ticketSubject: r.subject,
        ticketPriority: null,
        ticketCategory: "DISPUTE",
        ticketStatus: r.status,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
        source: "MESSENGER_DISPUTE" as const,
        conversationId: r.conversationId,
        role: r.role,
      })),
    ]
      .sort((a, b) => (b.createdAt?.getTime?.() ?? 0) - (a.createdAt?.getTime?.() ?? 0))
      .slice(0, limit);

    return ok({ disputes: rows });
  } catch (error) {
    console.error("[ADMIN_V4_DISPUTES_FALLBACK]", {
      message: error instanceof Error ? error.message : String(error),
    });
    return ok({ disputes: [] as Array<Record<string, unknown>> });
  }
}
