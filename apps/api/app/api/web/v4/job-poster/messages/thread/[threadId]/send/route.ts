import { NextResponse } from "next/server";
import { requireV4Role } from "@/src/auth/requireV4Role";
import { sendMessage } from "@/src/services/v4/v4MessageService";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ threadId: string }> },
) {
  const role = await requireV4Role(req, "JOB_POSTER");
  if (role instanceof Response) return role;

  const raw = await req.json().catch(() => ({}));
  const body = typeof raw?.body === "string" ? String(raw.body).trim() : "";
  if (!body) return NextResponse.json({ ok: false, error: "Message body is required" }, { status: 400 });

  try {
    const { threadId } = await params;
    if (!threadId) return NextResponse.json({ ok: false, error: "threadId required" }, { status: 400 });
    const { id } = await sendMessage(threadId, role.userId, body);
    return NextResponse.json({ ok: true, id });
  } catch {
    return NextResponse.json({ ok: false, error: "Failed to send message" }, { status: 400 });
  }
}
