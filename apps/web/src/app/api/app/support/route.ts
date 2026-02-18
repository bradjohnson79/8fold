import { NextResponse } from "next/server";
import { requireApiToken, requireSession } from "@/server/auth/requireSession";
import { apiFetch } from "@/server/api/apiClient";

function jsonError(status: number, message: string) {
  return NextResponse.json({ ok: false, error: message }, { status });
}

// Root support endpoint compat:
// - Backend supports both `/api/web/support` and `/api/web/support/tickets`
// - Web proxy should also support `/api/app/support` and return JSON (never HTML 500).
export async function GET(req: Request) {
  return await handle(req);
}
export async function POST(req: Request) {
  return await handle(req);
}
export async function PUT(req: Request) {
  return await handle(req);
}
export async function PATCH(req: Request) {
  return await handle(req);
}
export async function DELETE(req: Request) {
  return await handle(req);
}

async function handle(req: Request) {
  try {
    await requireSession(req);
    const token = await requireApiToken();

    const url = new URL(req.url);
    const qs = url.search ?? "";

    const contentType = req.headers.get("content-type");
    const hasBody = req.method !== "GET" && req.method !== "HEAD";
    const body = hasBody ? await req.arrayBuffer() : null;

    const resp = await apiFetch({
      path: `/api/web/support${qs}`,
      method: req.method,
      sessionToken: token,
      headers: contentType ? { "content-type": contentType } : undefined,
      body: body ? body : undefined,
      request: req,
    });

    const text = await resp.text().catch(() => "");
    return new NextResponse(text, {
      status: resp.status,
      headers: { "Content-Type": resp.headers.get("content-type") ?? "application/json" },
    });
  } catch (err) {
    const status = typeof (err as any)?.status === "number" ? Number((err as any).status) : 500;
    const msg = err instanceof Error ? err.message : "Failed";
    return jsonError(status, msg);
  }
}

