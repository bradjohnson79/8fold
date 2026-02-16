import { NextResponse } from "next/server";
import { getSidFromRequest, requireSession } from "@/server/auth/requireSession";
import { apiFetch } from "@/server/api/apiClient";

export async function GET(req: Request) {
  try {
    await requireSession(req);
    const sessionToken = getSidFromRequest(req);
    if (!sessionToken) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    const resp = await apiFetch({
      path: "/api/web/router/profile",
      method: "GET",
      sessionToken,
      request: req,
    });
    const text = await resp.text();
    return new NextResponse(text, {
      status: resp.status,
      headers: { "Content-Type": resp.headers.get("content-type") ?? "application/json" },
    });
  } catch (error) {
    const status = typeof (error as any)?.status === "number" ? (error as any).status : 500;
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Failed" },
      { status },
    );
  }
}

export async function POST(req: Request) {
  try {
    await requireSession(req);
    const sessionToken = getSidFromRequest(req);
    if (!sessionToken) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    const contentType = req.headers.get("content-type") ?? "application/json";
    const body = await req.arrayBuffer();

    const resp = await apiFetch({
      path: "/api/web/router/profile",
      method: "POST",
      sessionToken,
      request: req,
      headers: { "content-type": contentType },
      body,
    });
    const text = await resp.text();
    return new NextResponse(text, {
      status: resp.status,
      headers: { "Content-Type": resp.headers.get("content-type") ?? "application/json" },
    });
  } catch (error) {
    const status = typeof (error as any)?.status === "number" ? (error as any).status : 500;
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Failed" },
      { status },
    );
  }
}

