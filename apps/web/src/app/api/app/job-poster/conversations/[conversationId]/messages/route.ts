import { NextResponse } from "next/server";
import { getSidFromRequest, requireSession } from "@/server/auth/requireSession";
import { apiFetch } from "@/server/api/apiClient";

export async function POST(req: Request) {
  try {
    await requireSession(req);
    const token = getSidFromRequest(req);
    if (!token) return NextResponse.json({ ok: false, error: "Unauthorized", code: "UNAUTHENTICATED" }, { status: 401 });

    const conversationId = new URL(req.url).pathname.split("/").slice(-2)[0] ?? "";
    const contentType = req.headers.get("content-type") ?? "application/json";
    const body = await req.arrayBuffer();
    const resp = await apiFetch({
      path: `/api/web/job-poster/conversations/${encodeURIComponent(conversationId)}/messages`,
      method: "POST",
      sessionToken: token,
      request: req,
      headers: { "content-type": contentType },
      body,
    });
    const text = await resp.text();
    return new NextResponse(text, {
      status: resp.status,
      headers: { "Content-Type": resp.headers.get("content-type") ?? "application/json" },
    });
  } catch (err) {
    const status = typeof (err as any)?.status === "number" ? (err as any).status : 500;
    return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : "Failed" }, { status });
  }
}
