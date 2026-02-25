import { NextResponse } from "next/server";
import { requireV4Role } from "@/src/auth/requireV4Role";
import { getThreadMessagesByThreadId } from "@/src/services/v4/v4MessageService";
import { internal, toV4ErrorResponse, type V4Error } from "@/src/services/v4/v4Errors";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ threadId: string }> }
) {
  let requestId: string | undefined;
  try {
    const role = await requireV4Role(req, "JOB_POSTER");
    if (role instanceof Response) return role;
    requestId = role.requestId;
    const { threadId } = await params;
    if (!threadId) return NextResponse.json({ error: "threadId required" }, { status: 400 });
    const messages = await getThreadMessagesByThreadId(threadId, role.userId);
    return NextResponse.json({
      messages: messages.map((m) => ({
        id: m.id,
        jobId: m.jobId,
        fromUserId: m.fromUserId,
        toUserId: m.toUserId,
        body: m.body,
        createdAt: m.createdAt.toISOString(),
        readAt: m.readAt?.toISOString() ?? null,
      })),
    });
  } catch (err) {
    const wrapped = err instanceof Error && "status" in err ? (err as V4Error) : internal("V4_MESSAGES_THREAD_FAILED");
    return NextResponse.json(toV4ErrorResponse(wrapped, requestId), { status: wrapped.status });
  }
}
