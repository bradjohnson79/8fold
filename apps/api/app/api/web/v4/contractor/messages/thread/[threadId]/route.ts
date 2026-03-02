import { NextResponse } from "next/server";
import { requireV4Role } from "@/src/auth/requireV4Role";
import { getThreadMessagesByThreadId } from "@/src/services/v4/v4MessageService";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ threadId: string }> },
) {
  const role = await requireV4Role(req, "CONTRACTOR");
  if (role instanceof Response) return role;

  try {
    const { threadId } = await params;
    if (!threadId) return NextResponse.json({ ok: false, error: "threadId required" }, { status: 400 });
    const messages = await getThreadMessagesByThreadId(threadId, role.userId);
    return NextResponse.json({
      ok: true,
      messages: messages.map((m) => ({
        id: m.id,
        threadId: m.threadId,
        jobId: m.jobId,
        fromUserId: m.fromUserId,
        toUserId: m.toUserId,
        senderRole: m.senderRole,
        body: m.body,
        createdAt: m.createdAt.toISOString(),
        readAt: m.readAt?.toISOString() ?? null,
      })),
    });
  } catch {
    return NextResponse.json({ ok: true, messages: [] }, { status: 200 });
  }
}
