import { eq } from "drizzle-orm";
import { db } from "@/server/db/drizzle";
import { v4AdminSupportTickets } from "@/db/schema/v4AdminSupportTicket";
import { requireAdminV4 } from "@/src/auth/requireAdminV4";
import { err, ok } from "@/src/lib/api/adminV4Response";

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const authed = await requireAdminV4(req);
  if (authed instanceof Response) return authed;

  const { id } = await ctx.params;
  const rows = await db.select().from(v4AdminSupportTickets).where(eq(v4AdminSupportTickets.id, id)).limit(1);
  const ticket = rows[0] ?? null;
  if (!ticket) return err(404, "ADMIN_V4_SUPPORT_TICKET_NOT_FOUND", "Support ticket not found");

  return ok({ ticket });
}
