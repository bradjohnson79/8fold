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
    const apiOrigin = getValidatedApiOrigin();
    const upstream = await fetch(`${apiOrigin}/api/admin/login`, {
      method: "POST",
      headers: {
        "content-type": req.headers.get("content-type") ?? "application/json",
        "x-request-id": traceId,
      },
      body: await req.text().catch(() => ""),
      cache: "no-store",
    });

    const bodyText = await upstream.text().catch(() => "");
    // IMPORTANT: Upstream 401/403 must pass through unchanged.
    // Identity and role validation is owned by apps/api.
    const res = new NextResponse(bodyText, {
      status: upstream.status,
      headers: { "content-type": upstream.headers.get("content-type") ?? "application/json" },
    });

    // Proxy layer MUST NOT mutate session cookies.
    // Session lifecycle is controlled exclusively by apps/api.
    const h: any = upstream.headers as any;
    const setCookies: string[] = typeof h.getSetCookie === "function" ? h.getSetCookie() : [];
    if (setCookies.length) {
      for (const c of setCookies) res.headers.append("set-cookie", c);
    } else {
      const sc = upstream.headers.get("set-cookie");
      if (sc) res.headers.set("set-cookie", sc);
    }
    res.headers.set("x-request-id", traceId);

    return res;
  } catch (err) {
    console.error("[ADMIN:login:error]", {
      traceId,
      message: "Failed to proxy login request",
      cause: getErrorMessage(err),
    });
    return NextResponse.json({ ok: false, error: "INTERNAL_ERROR" }, { status: 500 });
  }
}

