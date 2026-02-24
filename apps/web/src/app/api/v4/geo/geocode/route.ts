import { NextResponse } from "next/server";
import { requireApiToken, requireSession } from "@/server/auth/requireSession";
import { apiFetch } from "@/server/api/apiClient";

export async function POST(req: Request) {
  try {
    await requireSession(req);
    const sessionToken = await requireApiToken();
    const body = await req.text();
    const resp = await apiFetch({
      path: "/api/web/v4/geo/geocode",
      method: "POST",
      sessionToken,
      headers: { "content-type": req.headers.get("content-type") ?? "application/json" },
      body,
    });
    const text = await resp.text();
    return new NextResponse(text, {
      status: resp.status,
      headers: { "Content-Type": resp.headers.get("content-type") ?? "application/json" },
    });
  } catch (err) {
    const status = typeof (err as any)?.status === "number" ? (err as any).status : 500;
    return NextResponse.json({ ok: false, error: "PROXY_FAILED" }, { status });
  }
}
