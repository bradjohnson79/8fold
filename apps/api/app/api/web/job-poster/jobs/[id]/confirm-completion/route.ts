import { NextResponse } from "next/server";
import { z } from "zod";
import { requireJobPosterReady } from "../../../../../../../src/auth/onboardingGuards";
import { toHttpError } from "../../../../../../../src/http/errors";
import { posterMarkComplete } from "@/src/services/v4/jobExecutionService";

function getIdFromUrl(req: Request): string {
  const url = new URL(req.url);
  const parts = url.pathname.split("/");
  return parts[parts.length - 2] ?? "";
}

const BodySchema = z.object({
  summary: z.string().trim().min(20).max(5000),
});

export async function POST(req: Request) {
  try {
    const ready = await requireJobPosterReady(req);
    if (ready instanceof Response) return ready;

    const jobId = getIdFromUrl(req);
    if (!jobId) return NextResponse.json({ ok: false, error: "Invalid job id" }, { status: 400 });

    // Legacy response compatibility: keep request validation but delegate execution to V4 lifecycle service.
    let raw: unknown = {};
    try {
      raw = await req.json();
    } catch {
      return NextResponse.json({ ok: false, error: "Invalid input" }, { status: 400 });
    }
    const body = BodySchema.safeParse(raw);
    if (!body.success) return NextResponse.json({ ok: false, error: "Invalid input" }, { status: 400 });
    void body.data.summary;

    console.warn("[LEGACY_EXECUTION_ROUTE_DEPRECATED]", {
      route: "/api/web/job-poster/jobs/[id]/confirm-completion",
    });
    const result = await posterMarkComplete({ jobPosterUserId: ready.userId, jobId });
    return NextResponse.json({
      ok: true,
      idempotent: result.idempotent,
      finalized: result.finalized,
    });
  } catch (err) {
    const { status, message } = toHttpError(err);
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
