import { NextResponse } from "next/server";
import { requireV4Role } from "@/src/auth/requireV4Role";
import { sendMessage } from "@/src/services/v4/v4MessageService";
import { badRequest, internal, toV4ErrorResponse, type V4Error } from "@/src/services/v4/v4Errors";

async function requireV4MessageActor(req: Request) {
  const contractor = await requireV4Role(req, "CONTRACTOR");
  if (!(contractor instanceof Response)) return contractor;
  const jobPoster = await requireV4Role(req, "JOB_POSTER");
  if (!(jobPoster instanceof Response)) return jobPoster;
  return contractor;
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ threadId: string }> }
) {
  let requestId: string | undefined;
  try {
    const role = await requireV4MessageActor(req);
    if (role instanceof Response) return role;
    requestId = role.requestId;
    const { threadId } = await params;
    if (!threadId) return NextResponse.json({ error: "threadId required" }, { status: 400 });
    const raw = await req.json().catch(() => ({}));
    const body = typeof raw?.body === "string" ? String(raw.body).trim() : "";
    if (!body) throw badRequest("V4_MESSAGE_BODY_REQUIRED", "Message body is required");
    const { id } = await sendMessage(threadId, role.userId, body);
    return NextResponse.json({ id });
  } catch (err) {
    const wrapped = err instanceof Error && "status" in err ? (err as V4Error) : internal("V4_MESSAGES_SEND_FAILED");
    return NextResponse.json(toV4ErrorResponse(wrapped, requestId), { status: wrapped.status });
  }
}
