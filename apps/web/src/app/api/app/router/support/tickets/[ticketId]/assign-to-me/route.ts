import { NextResponse } from "next/server";
import crypto from "node:crypto";
import "@/server/commands/routerSupportHandlers";
import { bus } from "@/server/bus/bus";
import { BusError } from "@/server/bus/errors";
import { getSidFromRequest, requireSession } from "@/server/auth/requireSession";

function getTicketIdFromUrl(req: Request): string {
  const url = new URL(req.url);
  const parts = url.pathname.split("/");
  const idx = parts.indexOf("tickets") + 1;
  return parts[idx] ?? "";
}

export async function POST(req: Request) {
  try {
    const session = await requireSession(req);
    const sessionToken = getSidFromRequest(req);
    const id = getTicketIdFromUrl(req);

    const requestId = crypto.randomUUID();
    const result = await bus.dispatch({
      type: "router.support.ticket.assignToMe",
      payload: { ticketId: id },
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

