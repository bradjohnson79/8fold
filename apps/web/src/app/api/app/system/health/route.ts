import { NextResponse } from "next/server";
import { apiFetch } from "@/server/api/apiClient";

export async function GET(req: Request) {
  try {
    const resp = await apiFetch({ path: "/api/system/health", method: "GET", request: req });
    const text = await resp.text();
    return new NextResponse(text, {
      status: resp.status,
      headers: { "Content-Type": resp.headers.get("content-type") ?? "application/json" },
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Failed", code: "UPSTREAM_UNREACHABLE" },
      { status: 424 },
    );
  }
}

