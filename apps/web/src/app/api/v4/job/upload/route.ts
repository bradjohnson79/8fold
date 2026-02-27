import { NextResponse } from "next/server";
import { requireApiToken, requireSession } from "@/server/auth/requireSession";
import { apiFetch, getApiOrigin } from "@/server/api/apiClient";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    await requireSession(req);
    const sessionToken = await requireApiToken();
    const contentType = req.headers.get("content-type") ?? "multipart/form-data";
    const body = await req.arrayBuffer();
    const resp = await apiFetch({
      path: "/api/web/v4/job/upload",
      method: "POST",
      sessionToken,
      headers: { "content-type": contentType },
      body,
    });
    const contentTypeOut = resp.headers.get("content-type") ?? "application/json";
    const text = await resp.text();
    if (resp.ok && contentTypeOut.includes("application/json")) {
      try {
        const parsed = JSON.parse(text) as any;
        const url = typeof parsed?.url === "string" ? parsed.url : null;
        if (url && url.startsWith("/")) {
          return NextResponse.json({ ...parsed, url: `${getApiOrigin()}${url}` }, { status: resp.status });
        }
      } catch {}
    }
    return new NextResponse(text, {
      status: resp.status,
      headers: { "Content-Type": contentTypeOut },
    });
  } catch (err) {
    const status = typeof (err as any)?.status === "number" ? (err as any).status : 500;
    const code = typeof (err as any)?.code === "string" ? (err as any).code : "UPLOAD_PROXY_FAILED";
    const message = err instanceof Error ? err.message : "Upload proxy failed";
    console.error("[web] upload proxy failed", { status, code, message });
    return NextResponse.json({ ok: false, error: { code, message } }, { status });
  }
}
