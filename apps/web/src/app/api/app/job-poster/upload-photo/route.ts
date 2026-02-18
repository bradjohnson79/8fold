import { NextResponse } from "next/server";
import { requireApiToken, requireSession } from "@/server/auth/requireSession";
import { apiFetch, getApiOrigin } from "@/server/api/apiClient";

export async function POST(req: Request) {
  try {
    // Auth boundary: must be logged in; role validation is owned by apps/api.
    await requireSession(req);
    const token = await requireApiToken();

    // Forward multipart body as-is (preserves boundary).
    const contentType = req.headers.get("content-type") ?? "multipart/form-data";
    const body = await req.arrayBuffer();

    const resp = await apiFetch({
      path: "/api/web/job-poster/upload-photo",
      method: "POST",
      sessionToken: token,
      headers: { "content-type": contentType },
      body,
    });

    const contentTypeOut = resp.headers.get("content-type") ?? "application/json";
    const text = await resp.text();

    // Convert API-relative URLs into absolute URLs (browser loads from apps/api origin).
    if (resp.ok && contentTypeOut.includes("application/json")) {
      try {
        const parsed = JSON.parse(text) as any;
        const url = typeof parsed?.url === "string" ? parsed.url : null;
        if (url && url.startsWith("/")) {
          return NextResponse.json({ ...parsed, url: `${getApiOrigin()}${url}` }, { status: resp.status });
        }
      } catch {
        // Fall through to pass-through.
      }
    }

    return new NextResponse(text, {
      status: resp.status,
      headers: { "Content-Type": contentTypeOut },
    });
  } catch (err) {
    const status = typeof (err as any)?.status === "number" ? (err as any).status : 500;
    const msg = err instanceof Error ? err.message : "Failed";
    return NextResponse.json({ ok: false, error: msg }, { status });
  }
}

