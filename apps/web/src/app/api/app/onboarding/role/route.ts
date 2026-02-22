import { NextResponse } from "next/server";
import { apiFetch, getApiOrigin } from "@/server/api/apiClient";
import { requireApiToken } from "@/server/auth/requireSession";

export async function POST(req: Request) {
  // eslint-disable-next-line no-console
  console.log("ONBOARDING_ROUTE_EXECUTED:: /api/app/onboarding/role");
  // eslint-disable-next-line no-console
  console.log("WEB_ONBOARDING_START", {
    method: req.method,
    path: "/api/app/onboarding/role",
  });

  let token = "";
  try {
    token = await requireApiToken();
  } catch (err) {
    const status = typeof (err as any)?.status === "number" ? (err as any).status : 401;
    const code = typeof (err as any)?.code === "string" ? String((err as any).code) : "AUTH_MISSING_TOKEN";
    return NextResponse.json({ ok: false, error: { code, message: "Unauthorized" } }, { status });
  }
  // eslint-disable-next-line no-console
  console.log("WEB_SESSION_TOKEN", {
    present: Boolean(token),
    length: token.length,
  });

  const body = await req.text().catch(() => "");
  try {
    const apiOrigin = getApiOrigin();
    // eslint-disable-next-line no-console
    console.log("WEB_FORWARDING_TO_API", {
      origin: apiOrigin,
      path: "/api/onboarding/role",
    });
    const resp = await apiFetch({
      path: "/api/onboarding/role",
      method: "POST",
      sessionToken: token,
      headers: { "content-type": "application/json" },
      body,
    });

    // eslint-disable-next-line no-console
    console.log("WEB_API_RESPONSE_STATUS", {
      status: resp.status,
      ok: resp.ok,
    });
    const upstreamText = await resp.text().catch(() => "");
    // eslint-disable-next-line no-console
    console.log("WEB_API_RESPONSE_BODY", upstreamText);
    return new NextResponse(upstreamText, {
      status: resp.status,
      headers: {
        "content-type": resp.headers.get("content-type") ?? "application/json",
        "x-request-id": resp.headers.get("x-request-id") ?? "",
      },
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("ONBOARDING_PROXY_ERROR::", {
      message: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json(
      { ok: false, error: { message: "Upstream request failed", code: "PROXY_ERROR" } },
      { status: 502 },
    );
  }
}

