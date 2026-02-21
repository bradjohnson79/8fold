import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { apiFetch } from "@/server/api/apiClient";

export async function GET(req: Request) {
  const traceId = randomUUID();
  try {
    const resp = await apiFetch({
      path: "/api/_diag/build",
      method: "GET",
      request: req,
    });
    const text = await resp.text();
    return new NextResponse(text, {
      status: resp.status,
      headers: { "Content-Type": resp.headers.get("content-type") ?? "application/json" },
    });
  } catch (err) {
    return NextResponse.json(
      {
        success: false,
        code: "BUILD_DIAG_PROXY_FAILED",
        traceId,
        message: err instanceof Error ? err.message : "unknown",
      },
      { status: 500 }
    );
  }
}
