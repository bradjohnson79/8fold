import { z } from "zod";
import { sql } from "drizzle-orm";
import { handleApiError } from "../../../../../src/lib/errorHandler";
import { badRequest, ok } from "../../../../../src/lib/api/respond";
import { countEligiblePublicJobs, listNewestJobs } from "../../../../../src/server/repos/jobPublicRepo.drizzle";
import { db } from "@/server/db/drizzle";
import { asc, inArray } from "drizzle-orm";
import { jobPhotos } from "../../../../../db/schema/jobPhoto";
import { getResolvedSchema } from "../../../../../src/server/db/schemaLock";

const QuerySchema = z.object({
  limit: z
    .string()
    .optional()
    .transform((v) => {
      const n = v ? Number(v) : 9;
      if (!Number.isFinite(n)) return 9;
      return Math.max(1, Math.min(50, Math.trunc(n)));
    })
});

function diagHeaders(diag: {
  resolvedSchema: string;
  currentSchema: string;
  jobExists: boolean;
  jobsExists: boolean;
}): Headers {
  const h = new Headers();
  h.set("x-8fold-resolved-schema", diag.resolvedSchema);
  h.set("x-8fold-current-schema", diag.currentSchema);
  h.set("x-8fold-job-exists", String(diag.jobExists));
  h.set("x-8fold-jobs-exists", String(diag.jobsExists));
  return h;
}

export async function GET(req: Request) {
  const resolvedSchema = getResolvedSchema();
  const diag: {
    resolvedSchema: string;
    currentSchema: string;
    jobExists: boolean;
    jobsExists: boolean;
  } = {
    resolvedSchema,
    currentSchema: "unknown",
    jobExists: false,
    jobsExists: false,
  };

  try {
    const schemaRes = await db.execute<{ current_schema: string }>(sql`SELECT current_schema() as current_schema`);
    diag.currentSchema = (schemaRes as { rows?: { current_schema: string }[] })?.rows?.[0]?.current_schema ?? "unknown";
    const jobRes = await db.execute<{ exists: boolean }>(
      sql`SELECT EXISTS(SELECT 1 FROM information_schema.tables WHERE table_schema = ${resolvedSchema} AND table_name = 'Job') as exists`,
    );
    diag.jobExists = (jobRes as { rows?: { exists: boolean }[] })?.rows?.[0]?.exists ?? false;
    const jobsRes = await db.execute<{ exists: boolean }>(
      sql`SELECT EXISTS(SELECT 1 FROM information_schema.tables WHERE table_schema = ${resolvedSchema} AND table_name = 'jobs') as exists`,
    );
    diag.jobsExists = (jobsRes as { rows?: { exists: boolean }[] })?.rows?.[0]?.exists ?? false;
  } catch (probeErr) {
    diag.currentSchema = "probe_failed";
    // eslint-disable-next-line no-console
    console.error("PUBLIC_JOBS_RECENT_PROBE_ERROR::", probeErr);
  }

  // eslint-disable-next-line no-console
  console.log("PUBLIC_JOBS_RECENT_DIAG::", JSON.stringify(diag));
  const headers = diagHeaders(diag);

  try {
    const url = new URL(req.url);
    const parsed = QuerySchema.safeParse({
      limit: url.searchParams.get("limit") ?? undefined
    });
    if (!parsed.success) return badRequest("invalid_query", { headers });

    const { limit } = parsed.data;

    const jobRows = await listNewestJobs(limit);
    if (process.env.NODE_ENV === "production") {
      const eligibleCount = await countEligiblePublicJobs();
      // eslint-disable-next-line no-console
      console.info(`[public/jobs/recent] eligible=${eligibleCount} returned=${jobRows.length} limit=${limit}`);
    }
    const ids = jobRows.map((j) => j.id).filter(Boolean) as string[];

    const photosByJobId = new Map<string, Array<{ id: string; kind: string; url: string | null }>>();
    if (ids.length) {
      const rows = await db
        .select({ jobId: jobPhotos.jobId, id: jobPhotos.id, kind: jobPhotos.kind, url: jobPhotos.url })
        .from(jobPhotos)
        .where(inArray(jobPhotos.jobId, ids))
        .orderBy(asc(jobPhotos.createdAt));
      for (const r of rows) {
        const arr = photosByJobId.get(r.jobId) ?? [];
        arr.push({ id: r.id, kind: r.kind, url: (r as any).url ?? null });
        photosByJobId.set(r.jobId, arr);
      }
    }

    const jobs = jobRows.map((j) => ({
      id: j.id,
      status: j.status,
      title: j.title,
      region: j.region,
      city: j.city,
      country: j.country,
      publicStatus: j.publicStatus,
      tradeCategory: j.tradeCategory,
      serviceType: "handyman",
      laborTotalCents: j.laborTotalCents,
      contractorPayoutCents: j.contractorPayoutCents,
      routerEarningsCents: j.routerEarningsCents,
      brokerFeeCents: j.brokerFeeCents,
      materialsTotalCents: j.materialsTotalCents,
      transactionFeeCents: j.transactionFeeCents,
      createdAt: j.createdAt,
      photos: photosByJobId.get(j.id) ?? [],
    }));

    const out = jobs.map((j) => ({
      ...j,
      createdAt: j.createdAt.toISOString(),
    }));

    return ok({ jobs: out }, { headers });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const code = (err as { code?: string })?.code;
    const detail = (err as { detail?: string })?.detail;
    const table = (err as { table?: string })?.table;
    const column = (err as { column?: string })?.column;
    const constraint = (err as { constraint?: string })?.constraint;
    const stackTop = err instanceof Error && err.stack ? err.stack.split("\n").slice(0, 5).join(" | ") : undefined;
    // eslint-disable-next-line no-console
    console.error(
      "PUBLIC_JOBS_RECENT_ERROR::",
      JSON.stringify({
        resolvedSchema: diag.resolvedSchema,
        currentSchema: diag.currentSchema,
        jobExists: diag.jobExists,
        jobsExists: diag.jobsExists,
        message: msg,
        code,
        detail,
        table,
        column,
        constraint,
        stackTop,
      }),
    );
    const errResp = handleApiError(err, "GET /api/public/jobs/recent");
    const h = new Headers(errResp.headers);
    headers.forEach((v, k) => h.set(k, v));
    return new Response(errResp.body, { status: errResp.status, headers: h });
  }
}

