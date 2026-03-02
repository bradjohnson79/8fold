import { NextResponse } from "next/server";
import { requireV4Role } from "@/src/auth/requireV4Role";
import { getThreadAppointment } from "@/src/services/v4/messengerService";

export async function GET(req: Request, { params }: { params: Promise<{ threadId: string }> }) {
  const role = await requireV4Role(req, "CONTRACTOR");
  if (role instanceof Response) return role;

  try {
    const { threadId } = await params;
    if (!threadId) return NextResponse.json({ ok: false, error: "threadId required" }, { status: 400 });
    const appointment = await getThreadAppointment(threadId, role.userId, "CONTRACTOR");
    return NextResponse.json({ ok: true, appointment });
  } catch (err) {
    const status = typeof (err as any)?.status === "number" ? Number((err as any).status) : 400;
    const message = err instanceof Error ? err.message : "Failed to load appointment";
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
