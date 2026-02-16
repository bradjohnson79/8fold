import { NextResponse } from "next/server";
import { getSidFromRequest, requireSession } from "@/server/auth/requireSession";
import { apiFetch } from "@/server/api/apiClient";

function getAttachmentIdFromUrl(req: Request): string {
  const url = new URL(req.url);
  const parts = url.pathname.split("/");
  const idx = parts.indexOf("attachments") + 1;
  return parts[idx] ?? "";
}

export async function GET(req: Request) {
  try {
    await requireSession(req);
    const token = getSidFromRequest(req);
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const attachmentId = getAttachmentIdFromUrl(req);
    if (!attachmentId) return NextResponse.json({ error: "Missing attachment id" }, { status: 400 });

    const resp = await apiFetch({
      path: `/api/web/support/attachments/${encodeURIComponent(attachmentId)}`,
      method: "GET",
      sessionToken: token,
      request: req,
    });
    const body = await resp.arrayBuffer();
    return new NextResponse(body, {
      status: resp.status,
      headers: { "Content-Type": resp.headers.get("content-type") ?? "application/octet-stream" },
    });
  } catch (err) {
    const status = typeof (err as any)?.status === "number" ? (err as any).status : 500;
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed" }, { status });
  }
}
