import { NextResponse } from "next/server";
import { requireV4Role } from "@/src/auth/requireV4Role";
import { submitThreadCompletionReport } from "@/src/services/v4/messengerService";

export async function POST(req: Request, { params }: { params: Promise<{ threadId: string }> }) {
  const role = await requireV4Role(req, "CONTRACTOR");
  if (role instanceof Response) return role;

  const body = (await req.json().catch(() => ({}))) as {
    completedAtUTC?: string;
    completedOn?: string;
    completedTime?: string;
    summaryText?: string;
    cooperation?: unknown;
    communication?: unknown;
  };

  try {
    const { threadId } = await params;
    if (!threadId) return NextResponse.json({ ok: false, error: "threadId required" }, { status: 400 });
    const result = await submitThreadCompletionReport({
      threadId,
      userId: role.userId,
      role: "CONTRACTOR",
      completedAtUTC: body.completedAtUTC,
      completedOn: body.completedOn,
      completedTime: body.completedTime,
      summaryText: String(body.summaryText ?? ""),
      cooperation: body.cooperation,
      communication: body.communication,
    });
    return NextResponse.json(result);
  } catch (err) {
    const status = typeof (err as any)?.status === "number" ? Number((err as any).status) : 400;
    const code = typeof (err as any)?.code === "string" ? (err as any).code : undefined;
    const message = err instanceof Error ? err.message : "Failed to submit completion report";
    console.error("[completion-report-contractor]", { threadId: (await params).threadId, code, message, status });
    return NextResponse.json({ ok: false, error: message, code }, { status });
  }
}
