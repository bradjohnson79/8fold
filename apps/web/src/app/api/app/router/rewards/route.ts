import { NextResponse } from "next/server";
import { getSidFromRequest, requireSession } from "@/server/auth/requireSession";
import { apiFetch } from "@/server/api/apiClient";

export async function GET(req: Request) {
  try {
    await requireSession(req);
    const token = getSidFromRequest(req);
    if (!token) return NextResponse.json({ ok: false, error: "Unauthorized", code: "UNAUTHENTICATED" }, { status: 401 });

    const resp = await apiFetch({
      path: "/api/web/router/rewards",
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
    const msg = err instanceof Error ? err.message : "Failed";
    return NextResponse.json({ ok: false, error: msg, code: status === 401 ? "UNAUTHORIZED" : "INTERNAL_ERROR" }, { status });
  }
}

