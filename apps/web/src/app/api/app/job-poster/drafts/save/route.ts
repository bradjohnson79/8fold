import { NextResponse } from "next/server";
import { requireApiToken, requireSession } from "@/server/auth/requireSession";
import { apiFetch } from "@/server/api/apiClient";

export async function POST(req: Request) {
  try {
    await requireSession(req);
    const token = await requireApiToken();

    const contentType = req.headers.get("content-type") ?? "application/json";
    const body = await req.arrayBuffer();
    const resp = await apiFetch({
      path: "/api/web/job-poster/drafts/save",
      method: "POST",
      sessionToken: token,
      headers: { "content-type": contentType },
      body,
      request: req,
    });
    const text = await resp.text();
    if (process.env.NODE_ENV !== "production" && !resp.ok) {
      // Dev-only: surface upstream errors without leaking secrets.
      // eslint-disable-next-line no-console
      console.error("[WEB PROXY] upstream error", {
        path: "/api/web/job-poster/drafts/save",
        status: resp.status,
        body: text.slice(0, 800),
      });
    }
    return new NextResponse(text, {
      status: resp.status,
      headers: { "Content-Type": resp.headers.get("content-type") ?? "application/json" },
    });
  } catch (err) {
    const status = typeof (err as any)?.status === "number" ? (err as any).status : 500;
    return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : "Failed" }, { status });
  }
}

