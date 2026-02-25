import { NextResponse } from "next/server";
import { requireApiToken, requireSession } from "@/server/auth/requireSession";
import { apiFetch } from "@/server/api/apiClient";

export async function GET(req: Request) {
  await requireSession(req);
  const sessionToken = await requireApiToken();
  const url = new URL(req.url);
  const query = url.searchParams.toString();
  const path = `/api/web/v4/messages/threads${query ? `?${query}` : ""}`;
  const resp = await apiFetch({ path, method: "GET", sessionToken });
  const text = await resp.text();
  return new NextResponse(text, {
    status: resp.status,
    headers: { "Content-Type": resp.headers.get("content-type") ?? "application/json" },
  });
}
