import { NextResponse } from "next/server";
import { getValidatedApiOrigin } from "@/server/env";
import { getAdminAuthHeader } from "@/server/adminAuth";

async function proxy(req: Request, ctx: { params: Promise<{ path?: string[] }> }) {
  try {
    const apiOrigin = getValidatedApiOrigin();
    const authorization = await getAdminAuthHeader(req);
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
        authorization,
        "content-type": req.headers.get("content-type") ?? "application/json",
      },
      body,
      cache: "no-store",
    });

    const text = await resp.text();
    const out = new NextResponse(text, { status: resp.status });
    out.headers.set("content-type", resp.headers.get("content-type") ?? "application/json");
    return out;
  } catch (err: any) {
    const status = typeof err?.status === "number" ? err.status : 401;
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: status === 401 ? "NOT_AUTHENTICATED" : "UPSTREAM_ERROR",
          message: status === 401 ? "Admin session expired. Please log in again." : "Request failed.",
        },
      },
      { status },
    );
  }
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
