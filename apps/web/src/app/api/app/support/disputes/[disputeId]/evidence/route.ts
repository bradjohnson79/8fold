import { NextResponse } from "next/server";
import { getSidFromRequest, requireSession } from "@/server/auth/requireSession";
import { apiFetch } from "@/server/api/apiClient";

function getDisputeIdFromUrl(req: Request): string {
  const url = new URL(req.url);
  const parts = url.pathname.split("/");
  const idx = parts.indexOf("disputes") + 1;
  return parts[idx] ?? "";
}

export async function GET(req: Request) {
  try {
    await requireSession(req);
    const token = getSidFromRequest(req);
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const disputeId = getDisputeIdFromUrl(req);
    if (!disputeId) return NextResponse.json({ error: "Missing dispute id" }, { status: 400 });

    const resp = await apiFetch({
      path: `/api/web/support/disputes/${encodeURIComponent(disputeId)}/evidence`,
      method: "GET",
      sessionToken: token,
      request: req,
    });
    const text = await resp.text();
    return new NextResponse(text, {
      status: resp.status,
      headers: { "Content-Type": resp.headers.get("content-type") ?? "application/json" },
    });
  } catch (err) {
    const status = typeof (err as any)?.status === "number" ? (err as any).status : 500;
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed" }, { status });
  }
}

export async function POST(req: Request) {
  try {
    await requireSession(req);
    const token = getSidFromRequest(req);
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const disputeId = getDisputeIdFromUrl(req);
    if (!disputeId) return NextResponse.json({ error: "Missing dispute id" }, { status: 400 });

    const contentType = req.headers.get("content-type") ?? "application/json";
    const body = await req.arrayBuffer();
    const resp = await apiFetch({
      path: `/api/web/support/disputes/${encodeURIComponent(disputeId)}/evidence`,
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
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed" }, { status });
  }
}
