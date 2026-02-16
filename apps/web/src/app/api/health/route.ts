import { NextResponse } from "next/server";
import { apiFetch } from "@/server/api/apiClient";

export async function GET() {
  try {
    const resp = await apiFetch({ path: "/api/health", method: "GET" });
    const text = await resp.text();
    return new NextResponse(text, {
      status: resp.status,
      headers: { "Content-Type": resp.headers.get("content-type") ?? "application/json" },
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, origin: "apps-web", error: err instanceof Error ? err.message : "Failed", timestamp: Date.now() },
      { status: 500 },
    );
  }
}

