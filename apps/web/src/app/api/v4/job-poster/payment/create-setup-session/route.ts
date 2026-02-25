import { NextResponse } from "next/server";
import { requireApiToken, requireSession } from "@/server/auth/requireSession";
import { apiFetch } from "@/server/api/apiClient";

export async function POST(req: Request) {
  try {
    await requireSession(req);
    const sessionToken = await requireApiToken(req);
    const resp = await apiFetch({
      path: "/api/web/v4/job-poster/payment/create-setup-session",
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
    const code = typeof (err as any)?.code === "string" ? String((err as any).code) : "WEB_PAYMENT_SETUP_PROXY_ERROR";
    const message = err instanceof Error ? err.message : "Payment setup proxy failed";
    return NextResponse.json(
      {
        ok: false,
        error: { code, message },
      },
      { status: status >= 400 && status < 600 ? status : 500 },
    );
  }
}
