import { NextResponse } from "next/server";
import { requireApiToken, requireSession } from "@/server/auth/requireSession";
import { apiFetch } from "@/server/api/apiClient";

async function proxy(req: Request) {
  await requireSession(req);
  const sessionToken = await requireApiToken();
  const method = req.method.toUpperCase();
  const body =
    method === "GET" || method === "HEAD" ? undefined : await req.text();
  const resp = await apiFetch({
    path: "/api/web/v4/job-poster/profile",
    method,
    sessionToken,
    headers: body
      ? {
          "content-type": req.headers.get("content-type") ?? "application/json",
        }
      : undefined,
    body,
  });
  const text = await resp.text();
  return new NextResponse(text, {
    status: resp.status,
    headers: {
      "Content-Type": resp.headers.get("content-type") ?? "application/json",
    },
  });
}

export async function GET(req: Request) {
  return proxy(req);
}

export async function POST(req: Request) {
  return proxy(req);
}

export async function PUT(req: Request) {
  // Backward-compatible alias; dashboard profile now uses POST.
  return proxy(req);
}
