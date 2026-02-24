import { NextResponse } from "next/server";
import { requireApiToken, requireSession } from "@/server/auth/requireSession";
import { apiFetch } from "@/server/api/apiClient";

/**
 * V4 proxy to isolated contractor profile endpoint.
 * Targets /api/web/v4/contractor/profile.
 */
export async function GET(req: Request) {
  try {
    await requireSession(req);
    const token = await requireApiToken();
    const resp = await apiFetch({ path: "/api/web/v4/contractor/profile", method: "GET", sessionToken: token });
    const text = await resp.text();
    return new NextResponse(text, { status: resp.status, headers: { "Content-Type": resp.headers.get("content-type") ?? "application/json" } });
  } catch (err) {
    const status = typeof (err as any)?.status === "number" ? (err as any).status : 500;
    const msg = err instanceof Error ? err.message : "Failed";
    return NextResponse.json({ error: msg }, { status });
  }
}

export async function PUT(req: Request) {
  try {
    await requireSession(req);
    const token = await requireApiToken();
    const body = await req.text();
    const resp = await apiFetch({
      path: "/api/web/v4/contractor/profile",
      method: "PUT",
      sessionToken: token,
      headers: { "content-type": req.headers.get("content-type") ?? "application/json" },
      body,
    });
    const text = await resp.text();
    return new NextResponse(text, { status: resp.status, headers: { "Content-Type": resp.headers.get("content-type") ?? "application/json" } });
  } catch (err) {
    const status = typeof (err as any)?.status === "number" ? (err as any).status : 500;
    const msg = err instanceof Error ? err.message : "Failed";
    return NextResponse.json({ error: msg }, { status });
  }
}
