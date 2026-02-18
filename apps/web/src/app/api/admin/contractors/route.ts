import { NextResponse } from "next/server";
import crypto from "node:crypto";
import "@/server/commands/adminApiHandlers";
import { bus } from "@/server/bus/bus";
import { BusError } from "@/server/bus/errors";
import { requireSession } from "@/server/auth/requireSession";

export async function GET(req: Request) {
  try {
    const session = await requireSession(req);
    const url = new URL(req.url);
    const requestId = crypto.randomUUID();
    const json = await bus.dispatch({
      type: "admin.contractors.list",
      payload: { status: url.searchParams.get("status") ?? undefined, q: url.searchParams.get("q") ?? undefined },
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
    const message = e instanceof Error ? e.message : "Request failed";
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}

