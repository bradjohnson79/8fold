import { NextResponse } from "next/server";
import { requireV4Role } from "@/src/auth/requireV4Role";
import { createSupportTicket } from "@/src/services/v4/v4SupportService";
import { badRequest, internal, toV4ErrorResponse, type V4Error } from "@/src/services/v4/v4Errors";

export async function POST(req: Request) {
  let requestId: string | undefined;
  try {
    const role = await requireV4Role(req, "JOB_POSTER");
    if (role instanceof Response) return role;
    requestId = role.requestId;
    const raw = await req.json().catch(() => ({}));
    const subject = typeof raw?.subject === "string" ? String(raw.subject).trim() : "";
    const category = typeof raw?.category === "string" ? String(raw.category).trim() : "general";
    const body = typeof raw?.body === "string" ? String(raw.body).trim() : "";
    if (!subject) throw badRequest("V4_SUPPORT_SUBJECT_REQUIRED", "Subject is required");
    if (!body) throw badRequest("V4_SUPPORT_BODY_REQUIRED", "Body is required");
    const { id } = await createSupportTicket(role.userId, "JOB_POSTER", subject, category, body);
    return NextResponse.json({ id });
  } catch (err) {
    const wrapped = err instanceof Error && "status" in err ? (err as V4Error) : internal("V4_SUPPORT_TICKET_FAILED");
    return NextResponse.json(toV4ErrorResponse(wrapped, requestId), { status: wrapped.status });
  }
}
