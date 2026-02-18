import { NextResponse } from "next/server";
import { requireApiToken, requireSession } from "@/server/auth/requireSession";
import { apiFetch } from "@/server/api/apiClient";
import { refundEligibleAtUtc } from "@/lib/refundEligibility";

type JobRow = {
  id: string;
  createdAt: string;
};

/**
 * Read-only helper endpoint.
 *
 * - Calls canonical apps/api endpoint for job-poster jobs
 * - Computes ONLY the time-based eligibility timestamp (server-time based)
 * - Does not assert that refunds will be granted; backend remains authority
 */
export async function GET(req: Request) {
  try {
    await requireSession(req);
    const token = await requireApiToken();

    const resp = await apiFetch({ path: "/api/web/job-poster/jobs", method: "GET", sessionToken: token });
    const text = await resp.text().catch(() => "");
    if (!resp.ok) {
      return new NextResponse(text || JSON.stringify({ ok: false, error: "Upstream error" }), {
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
    const jobs = (Array.isArray(json?.jobs) ? json.jobs : Array.isArray(json?.data?.jobs) ? json.data.jobs : []) as JobRow[];

    const eligibleAtByJobId: Record<string, string> = {};
    for (const j of jobs) {
      const id = String((j as any)?.id ?? "").trim();
      if (!id) continue;
      const eligibleAt = refundEligibleAtUtc({ createdAt: (j as any)?.createdAt });
      if (!eligibleAt) continue;
      eligibleAtByJobId[id] = eligibleAt.toISOString();
    }

    return NextResponse.json(
      {
        ok: true,
        now: new Date().toISOString(),
        eligibleAtByJobId,
      },
      { status: 200 },
    );
  } catch (err) {
    const status = typeof (err as any)?.status === "number" ? (err as any).status : 500;
    const code = typeof (err as any)?.code === "string" ? String((err as any).code) : "INTERNAL_ERROR";
    const msg = err instanceof Error ? err.message : "Failed";
    return NextResponse.json({ ok: false, error: { code, message: msg } }, { status });
  }
}

