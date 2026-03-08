import { NextResponse } from "next/server";
import { requireAuth } from "@/src/auth/requireAuth";
import { replyToSupportTicket } from "@/src/services/v4/v4SupportService";
import { badRequest, toV4ErrorResponse, type V4Error } from "@/src/services/v4/v4Errors";

const ALLOWED_ROLES = ["JOB_POSTER", "ROUTER", "CONTRACTOR"] as const;

/**
 * POST /api/web/v4/support/ticket/[ticketId]/reply
 * User sends a reply to their support ticket thread.
 */
export async function POST(req: Request, ctx: { params: Promise<{ ticketId: string }> }) {
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
    const raw = await req.json().catch(() => ({}));
    const message = typeof raw?.message === "string" ? String(raw.message).trim() : "";
    if (!message) throw badRequest("V4_SUPPORT_MESSAGE_REQUIRED", "Message is required");

    const { messageId } = await replyToSupportTicket(ticketId, user.id, role, message);
    return NextResponse.json({ messageId });
  } catch (err) {
    const wrapped = err instanceof Error && "status" in err ? (err as V4Error) : { status: 500, code: "INTERNAL", message: "Internal error" } as V4Error;
    return NextResponse.json(toV4ErrorResponse(wrapped, requestId), { status: wrapped.status });
  }
}
