import { NextResponse } from "next/server";
import { requireApiToken, requireSession } from "@/server/auth/requireSession";
import { apiFetch } from "@/server/api/apiClient";

/**
 * V4 router profile proxy (isolated namespace).
 */
async function proxy(req: Request) {
  await requireSession(req);
  const sessionToken = await requireApiToken();
  const method = req.method.toUpperCase();
  const contentType = req.headers.get("content-type") ?? "application/json";
  const body = method === "GET" || method === "HEAD" ? undefined : await req.arrayBuffer();

  const resp = await apiFetch({
    path: "/api/web/v4/router/profile",
    method,
    sessionToken,
    headers: body ? { "content-type": contentType } : undefined,
    body,
  });

  const text = await resp.text();
  return new NextResponse(text, {
    status: resp.status,
    headers: { "Content-Type": resp.headers.get("content-type") ?? "application/json" },
  });
}

export async function GET(req: Request) {
  try {
    return await proxy(req);
  } catch (error) {
    const status = typeof (error as any)?.status === "number" ? (error as any).status : 500;
    return NextResponse.json({ ok: false, error: "PROXY_FAILED" }, { status });
  }
}

export async function PUT(req: Request) {
  return GET(req);
}

export async function POST(req: Request) {
  return GET(req);
}

export async function PATCH(req: Request) {
  return GET(req);
}

export async function DELETE(req: Request) {
  return GET(req);
}
