import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { randomUUID } from "node:crypto";
import { ADMIN_SESSION_COOKIE_NAME } from "@/server/adminSession";
import { getValidatedApiOrigin } from "@/server/env";

function getTraceId(req: Request): string {
  // Phase 16.4: Trace ID propagated for cross-service observability.
  // Prefer x-request-id when both are present.
  const incoming = req.headers.get("x-request-id") ?? req.headers.get("x-trace-id");
  const traceId = String(incoming ?? "").trim();
  return traceId || randomUUID();
}

function getErrorMessage(err: unknown): string {
  if (err instanceof Error && err.message) return err.message;
  return "Unknown error";
}

export async function GET(req: Request) {
  const traceId = getTraceId(req);
  try {
    const cookieStore = await cookies();
    // Presence guard only: admin proxy must not duplicate RBAC/identity checks.
    const session = String(cookieStore.get(ADMIN_SESSION_COOKIE_NAME)?.value ?? "").trim();
    if (!session) {
      return NextResponse.json({ ok: false, error: "UNAUTHORIZED" }, { status: 401 });
    }

    const apiOrigin = getValidatedApiOrigin();
    // Proxy layer MUST NOT mutate session cookies.
    // Session lifecycle is controlled exclusively by apps/api.
    const upstream = await fetch(`${apiOrigin}/api/admin/me`, {
      method: "GET",
      headers: {
        cookie: req.headers.get("cookie") ?? "",
        "x-request-id": traceId,
      },
      cache: "no-store",
    });

    const bodyText = await upstream.text().catch(() => "");
    // IMPORTANT: Upstream 401/403 must pass through unchanged.
    // Identity and role validation is owned by apps/api.
    const response = new NextResponse(bodyText, {
      status: upstream.status,
      headers: { "content-type": upstream.headers.get("content-type") ?? "application/json" },
    });
    response.headers.set("x-request-id", traceId);
    return response;
  } catch (err) {
    console.error("[ADMIN:me:error]", {
      traceId,
      message: "Failed to proxy me request",
      cause: getErrorMessage(err),
    });
    return NextResponse.json({ ok: false, error: "INTERNAL_ERROR" }, { status: 500 });
  }
}

