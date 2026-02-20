import { NextResponse } from "next/server";
import { requireApiToken, requireSession } from "@/server/auth/requireSession";
import { apiFetch } from "@/server/api/apiClient";

async function proxy(req: Request) {
  await requireSession(req);
  const token = await requireApiToken();
  const contentType = req.headers.get("content-type") ?? "application/json";
  const method = req.method.toUpperCase();
  const body = method === "GET" || method === "HEAD" ? undefined : await req.arrayBuffer();
  const resp = await apiFetch({
    path: "/api/web/stripe/connect/create-account",
    method,
    sessionToken: token,
    headers: body ? { "content-type": contentType } : undefined,
    body,
    request: req,
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
  } catch (err) {
    const status = typeof (err as any)?.status === "number" ? (err as any).status : 500;
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed" }, { status });
  }
}

export async function POST(req: Request) {
  try {
    return await proxy(req);
  } catch (err) {
    const status = typeof (err as any)?.status === "number" ? (err as any).status : 500;
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed" }, { status });
  }
}
