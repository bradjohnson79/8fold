import { NextResponse } from "next/server";
import { apiFetch } from "@/server/api/apiClient";

export async function GET() {
  try {
    const resp = await apiFetch({
      path: "/api/web/v4/meta/trade-categories",
      method: "GET",
    });
    const text = await resp.text();
    return new NextResponse(text, {
      status: resp.status,
      headers: { "Content-Type": resp.headers.get("content-type") ?? "application/json" },
    });
  } catch (err) {
    return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : "PROXY_FAILED" }, { status: 500 });
  }
}
