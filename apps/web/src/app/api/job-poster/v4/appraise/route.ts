import { NextResponse } from "next/server";
import { apiFetch } from "@/server/api/apiClient";
import { requireApiToken, requireSession } from "@/server/auth/requireSession";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    await requireSession(req);
    const sessionToken = await requireApiToken();
    const body = await req.json().catch(() => ({}));
    const resp = await apiFetch({
      path: "/api/web/job-poster/v4/appraise",
      method: "POST",
      sessionToken,
      body: JSON.stringify(body),
    });
    const text = await resp.text();
    return new NextResponse(text, {
      status: resp.status,
      headers: { "Content-Type": resp.headers.get("content-type") ?? "application/json" },
    });
  } catch (err) {
    const status = typeof (err as any)?.status === "number" ? (err as any).status : 500;
    const code = typeof (err as any)?.code === "string" ? (err as any).code : "APPRAISE_PROXY_FAILED";
    const message = err instanceof Error ? err.message : "Appraisal failed.";
    console.error("[web] appraise proxy failed", { status, code, message });
    return NextResponse.json(
      { ok: false, error: { code, message } },
      { status },
    );
  }
}
