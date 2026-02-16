import { NextResponse } from "next/server";
import crypto from "node:crypto";
import "@/server/commands/routerSupportHandlers";
import { bus } from "@/server/bus/bus";
import { BusError } from "@/server/bus/errors";
import { getSidFromRequest, requireSession } from "@/server/auth/requireSession";

// Alias for legacy/alternate path: /api/app/router_port/inbox
// Mirrors /api/app/router/support/inbox
export async function GET(req: Request) {
  try {
    const session = await requireSession(req);
    const sessionToken = getSidFromRequest(req);
    const url = new URL(req.url);
    const status = url.searchParams.get("status") ?? "";
    const type = url.searchParams.get("type") ?? "";

    const requestId = crypto.randomUUID();
    const result = await bus.dispatch({
      type: "router.support.inbox.list",
      payload: { status, type },
      context: {
        requestId,
        now: new Date(),
        session: { userId: session.userId, role: session.role },
        sessionToken,
        ip: req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
        userAgent: req.headers.get("user-agent"),
      },
    });

    return NextResponse.json(result, { status: 200 });
  } catch (e) {
    const status =
      typeof (e as any)?.status === "number"
        ? (e as any).status
        : e instanceof BusError
          ? e.status
          : 500;
    const msg = e instanceof Error ? e.message : "Error";
    return NextResponse.json({ error: msg }, { status });
  }
}

