import { NextResponse } from "next/server";
import { requireAuth } from "@/src/auth/requireAuth";
import { createSupportTicket } from "@/src/services/v4/v4SupportService";
import { badRequest, internal, toV4ErrorResponse, type V4Error } from "@/src/services/v4/v4Errors";

const ALLOWED_ROLES = ["JOB_POSTER", "ROUTER", "CONTRACTOR"] as const;

export async function POST(req: Request) {
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

    const raw = await req.json().catch(() => ({}));
    const subject = typeof raw?.subject === "string" ? String(raw.subject).trim() : "";
    const category = typeof raw?.category === "string" ? String(raw.category).trim() : "GENERAL INQUIRY";
    const body = typeof raw?.body === "string" ? String(raw.body).trim() : "";
    const jobId = typeof raw?.jobId === "string" ? String(raw.jobId).trim() : null;
    const conversationId = typeof raw?.conversationId === "string" ? String(raw.conversationId).trim() : null;
    const attachmentPointers = raw?.attachmentPointers;
    if (!subject) throw badRequest("V4_SUPPORT_SUBJECT_REQUIRED", "Subject is required");
    if (!body) throw badRequest("V4_SUPPORT_BODY_REQUIRED", "Body is required");

    const { id, routedTo } = await createSupportTicket(user.id, role, subject, category, body, {
      jobId,
      conversationId,
      attachmentPointers,
    });
    return NextResponse.json({ id, routedTo });
  } catch (err) {
    const wrapped = err instanceof Error && "status" in err ? (err as V4Error) : internal("V4_SUPPORT_TICKET_FAILED");
    return NextResponse.json(toV4ErrorResponse(wrapped, requestId), { status: wrapped.status });
  }
}
