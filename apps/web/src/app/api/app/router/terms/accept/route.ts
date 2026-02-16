import { NextResponse } from "next/server";
import crypto from "node:crypto";
import "@/server/commands/routerSupportHandlers";
import { bus } from "@/server/bus/bus";
import { BusError } from "@/server/bus/errors";
import { getSidFromRequest, requireSession } from "@/server/auth/requireSession";

function getRequestIp(req: Request): string | null {
  const xfwd = req.headers.get("x-forwarded-for");
  if (xfwd) return xfwd.split(",")[0]?.trim() ?? null;
  return req.headers.get("x-real-ip");
}

export async function POST(req: Request) {
  try {
    const session = await requireSession(req);
    const sessionToken = getSidFromRequest(req);
    const requestId = crypto.randomUUID();
    await bus.dispatch({
      type: "router.terms.accept",
      payload: {},
      context: {
        requestId,
        now: new Date(),
        session: { userId: session.userId, role: session.role },
        sessionToken,
        ip: getRequestIp(req),
        userAgent: req.headers.get("user-agent"),
      },
    });
    return NextResponse.json({ ok: true }, { status: 200 });
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

