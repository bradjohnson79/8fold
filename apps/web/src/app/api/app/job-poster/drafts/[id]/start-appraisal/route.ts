import { NextResponse } from "next/server";
import { requireApiToken, requireSession } from "@/server/auth/requireSession";
import { apiFetch } from "@/server/api/apiClient";

function getDraftIdFromUrl(req: Request): string {
  const parts = new URL(req.url).pathname.split("/").filter(Boolean);
  const idx = parts.indexOf("drafts");
  return idx >= 0 ? (parts[idx + 1] ?? "") : "";
}

export async function POST(req: Request) {
  try {
    await requireSession(req);
    const token = await requireApiToken();
    const id = getDraftIdFromUrl(req);

    const contentType = req.headers.get("content-type") ?? "application/json";
    const body = await req.arrayBuffer();
    const resp = await apiFetch({
      path: `/api/web/job-poster/drafts/${encodeURIComponent(id)}/start-appraisal`,
      method: "POST",
      sessionToken: token,
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
    return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : "Failed" }, { status });
  }
}

