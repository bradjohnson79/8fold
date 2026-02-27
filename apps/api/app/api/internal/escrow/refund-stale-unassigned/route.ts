import { NextResponse } from "next/server";
import { refundStaleUnassignedJobs } from "@/src/services/escrow/refundService";

function isAuthorizedInternal(req: Request): boolean {
  const expected = String(process.env.INTERNAL_SECRET ?? "").trim();
  if (!expected) return false;
  const provided = String(req.headers.get("x-internal-secret") ?? "").trim();
  return Boolean(provided && provided === expected);
}

export async function POST(req: Request) {
  if (!isAuthorizedInternal(req)) {
    return NextResponse.json({ ok: false, error: "FORBIDDEN" }, { status: 403 });
  }

  try {
    const result = await refundStaleUnassignedJobs(new Date());
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    const status = typeof (err as any)?.status === "number" ? (err as any).status : 500;
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Failed to refund stale unassigned jobs" },
      { status },
    );
  }
}
