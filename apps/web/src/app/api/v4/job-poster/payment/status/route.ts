import { NextResponse } from "next/server";
import { requireApiToken, requireSession } from "@/server/auth/requireSession";
import { apiFetch } from "@/server/api/apiClient";

export async function GET(req: Request) {
  await requireSession(req);
  const sessionToken = await requireApiToken();
  const resp = await apiFetch({
    path: "/api/web/v4/job-poster/payment/status",
    method: "GET",
    sessionToken,
  });
  const text = await resp.text();
  return new NextResponse(text, {
    status: resp.status,
    headers: { "Content-Type": resp.headers.get("content-type") ?? "application/json" },
  });
}
