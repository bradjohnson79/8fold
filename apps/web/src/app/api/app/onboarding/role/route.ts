import { NextResponse } from "next/server";
import { apiFetch } from "@/server/api/apiClient";
import { requireApiToken } from "@/server/auth/requireSession";

export async function POST(req: Request) {
  let token = "";
  try {
    token = await requireApiToken();
  } catch (err) {
    const status = typeof (err as any)?.status === "number" ? (err as any).status : 401;
    const code = typeof (err as any)?.code === "string" ? String((err as any).code) : "AUTH_MISSING_TOKEN";
    return NextResponse.json({ ok: false, error: { code, message: "Unauthorized" } }, { status });
  }

  const body = await req.text().catch(() => "");
  const resp = await apiFetch({
    path: "/api/onboarding/role",
    method: "POST",
    sessionToken: token,
    headers: { "content-type": "application/json" },
    body,
  });

  const upstreamText = await resp.text().catch(() => "");
  return new NextResponse(upstreamText, {
    status: resp.status,
    headers: {
      "content-type": resp.headers.get("content-type") ?? "application/json",
      "x-request-id": resp.headers.get("x-request-id") ?? "",
    },
  });
}

