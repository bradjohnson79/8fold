import { NextResponse } from "next/server";
import { requireApiToken, requireSession } from "@/server/auth/requireSession";
import { apiFetch } from "@/server/api/apiClient";

export async function POST(req: Request) {
  await requireSession(req);
  const sessionToken = await requireApiToken(req);
  const body = await req.text();
  const resp = await apiFetch({
    path: "/api/web/v4/support/ticket",
    method: "POST",
    sessionToken,
    headers: body ? { "content-type": req.headers.get("content-type") ?? "application/json" } : undefined,
    body: body || undefined,
  });
  const text = await resp.text();
  return new NextResponse(text, {
    status: resp.status,
    headers: { "Content-Type": resp.headers.get("content-type") ?? "application/json" },
  });
}
