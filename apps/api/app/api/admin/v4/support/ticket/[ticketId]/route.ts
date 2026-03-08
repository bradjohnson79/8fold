import { requireAdminV4 } from "@/src/auth/requireAdminV4";
import { adminGetSupportTicketWithMessages, adminUpdateTicketStatus } from "@/src/services/v4/v4SupportService";
import { err, ok } from "@/src/lib/api/adminV4Response";

/**
 * GET /api/admin/v4/support/ticket/[ticketId]
 * Returns a v4 support ticket with its full message thread.
 */
export async function GET(req: Request, ctx: { params: Promise<{ ticketId: string }> }) {
  const authed = await requireAdminV4(req);
  if (authed instanceof Response) return authed;

  const { ticketId } = await ctx.params;
  const result = await adminGetSupportTicketWithMessages(ticketId);
  if (!result) return err(404, "ADMIN_V4_SUPPORT_TICKET_NOT_FOUND", "Ticket not found");
  return ok(result);
}

/**
 * PATCH /api/admin/v4/support/ticket/[ticketId]
 * Update ticket status (OPEN, RESOLVED, CLOSED, etc.).
 */
export async function PATCH(req: Request, ctx: { params: Promise<{ ticketId: string }> }) {
  const authed = await requireAdminV4(req);
  if (authed instanceof Response) return authed;

  const { ticketId } = await ctx.params;
  const raw = await req.json().catch(() => ({}));
  const status = typeof raw?.status === "string" ? String(raw.status).trim().toUpperCase() : "";
  if (!status) return err(400, "ADMIN_V4_STATUS_REQUIRED", "Status is required");

  try {
    await adminUpdateTicketStatus(ticketId, status);
    return ok({ updated: true });
  } catch (e) {
    console.error("[ADMIN_V4_SUPPORT_STATUS_UPDATE_ERROR]", e instanceof Error ? e.message : String(e));
    return err(500, "ADMIN_V4_SUPPORT_STATUS_FAILED", "Failed to update status");
  }
}
