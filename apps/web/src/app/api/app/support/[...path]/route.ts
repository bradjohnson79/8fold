import { NextResponse } from "next/server";
import { requireApiToken, requireSession } from "@/server/auth/requireSession";
import { apiFetch } from "@/server/api/apiClient";

function jsonError(status: number, message: string) {
  return NextResponse.json({ ok: false, error: message }, { status });
}

export async function GET(req: Request, ctx: { params: Promise<{ path: string[] }> }) {
  return await handle(req, ctx);
}
export async function POST(req: Request, ctx: { params: Promise<{ path: string[] }> }) {
  return await handle(req, ctx);
}
export async function PUT(req: Request, ctx: { params: Promise<{ path: string[] }> }) {
  return await handle(req, ctx);
}
export async function PATCH(req: Request, ctx: { params: Promise<{ path: string[] }> }) {
  return await handle(req, ctx);
}
export async function DELETE(req: Request, ctx: { params: Promise<{ path: string[] }> }) {
  return await handle(req, ctx);
}

async function handle(req: Request, ctx: { params: Promise<{ path: string[] }> }) {
  try {
    await requireSession(req);
    const token = await requireApiToken();

    const params = await ctx.params;
    const subpath = `/${(params?.path ?? []).join("/")}`;
    if (subpath === "/") return jsonError(404, "Not found");

    const url = new URL(req.url);
    const qs = url.search ?? "";

    const contentType = req.headers.get("content-type");
    const hasBody = req.method !== "GET" && req.method !== "HEAD";
    const body = hasBody ? await req.arrayBuffer() : null;

    const resp = await apiFetch({
      path: `/api/web/support${subpath}${qs}`,
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

