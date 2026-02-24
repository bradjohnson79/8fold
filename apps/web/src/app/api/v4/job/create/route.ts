import { NextResponse } from "next/server";
import { apiFetch } from "@/server/api/apiClient";
import { requireApiToken, requireSession } from "@/server/auth/requireSession";

/**
 * V4 proxy to POST /api/web/v4/job/create (apps/api).
 * Isolated V4 call path only.
 */
export async function POST(req: Request) {
  try {
    await requireSession(req);
    const sessionToken = await requireApiToken();
    const body = await req.json().catch(() => ({}));
    const resp = await apiFetch({
      path: "/api/web/v4/job/create",
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
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Job create failed." },
      { status: 500 }
    );
  }
}
