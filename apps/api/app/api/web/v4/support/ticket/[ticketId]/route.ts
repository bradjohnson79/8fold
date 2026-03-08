import { NextResponse } from "next/server";
import { requireAuth } from "@/src/auth/requireAuth";
import { getSupportTicketWithMessages } from "@/src/services/v4/v4SupportService";
import { toV4ErrorResponse, type V4Error } from "@/src/services/v4/v4Errors";

const ALLOWED_ROLES = ["JOB_POSTER", "ROUTER", "CONTRACTOR"] as const;

/**
 * GET /api/web/v4/support/ticket/[ticketId]
 * Returns a support ticket and its message thread for the authenticated user.
 */
export async function GET(req: Request, ctx: { params: Promise<{ ticketId: string }> }) {
  let requestId: string | undefined;
  try {
    const authed = await requireAuth(req);
    if (authed instanceof Response) return authed;
    requestId = authed.requestId;

    const user = authed.internalUser;
    if (!user) {
      return NextResponse.json(toV4ErrorResponse({ status: 403, code: "V4_USER_NOT_FOUND", message: "User not found" } as V4Error, requestId), { status: 403 });
    }

    const role = String(user.role ?? "").toUpperCase();
    if (!role || !ALLOWED_ROLES.includes(role as any)) {
      return NextResponse.json(toV4ErrorResponse({ status: 403, code: "V4_ROLE_MISMATCH", message: "Access denied" } as V4Error, requestId), { status: 403 });
    }

    const { ticketId } = await ctx.params;
    const result = await getSupportTicketWithMessages(ticketId, user.id);

    if (!result) {
      return NextResponse.json(toV4ErrorResponse({ status: 404, code: "V4_SUPPORT_TICKET_NOT_FOUND", message: "Ticket not found" } as V4Error, requestId), { status: 404 });
    }

    return NextResponse.json(result);
  } catch (err) {
    const wrapped = err instanceof Error && "status" in err ? (err as V4Error) : { status: 500, code: "INTERNAL", message: "Internal error" } as V4Error;
    return NextResponse.json(toV4ErrorResponse(wrapped, requestId), { status: wrapped.status });
  }
}
