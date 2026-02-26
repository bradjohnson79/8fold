import { NextResponse } from "next/server";
import { requireApiToken, requireSession } from "@/server/auth/requireSession";
import { apiFetch } from "@/server/api/apiClient";

function readBearerFromRequest(req: Request): string | null {
  const raw = String(req.headers.get("authorization") ?? "").trim();
  if (!raw.toLowerCase().startsWith("bearer ")) return null;
  const token = raw.slice(7).trim();
  return token || null;
}

export async function POST(req: Request) {
  try {
    const clientBearer = readBearerFromRequest(req);
    let sessionToken = clientBearer;
    if (!sessionToken) {
      await requireSession(req);
      sessionToken = await requireApiToken(req);
    }
    const resp = await apiFetch({
      path: "/api/web/v4/job-poster/payment/setup-intent",
      method: "POST",
      sessionToken,
    });
    const text = await resp.text();
    return new NextResponse(text, {
      status: resp.status,
      headers: { "Content-Type": resp.headers.get("content-type") ?? "application/json" },
    });
  } catch (err) {
    const status = typeof (err as any)?.status === "number" ? Number((err as any).status) : 500;
    const code = typeof (err as any)?.code === "string" ? String((err as any).code) : "WEB_SETUP_INTENT_PROXY_ERROR";
    const message = err instanceof Error ? err.message : "Setup intent proxy failed";
    return NextResponse.json(
      {
        ok: false,
        error: { code, message },
      },
      { status: status >= 400 && status < 600 ? status : 500 },
    );
  }
}
