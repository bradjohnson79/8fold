import { NextResponse } from "next/server";
import crypto from "node:crypto";
import "@/server/commands/routerJobsHandlers";
import { bus } from "@/server/bus/bus";
import { getSidFromRequest, requireSession } from "@/server/auth/requireSession";

export async function GET(req: Request) {
  const requestId = crypto.randomUUID();
  try {
    let userId: string | null = null;
    let role: string | null = null;
    let sessionToken: string | null = null;
    try {
      const session = await requireSession(req);
      userId = session.userId;
      role = session.role ?? null;
      sessionToken = getSidFromRequest(req);
    } catch {
      // unauthenticated → empty list
    }

    const out = await bus.dispatch({
      type: "router.jobs.routable",
      payload: {},
      context: { requestId, now: new Date(), session: userId ? { userId, role } : null, sessionToken },
    });

    const jobs = Array.isArray((out as any)?.jobs) ? (out as any).jobs : [];
    return NextResponse.json({ ok: true, jobs }, { status: 200 });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: "Failed to load routable jobs", code: "INTERNAL_ERROR", requestId },
      { status: 500 },
    );
  }
}

