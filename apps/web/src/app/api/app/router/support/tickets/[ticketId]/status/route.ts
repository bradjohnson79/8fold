import { NextResponse } from "next/server";
import { getSidFromRequest, requireSession } from "@/server/auth/requireSession";
import { apiFetch } from "@/server/api/apiClient";

function getTicketIdFromUrl(req: Request): string {
  const url = new URL(req.url);
  const parts = url.pathname.split("/");
  const idx = parts.indexOf("tickets") + 1;
  return parts[idx] ?? "";
}

export async function POST(req: Request) {
  try {
    const session = await requireSession(req);
    if (String(session.role ?? "").toUpperCase() !== "ROUTER") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const sessionToken = getSidFromRequest(req);
    if (!sessionToken) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const id = getTicketIdFromUrl(req);
    const body = await req.text();

    const resp = await apiFetch({
      target: "admin",
      path: `/api/admin/support/tickets/${id}/status`,
      method: "POST",
      sessionToken,
      request: req,
      headers: { "content-type": "application/json" },
      body,
    });

    const text = await resp.text();
    return new NextResponse(text, {
      status: resp.status,
      headers: { "Content-Type": resp.headers.get("content-type") ?? "application/json" }
    });
  } catch (e) {
    const status = (e as { status?: number })?.status ?? 500;
    const msg = e instanceof Error ? e.message : "Error";
    return NextResponse.json({ error: msg }, { status });
  }
}

