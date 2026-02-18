import { NextResponse } from "next/server";
import { requireApiToken, requireSession } from "@/server/auth/requireSession";
import { apiFetch } from "@/server/api/apiClient";

export async function GET(req: Request) {
  try {
    await requireSession(req);
    const token = await requireApiToken();
    const resp = await apiFetch({ path: "/api/web/job-poster/jobs", method: "GET", sessionToken: token });
    const text = await resp.text();
    if (!resp.ok) {
      return new NextResponse(text, {
        status: resp.status,
        headers: { "Content-Type": resp.headers.get("content-type") ?? "application/json" },
      });
    }
    const json = (() => {
      try {
        return text ? JSON.parse(text) : null;
      } catch {
        return null;
      }
    })() as any;
    // apps/api wraps with { ok: true, data: { jobs } } via respond.ok()
    const jobs = Array.isArray(json?.jobs) ? json.jobs : Array.isArray(json?.data?.jobs) ? json.data.jobs : [];
    return NextResponse.json({ jobs }, { status: 200 });
  } catch (err) {
    const status = typeof (err as any)?.status === "number" ? (err as any).status : 500;
    const msg = err instanceof Error ? err.message : "Failed";
    return NextResponse.json({ error: msg }, { status });
  }
}
