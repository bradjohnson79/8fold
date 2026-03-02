import { eq } from "drizzle-orm";
import { db } from "@/server/db/drizzle";
import { disputes } from "@/db/schema/dispute";
import { v4AdminDisputes } from "@/db/schema/v4AdminDispute";
import { requireAdminV4 } from "@/src/auth/requireAdminV4";
import { err, ok } from "@/src/lib/api/adminV4Response";

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const authed = await requireAdminV4(req);
  if (authed instanceof Response) return authed;

  const { id } = await ctx.params;
  const [legacyRows, messengerRows] = await Promise.all([
    db.select().from(v4AdminDisputes).where(eq(v4AdminDisputes.id, id)).limit(1),
    db
      .select({
        id: disputes.id,
        userId: disputes.userId,
        role: disputes.role,
        jobId: disputes.jobId,
        conversationId: disputes.conversationId,
        subject: disputes.subject,
        message: disputes.message,
        status: disputes.status,
        createdAt: disputes.createdAt,
      })
      .from(disputes)
      .where(eq(disputes.id, id))
      .limit(1),
  ]);
  const legacy = legacyRows[0] ?? null;
  const messenger = messengerRows[0] ?? null;
  const dispute = legacy
    ? { ...legacy, source: "LEGACY_SUPPORT_DISPUTE" }
    : messenger
      ? { ...messenger, source: "MESSENGER_DISPUTE" }
      : null;
  if (!dispute) return err(404, "ADMIN_V4_DISPUTE_NOT_FOUND", "Dispute not found");

  return ok({ dispute });
}
