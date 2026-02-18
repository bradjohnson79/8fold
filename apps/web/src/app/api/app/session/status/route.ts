import { NextResponse } from "next/server";
import { apiFetch } from "@/server/api/apiClient";
import { requireApiToken, requireSession } from "@/server/auth/requireSession";

export async function GET(req: Request) {
  try {
    await requireSession(req);
    const token = await requireApiToken();

    const resp = await apiFetch({
      path: "/api/session/status",
      method: "GET",
      sessionToken: token,
    });
    const text = await resp.text();
    return new NextResponse(text, {
      status: resp.status,
      headers: { "Content-Type": resp.headers.get("content-type") ?? "application/json" },
    });
  } catch (err) {
    const status = typeof (err as any)?.status === "number" ? (err as any).status : 500;
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Failed", code: "INTERNAL_ERROR" },
      { status },
    );
  }
}

