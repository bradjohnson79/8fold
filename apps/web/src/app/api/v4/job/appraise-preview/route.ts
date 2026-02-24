import { NextResponse } from "next/server";
import { apiFetch } from "@/server/api/apiClient";

/**
 * V4 proxy to POST /api/web/v4/job/appraise-preview (apps/api).
 * No wizard or draft dependency.
 */
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const resp = await apiFetch({
      path: "/api/web/v4/job/appraise-preview",
      method: "POST",
      body: JSON.stringify(body),
    });
    const text = await resp.text();
    return new NextResponse(text, {
      status: resp.status,
      headers: { "Content-Type": resp.headers.get("content-type") ?? "application/json" },
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Appraisal preview failed." },
      { status: 500 }
    );
  }
}
