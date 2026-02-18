import { NextResponse } from "next/server";
import { apiFetch } from "@/server/api/apiClient";
import { requireApiToken } from "@/server/auth/requireSession";

// Web-owned "who am I" endpoint (proxy to apps/api `/api/me`).
// Deliberately does NOT expose any other identities.
export async function GET(req: Request) {
  let token = "";
  try {
    token = await requireApiToken();
  } catch (err) {
    const status = typeof (err as any)?.status === "number" ? (err as any).status : 401;
    const code = typeof (err as any)?.code === "string" ? String((err as any).code) : "AUTH_MISSING_TOKEN";
    return NextResponse.json({ ok: false, error: { code, message: "Unauthorized" } }, { status });
  }

  // Upstream status/body pass-through.
  const resp = await apiFetch({ path: "/api/me", method: "GET", sessionToken: token, request: req });
  const upstreamText = await resp.text().catch(() => "");
  const contentType = resp.headers.get("content-type") ?? "application/json";
  const upstreamRequestId = resp.headers.get("x-request-id") ?? "";

  return new NextResponse(upstreamText, {
    status: resp.status,
    headers: {
      "content-type": contentType,
      "x-request-id": upstreamRequestId,
    },
  });
}

