import { NextResponse } from "next/server";
import { requireV4Role } from "@/src/auth/requireV4Role";
import { getV4RouterAvailableJobs } from "@/src/services/v4/routerAvailableJobsService";

const TRACE_SOURCE = "apps/api/app/api/web/v4/router/available-jobs/route.ts";

const TRACE_ENABLED = process.env.ENABLE_ROUTER_TRACE === "true";

function getSanitizedDbFingerprint(): string {
  try {
    const url = process.env.DATABASE_URL;
    if (!url || typeof url !== "string") return "db_url_not_set";
    const parsed = new URL(url);
    const host = parsed.hostname ?? "?";
    const db = parsed.pathname ? parsed.pathname.replace(/^\//, "") || "?" : "?";
    const schemaParam = parsed.searchParams.get("schema");
    const schema = schemaParam ? schemaParam.trim() : "public";
    return `host=${host} db=${db} schema=${schema}`;
  } catch {
    return "db_url_parse_error";
  }
}

export async function GET(req: Request) {
  const trace = TRACE_ENABLED;
  if (trace) {
    console.log(`[router-trace] request_received timestamp=${new Date().toISOString()}`);
    console.log(`[router-trace] code_path=${TRACE_SOURCE}`);
    console.log(`[router-trace] NODE_ENV=${process.env.NODE_ENV ?? "undefined"}`);
    console.log(`[router-trace] VERCEL_ENV=${process.env.VERCEL_ENV ?? "undefined"}`);
    console.log(`[router-trace] db_fingerprint ${getSanitizedDbFingerprint()}`);
  }

  try {
    const authed = await requireV4Role(req, "ROUTER");
    if (trace) {
      console.log(`[router-trace] auth_passed=${authed instanceof Response ? "no" : "yes"}`);
      if (authed instanceof Response) {
        console.log(`[router-trace] auth_returned_response status=${authed.status}`);
      } else {
        console.log(`[router-trace] authenticated_user_id=${authed.userId}`);
        console.log(`[router-trace] authenticated_role=${authed.role}`);
      }
    }

    if (authed instanceof Response) return authed;

    const result = await getV4RouterAvailableJobs(authed.userId, trace ? { requestId: authed.requestId } : undefined);

    if (trace) {
      const jobsCount = Array.isArray(result?.jobs) ? result.jobs.length : 0;
      const firstJobId = Array.isArray(result?.jobs) && result.jobs.length > 0 ? (result.jobs[0] as { id?: string })?.id : null;
      console.log(`[router-trace] response_jobs_count=${jobsCount}`);
      console.log(`[router-trace] response_first_job_id=${firstJobId ?? "none"}`);
      console.log(`[router-trace] response_shape={ jobs: [...] }`);
    }

    const serviceFailed = Boolean((result as { _meta?: { error?: string } } | null)?._meta?.error);
    return NextResponse.json({
      ...result,
      ok: serviceFailed ? false : result.ok ?? true,
      status: serviceFailed ? "error" : "ok",
    }, { status: 200 });
  } catch (err) {
    console.error(`[available-jobs] route_error`, err instanceof Error ? err.message : err);
    return NextResponse.json({
      ok: false,
      status: "error",
      jobs: [],
      _meta: { routeError: err instanceof Error ? err.message : String(err), ts: new Date().toISOString() },
    }, { status: 200 });
  }
}
