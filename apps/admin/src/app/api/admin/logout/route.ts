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

export async function POST(req: Request) {
  const traceId = getTraceId(req);
  try {
    const cookieStore = await cookies();
    // Presence guard only: admin proxy must not duplicate RBAC/identity checks.
    const session = String(cookieStore.get(ADMIN_SESSION_COOKIE_NAME)?.value ?? "").trim();
    if (!session) {
      return NextResponse.json({ ok: false, error: "UNAUTHORIZED" }, { status: 401 });
    }

    const apiOrigin = getValidatedApiOrigin();
    const upstream = await fetch(`${apiOrigin}/api/admin/logout`, {
      method: "POST",
      headers: {
        cookie: req.headers.get("cookie") ?? "",
        "x-request-id": traceId,
      },
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
    console.error("[ADMIN:logout:error]", {
      traceId,
      message: "Failed to proxy logout request",
      cause: getErrorMessage(err),
    });
    return NextResponse.json({ ok: false, error: "INTERNAL_ERROR" }, { status: 500 });
  }
}

