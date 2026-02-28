import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/server/db/drizzle";
import { v4AdminSupportTickets } from "@/db/schema/v4AdminSupportTicket";
import { requireAdminV4 } from "@/src/auth/requireAdminV4";
import { err, ok } from "@/src/lib/api/adminV4Response";

const BodySchema = z.object({
  status: z.string().trim().min(1),
});

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const authed = await requireAdminV4(req);
  if (authed instanceof Response) return authed;

  const { id } = await ctx.params;
  const raw = await req.json().catch(() => null);
  const parsed = BodySchema.safeParse(raw);
  if (!parsed.success) return err(400, "ADMIN_V4_INVALID_REQUEST", "Invalid status payload");

  const rows = await db
    .update(v4AdminSupportTickets)
    .set({ status: parsed.data.status, updatedAt: new Date() })
    .where(and(eq(v4AdminSupportTickets.id, id)))
    .returning();

  const ticket = rows[0] ?? null;
  if (!ticket) return err(404, "ADMIN_V4_SUPPORT_TICKET_NOT_FOUND", "Support ticket not found");

  return ok({ ticket });
}
