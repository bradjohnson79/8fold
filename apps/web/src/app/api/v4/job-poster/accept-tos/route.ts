import { NextResponse } from "next/server";
import { requireApiToken, requireSession } from "@/server/auth/requireSession";
import { apiFetch } from "@/server/api/apiClient";

async function proxy(req: Request) {
  await requireSession(req);
  const sessionToken = await requireApiToken();
  const body = await req.text();
  const resp = await apiFetch({
    path: "/api/web/v4/job-poster/accept-tos",
    method: "POST",
    sessionToken,
    headers: { "content-type": req.headers.get("content-type") ?? "application/json" },
    body,
  });
  const text = await resp.text();
  return new NextResponse(text, {
    status: resp.status,
    headers: { "Content-Type": resp.headers.get("content-type") ?? "application/json" },
  });
}

export async function POST(req: Request) {
  return proxy(req);
}
