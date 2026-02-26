/**
 * Catch-all proxy for /api/web/* → backend API.
 * Enables frontend to call /api/web/v4/* directly, matching backend route structure.
 */
import { NextResponse } from "next/server";
import { requireApiToken, requireSession } from "@/server/auth/requireSession";
import { apiFetch } from "@/server/api/apiClient";

type Params = { path?: string[] };

function toErrorResponse(err: unknown) {
  const status = typeof (err as any)?.status === "number" ? Number((err as any).status) : 500;
  const code = typeof (err as any)?.code === "string" ? String((err as any).code) : "WEB_PROXY_ERROR";
  const message = err instanceof Error ? err.message : "Proxy request failed";
  return NextResponse.json(
    { ok: false, error: { code, message } },
    { status: status >= 400 && status < 600 ? status : 500 },
  );
}

async function proxy(req: Request, pathSegments: string[]) {
  const path = `/api/web/${pathSegments.join("/")}`;
  const sessionToken = await requireApiToken(req);
  const url = new URL(req.url);
  const query = url.search ? `?${url.searchParams.toString()}` : "";
  const contentType = req.headers.get("content-type");
  const body = req.method !== "GET" && req.method !== "HEAD" ? await req.arrayBuffer() : null;
  const headers: Record<string, string> = {};
  if (contentType) {
    headers["content-type"] = contentType;
  }
  const resp = await apiFetch({
    path: path + query,
    method: req.method,
    sessionToken,
    request: req,
    headers,
    body,
  });
  const text = await resp.text();
  return new NextResponse(text, {
    status: resp.status,
    headers: { "Content-Type": resp.headers.get("content-type") ?? "application/json" },
  });
}

export async function GET(req: Request, ctx: { params: Promise<Params> }) {
  try {
    const { path = [] } = await ctx.params;
    if (path.length === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });
    await requireSession(req);
    return proxy(req, path);
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function POST(req: Request, ctx: { params: Promise<Params> }) {
  try {
    const { path = [] } = await ctx.params;
    if (path.length === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });
    await requireSession(req);
    return proxy(req, path);
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function PATCH(req: Request, ctx: { params: Promise<Params> }) {
  try {
    const { path = [] } = await ctx.params;
    if (path.length === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });
    await requireSession(req);
    return proxy(req, path);
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function PUT(req: Request, ctx: { params: Promise<Params> }) {
  try {
    const { path = [] } = await ctx.params;
    if (path.length === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });
    await requireSession(req);
    return proxy(req, path);
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function DELETE(req: Request, ctx: { params: Promise<Params> }) {
  try {
    const { path = [] } = await ctx.params;
    if (path.length === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });
    await requireSession(req);
    return proxy(req, path);
  } catch (err) {
    return toErrorResponse(err);
  }
}
