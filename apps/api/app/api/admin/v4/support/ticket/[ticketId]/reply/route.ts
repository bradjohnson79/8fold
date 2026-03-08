import { NextResponse } from "next/server";
import { requireAdminV4 } from "@/src/auth/requireAdminV4";
import { adminReplyToSupportTicket } from "@/src/services/v4/v4SupportService";
import { err, ok } from "@/src/lib/api/adminV4Response";

/**
 * POST /api/admin/v4/support/ticket/[ticketId]/reply
 * Admin sends a reply to a user's support ticket thread.
 */
export async function POST(req: Request, ctx: { params: Promise<{ ticketId: string }> }) {
  const authed = await requireAdminV4(req);
  if (authed instanceof Response) return authed;

  const { ticketId } = await ctx.params;
  const raw = await req.json().catch(() => ({}));
  const message = typeof raw?.message === "string" ? String(raw.message).trim() : "";
  if (!message) return err(400, "ADMIN_V4_SUPPORT_REPLY_REQUIRED", "Message is required");

  try {
    const { messageId, recipientUserId } = await adminReplyToSupportTicket(ticketId, authed.adminId, message);
    return ok({ messageId, recipientUserId });
  } catch (e) {
    const status = (e instanceof Error && "status" in e) ? (e as any).status : 500;
    if (status === 404) return err(404, "ADMIN_V4_SUPPORT_TICKET_NOT_FOUND", "Ticket not found");
    console.error("[ADMIN_V4_SUPPORT_REPLY_ERROR]", e instanceof Error ? e.message : String(e));
    return err(500, "ADMIN_V4_SUPPORT_REPLY_FAILED", "Failed to send reply");
  }
}
