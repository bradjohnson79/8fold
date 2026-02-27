import { NextResponse } from "next/server";
import { requireApiToken, requireSession } from "@/server/auth/requireSession";
import { apiFetch } from "@/server/api/apiClient";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    await requireSession(req);
    const sessionToken = await requireApiToken();
    const contentType = req.headers.get("content-type") ?? "application/json";
    const body = await req.arrayBuffer();
    const resp = await apiFetch({
      path: "/api/web/v4/contractor/accept-invite",
      method: "POST",
      sessionToken,
      headers: { "content-type": contentType },
      body,
      request: req,
    });
    const text = await resp.text();
    return new NextResponse(text, {
      status: resp.status,
      headers: { "Content-Type": resp.headers.get("content-type") ?? "application/json" },
    });
  } catch (err) {
    const status = typeof (err as any)?.status === "number" ? (err as any).status : 500;
    const code = typeof (err as any)?.code === "string" ? (err as any).code : "UPLOAD_PROXY_FAILED";
    const message = err instanceof Error ? err.message : "Upload proxy failed";
    console.error("[web] upload proxy failed", { status, code, message });
    return NextResponse.json({ ok: false, error: { code, message } }, { status });
  }
}
