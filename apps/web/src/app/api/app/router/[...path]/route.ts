import { NextResponse } from "next/server";
import { requireApiToken, requireSession } from "@/server/auth/requireSession";
import { apiFetch } from "@/server/api/apiClient";

function toBackendPath(segments: string[]): string {
  const s0 = segments[0] ?? "";
  const s1 = segments[1] ?? "";
  const s2 = segments[2] ?? "";

  // Router job actions live under /api/jobs in apps/api.
  if (s0 === "active-job") return "/api/jobs/active";

  if (s0 === "jobs" && s1) {
    if (s2 === "claim") return `/api/jobs/${encodeURIComponent(s1)}/claim`;
    if (s2 === "confirm-completion") return `/api/jobs/${encodeURIComponent(s1)}/router-approve`;
    if (s2 === "eligible-contractors") return `/api/jobs/${encodeURIComponent(s1)}/contractors/eligible`;
  }

  // Router incentives endpoint is web-only and not under /api/web/router/*
  if (s0 === "incentives") return "/api/web/router-incentives";

  // Default: router dashboard endpoints live under /api/web/router in apps/api.
  return `/api/web/router/${segments.map((p) => encodeURIComponent(p)).join("/")}`;
}

async function proxy(req: Request, segments: string[]) {
  await requireSession(req);
  const sessionToken = await requireApiToken();

  const backendPath = toBackendPath(segments);
  const method = req.method.toUpperCase();
  const contentType = req.headers.get("content-type") ?? "application/json";
  const body = method === "GET" || method === "HEAD" ? undefined : await req.arrayBuffer();

  const resp = await apiFetch({
    path: backendPath,
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

export async function GET(req: Request, ctx: { params: Promise<{ path: string[] }> }) {
  const { path } = await ctx.params;
  try {
    return await proxy(req, path ?? []);
  } catch (error) {
    const status = typeof (error as any)?.status === "number" ? (error as any).status : 500;
    return NextResponse.json({ ok: false, error: "PROXY_FAILED" }, { status });
  }
}

export async function POST(req: Request, ctx: { params: Promise<{ path: string[] }> }) {
  const { path } = await ctx.params;
  try {
    return await proxy(req, path ?? []);
  } catch (error) {
    const status = typeof (error as any)?.status === "number" ? (error as any).status : 500;
    return NextResponse.json({ ok: false, error: "PROXY_FAILED" }, { status });
  }
}

export async function PUT(req: Request, ctx: { params: Promise<{ path: string[] }> }) {
  return POST(req, ctx);
}

export async function PATCH(req: Request, ctx: { params: Promise<{ path: string[] }> }) {
  return POST(req, ctx);
}

export async function DELETE(req: Request, ctx: { params: Promise<{ path: string[] }> }) {
  return POST(req, ctx);
}

