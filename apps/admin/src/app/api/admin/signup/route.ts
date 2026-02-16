import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
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

export async function POST(req: Request) {
  const traceId = getTraceId(req);
  try {
    const rawBody = await req.text().catch(() => "");
    const parsed = rawBody ? (JSON.parse(rawBody) as { adminSecret?: unknown }) : null;
    const adminSecret = typeof parsed?.adminSecret === "string" ? parsed.adminSecret.trim() : "";
    if (!adminSecret) {
      return NextResponse.json({ ok: false, error: "MISSING_ADMIN_SECRET" }, { status: 400 });
    }

    const apiOrigin = getValidatedApiOrigin();
    // Proxy layer MUST NOT mutate session cookies.
    // Session lifecycle is controlled exclusively by apps/api.
    const upstream = await fetch(`${apiOrigin}/api/admin/signup`, {
      method: "POST",
      headers: {
        "content-type": req.headers.get("content-type") ?? "application/json",
        "x-request-id": traceId,
      },
      body: rawBody,
      cache: "no-store",
    });

    const bodyText = await upstream.text().catch(() => "");
    // IMPORTANT: Upstream 401/403 must pass through unchanged.
    // Identity and role validation is owned by apps/api.
    const res = new NextResponse(bodyText, {
      status: upstream.status,
      headers: { "content-type": upstream.headers.get("content-type") ?? "application/json" },
    });
    res.headers.set("x-request-id", traceId);
    return res;
  } catch (err) {
    const isSyntax = err instanceof SyntaxError;
    if (isSyntax) {
      return NextResponse.json({ ok: false, error: "INVALID_JSON" }, { status: 400 });
    }
    console.error("[ADMIN:signup:error]", {
      traceId,
      message: "Failed to proxy signup request",
      cause: getErrorMessage(err),
    });
    return NextResponse.json({ ok: false, error: "INTERNAL_ERROR" }, { status: 500 });
  }
}

