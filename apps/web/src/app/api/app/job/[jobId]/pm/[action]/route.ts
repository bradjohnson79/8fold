import { NextResponse } from "next/server";
import { requireApiToken, requireSession } from "@/server/auth/requireSession";
import { apiFetch } from "@/server/api/apiClient";

function parsePath(req: Request): { jobId: string; action: string } {
  const parts = new URL(req.url).pathname.split("/");
  const jobIdx = parts.indexOf("job");
  const pmIdx = parts.indexOf("pm");
  return {
    jobId: jobIdx >= 0 ? parts[jobIdx + 1] ?? "" : "",
    action: pmIdx >= 0 ? parts[pmIdx + 1] ?? "" : "",
  };
}

export async function POST(req: Request) {
  try {
    await requireSession(req);
    const token = await requireApiToken();
    const { jobId, action } = parsePath(req);
    const contentType = req.headers.get("content-type") ?? "application/json";
    const body = await req.arrayBuffer();
    const resp = await apiFetch({
      path: `/api/web/job/${encodeURIComponent(jobId)}/pm/${encodeURIComponent(action)}`,
      method: "POST",
      sessionToken: token,
      headers: { "content-type": contentType },
      body,
    });
    const text = await resp.text();
    return new NextResponse(text, {
      status: resp.status,
      headers: { "Content-Type": resp.headers.get("content-type") ?? "application/json" },
    });
  } catch (err) {
    const status = typeof (err as any)?.status === "number" ? (err as any).status : 500;
    return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : "Failed" }, { status });
  }
}
