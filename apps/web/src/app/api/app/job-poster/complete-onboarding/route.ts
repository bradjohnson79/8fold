import { NextResponse } from "next/server";
import { requireSession } from "@/server/auth/requireSession";

function asRole(roleRaw: unknown): string {
  return String(roleRaw ?? "").trim().toUpperCase();
}

export async function POST(req: Request) {
  try {
    const session = await requireSession(req);
    const role = asRole(session.role);
    if (role !== "JOB_POSTER" && role !== "ADMIN") {
      return NextResponse.json({ ok: false, error: "Forbidden", code: "ROLE_MISMATCH" }, { status: 403 });
    }
    // apps/web is DB-free; onboarding completion is derived server-side in apps/api.
    // This endpoint exists to preserve client behavior; it intentionally performs no writes.
    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (err) {
    const status = typeof (err as any)?.status === "number" ? (err as any).status : 500;
    const msg = err instanceof Error ? err.message : "Failed";
    return NextResponse.json({ ok: false, error: msg, code: status === 401 ? "UNAUTHORIZED" : "INTERNAL_ERROR" }, { status });
  }
}
