import { NextResponse } from "next/server";
import { getValidatedApiOrigin } from "@/server/env";
import { getAdminSessionTokenFromRequest } from "@/server/adminAuth";
import { fetchWithAdminTimeout } from "@/server/upstreamFetch";

async function proxy(req: Request, ctx: { params: Promise<{ path?: string[] }> }) {
  try {
    const apiOrigin = getValidatedApiOrigin();
    const token = getAdminSessionTokenFromRequest(req);
    const inboundCookie = req.headers.get("cookie") ?? "";
    if (!token && !inboundCookie) {
      throw Object.assign(new Error("Unauthorized"), { status: 401 });
    }
    const { path } = await ctx.params;
    const pathSuffix = Array.isArray(path) ? path.join("/") : "";
    const target = `${apiOrigin}/api/admin/v4/${pathSuffix}`;

    const inbound = new URL(req.url);
    const url = new URL(target);
    inbound.searchParams.forEach((value, key) => url.searchParams.append(key, value));

    const body = req.method === "GET" || req.method === "HEAD" ? undefined : await req.text();

    // Keep admin auth forwarding explicit and canonical:
    // pass bearer token plus raw cookie when present.
    const headers: Record<string, string> = {
      "content-type": req.headers.get("content-type") ?? "application/json",
    };
    if (token) headers.authorization = `Bearer ${token}`;
    if (inboundCookie) headers.cookie = inboundCookie;

    const resp = await fetchWithAdminTimeout(url.toString(), {
      method: req.method,
      headers,
      body,
      cache: "no-store",
    });

    const text = await resp.text();
    const out = new NextResponse(text, { status: resp.status });
    out.headers.set("content-type", resp.headers.get("content-type") ?? "application/json");
    return out;
  } catch (err: any) {
    const status = typeof err?.status === "number" ? err.status : 401;
    const message =
      status === 401
        ? "Authentication required."
        : status === 504
          ? "Upstream timeout."
          : "Request failed.";
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: status === 401 ? "UNAUTHORIZED" : "UPSTREAM_ERROR",
          message,
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
