import { NextResponse } from "next/server";
import { requireSession } from "./meSession";

export async function requireJobPosterAccount(req: Request): Promise<
  | { userId: string; role: string }
  | NextResponse
> {
  let session;
  try {
    session = await requireSession(req);
  } catch (err) {
    const status = typeof (err as any)?.status === "number" ? (err as any).status : 401;
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status });
  }

  // Transport-only helper: apps/web should not re-implement onboarding.
  // API is authoritative for onboarding + role gating; apps/web only ensures an authenticated session exists.
  return { userId: session.userId, role: String(session.role ?? "") };
}
