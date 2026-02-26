import { NextResponse } from "next/server";
import { getValidatedApiOrigin } from "@/server/env";

async function proxy(req: Request, ctx: { params: Promise<{ path?: string[] }> }) {
  const apiOrigin = getValidatedApiOrigin();
  const { path } = await ctx.params;
  const pathSuffix = Array.isArray(path) ? path.join("/") : "";
  const target = `${apiOrigin}/api/admin/v4/${pathSuffix}`;

  const inbound = new URL(req.url);
  const url = new URL(target);
  inbound.searchParams.forEach((value, key) => url.searchParams.append(key, value));

  const body = req.method === "GET" || req.method === "HEAD" ? undefined : await req.text();

  const resp = await fetch(url.toString(), {
    method: req.method,
    headers: {
      "content-type": req.headers.get("content-type") ?? "application/json",
      cookie: req.headers.get("cookie") ?? "",
    },
    body,
    cache: "no-store",
  });

  const text = await resp.text();
  const out = new NextResponse(text, { status: resp.status });
  const setCookie = resp.headers.get("set-cookie");
  if (setCookie) out.headers.set("set-cookie", setCookie);
  out.headers.set("content-type", resp.headers.get("content-type") ?? "application/json");
  return out;
}

export async function GET(req: Request, ctx: { params: Promise<{ path?: string[] }> }) {
  return await proxy(req, ctx);
}

export async function POST(req: Request, ctx: { params: Promise<{ path?: string[] }> }) {
  return await proxy(req, ctx);
}

export async function PATCH(req: Request, ctx: { params: Promise<{ path?: string[] }> }) {
  return await proxy(req, ctx);
}

export async function PUT(req: Request, ctx: { params: Promise<{ path?: string[] }> }) {
  return await proxy(req, ctx);
}

export async function DELETE(req: Request, ctx: { params: Promise<{ path?: string[] }> }) {
  return await proxy(req, ctx);
}
