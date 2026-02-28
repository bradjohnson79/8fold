import { NextResponse } from "next/server";
import { requireApiToken, requireSession } from "@/server/auth/requireSession";
import { apiFetch } from "@/server/api/apiClient";

export async function GET(req: Request) {
  await requireSession(req);
  const sessionToken = await requireApiToken();
  const resp = await apiFetch({
    path: "/api/web/v4/job-poster/jobs",
    method: "GET",
    sessionToken,
  });
  const text = await resp.text();
  return new NextResponse(text, {
    status: resp.status,
    headers: { "Content-Type": resp.headers.get("content-type") ?? "application/json" },
  });
}

export async function POST(req: Request) {
  await requireSession(req);
  const sessionToken = await requireApiToken();
  const contentType = req.headers.get("content-type") ?? "application/json";
  const body = await req.arrayBuffer();
  const resp = await apiFetch({
    path: "/api/web/v4/job-poster/jobs",
    method: "POST",
    sessionToken,
    headers: { "content-type": contentType },
    body,
    request: req,
  });
  const text = await resp.text();
  return new NextResponse(text, {
    status: resp.status,
    headers: { "Content-Type": resp.headers.get("content-type") ?? "application/json" },
  });
}
