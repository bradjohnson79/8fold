import { NextResponse } from "next/server";
import { requireSession, getSidFromRequest } from "@/server/auth/requireSession";
import { apiFetch } from "@/server/api/apiClient";

export async function GET(req: Request) {
  try {
    await requireSession(req);
    const token = getSidFromRequest(req);
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const resp = await apiFetch({
      path: "/api/web/job-poster/materials/pending",
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
    return NextResponse.json({ error: msg }, { status });
  }
}
