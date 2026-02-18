import { NextResponse } from "next/server";
import crypto from "node:crypto";
import "@/server/commands/adminApiHandlers";
import { bus } from "@/server/bus/bus";
import { BusError } from "@/server/bus/errors";
import { requireSession } from "@/server/auth/requireSession";

export async function GET(req: Request) {
  try {
    const session = await requireSession(req);
    const requestId = crypto.randomUUID();
    const json = await bus.dispatch({
      type: "admin.settings.mockRefresh.get",
      payload: {},
      context: {
        requestId,
        now: new Date(),
        session: { userId: session.userId, role: session.role },
        ip: req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
        userAgent: req.headers.get("user-agent"),
      },
    });
    return NextResponse.json(json, { status: 200 });
  } catch (e) {
    const status = e instanceof BusError ? e.status : typeof (e as any)?.status === "number" ? (e as any).status : 500;
    return NextResponse.json({ ok: false, error: "Request failed" }, { status });
  }
}

export async function POST(req: Request) {
  try {
    const session = await requireSession(req);
    const requestId = crypto.randomUUID();
    // No request body currently used (matches apps/api behavior).
    const json = await bus.dispatch({
      type: "admin.settings.mockRefresh.post",
      payload: {},
      context: {
        requestId,
        now: new Date(),
        session: { userId: session.userId, role: session.role },
        ip: req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
        userAgent: req.headers.get("user-agent"),
      },
    });
    return NextResponse.json(json, { status: 200 });
  } catch (e) {
    const status = e instanceof BusError ? e.status : typeof (e as any)?.status === "number" ? (e as any).status : 500;
    return NextResponse.json({ ok: false, error: "Request failed" }, { status });
  }
}

