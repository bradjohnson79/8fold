import { NextResponse } from "next/server";
import { requireApiToken, requireSession } from "@/server/auth/requireSession";
import { apiFetch } from "@/server/api/apiClient";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ threadId: string }> }
) {
  await requireSession(req);
  const sessionToken = await requireApiToken();
  const { threadId } = await params;
  const resp = await apiFetch({
    path: `/api/web/v4/messages/thread/${threadId}`,
    method: "GET",
    sessionToken,
  });
  const text = await resp.text();
  return new NextResponse(text, {
    status: resp.status,
    headers: { "Content-Type": resp.headers.get("content-type") ?? "application/json" },
  });
}
