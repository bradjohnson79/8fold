import { NextResponse } from "next/server";
import { requireV4Role } from "@/src/auth/requireV4Role";
import { bookThreadAppointment } from "@/src/services/v4/messengerService";

export async function POST(req: Request, { params }: { params: Promise<{ threadId: string }> }) {
  const role = await requireV4Role(req, "CONTRACTOR");
  if (role instanceof Response) return role;

  const body = (await req.json().catch(() => ({}))) as { scheduledAtUTC?: string };

  try {
    const { threadId } = await params;
    if (!threadId) return NextResponse.json({ ok: false, error: "threadId required" }, { status: 400 });
    const result = await bookThreadAppointment({
      threadId,
      userId: role.userId,
      role: "CONTRACTOR",
      scheduledAtUTC: String(body.scheduledAtUTC ?? ""),
    });
    return NextResponse.json(result);
  } catch (err) {
    const status = typeof (err as any)?.status === "number" ? Number((err as any).status) : 400;
    const message = err instanceof Error ? err.message : "Failed to book appointment";
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
