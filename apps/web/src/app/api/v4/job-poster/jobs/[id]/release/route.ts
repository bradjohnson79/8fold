import { NextResponse } from "next/server";
import { requireApiToken, requireSession } from "@/server/auth/requireSession";
import { apiFetch } from "@/server/api/apiClient";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  await requireSession(req);
  const sessionToken = await requireApiToken();
  const { id } = await params;
  const resp = await apiFetch({
    path: `/api/web/v4/job-poster/jobs/${encodeURIComponent(id)}/release`,
    method: "POST",
    sessionToken,
    request: req,
  });
  const text = await resp.text();
  return new NextResponse(text, {
    status: resp.status,
    headers: { "Content-Type": resp.headers.get("content-type") ?? "application/json" },
  });
}
