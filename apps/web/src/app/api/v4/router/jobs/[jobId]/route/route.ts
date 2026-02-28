import { NextResponse } from "next/server";
import { requireApiToken, requireSession } from "@/server/auth/requireSession";
import { apiFetch } from "@/server/api/apiClient";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ jobId: string }> },
) {
  await requireSession(req);
  const sessionToken = await requireApiToken();
  const { jobId } = await params;
  const body = await req.text();
  const resp = await apiFetch({
    path: `/api/web/v4/router/jobs/${encodeURIComponent(jobId)}/route`,
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
