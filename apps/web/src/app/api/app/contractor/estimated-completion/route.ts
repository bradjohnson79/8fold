import { NextResponse } from "next/server";
import { getSidFromRequest, requireSession } from "@/server/auth/requireSession";
import { apiFetch } from "@/server/api/apiClient";

export async function GET(req: Request) {
  try {
    await requireSession(req);
    const token = getSidFromRequest(req);
    if (!token) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    const resp = await apiFetch({ path: "/api/web/contractor/estimated-completion", method: "GET", sessionToken: token, request: req });
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

export async function POST(req: Request) {
  try {
    await requireSession(req);
    const token = getSidFromRequest(req);
    if (!token) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    const contentType = req.headers.get("content-type") ?? "application/json";
    const body = await req.arrayBuffer();
    const resp = await apiFetch({
      path: "/api/web/contractor/estimated-completion",
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
