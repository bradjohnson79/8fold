import { z } from "zod";
import { sql } from "drizzle-orm";
import { handleApiError } from "../../../../../src/lib/errorHandler";
import { badRequest, ok } from "../../../../../src/lib/api/respond";
import { countEligiblePublicJobs, listNewestJobs } from "../../../../../src/server/repos/jobPublicRepo.drizzle";
import { db } from "@/server/db/drizzle";
import { getResolvedSchema } from "@/server/db/schemaLock";
import { asc, inArray } from "drizzle-orm";
import { jobPhotos } from "../../../../../db/schema/jobPhoto";

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

type DiagHeaders = Record<string, string>;

async function runDiagProbe(): Promise<DiagHeaders> {
  const resolvedSchema = getResolvedSchema();
  const headers: DiagHeaders = {
    "x-8fold-resolved-schema": resolvedSchema,
    "x-8fold-current-schema": "?",
    "x-8fold-job-exists": "?",
    "x-8fold-jobs-exists": "?",
  };
  try {
    const schemaRes = await db.execute<{ current_schema: string }>(sql`SELECT current_schema() as current_schema`);
    const currentSchema = (schemaRes as { rows?: { current_schema: string }[] })?.rows?.[0]?.current_schema ?? "?";
    headers["x-8fold-current-schema"] = currentSchema;

    const tablesRes = await db.execute<{ table_name: string }>(sql`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = ${resolvedSchema} AND table_name IN ('Job', 'jobs')
    `);
    const names = ((tablesRes as { rows?: { table_name: string }[] })?.rows ?? []).map((r) => r.table_name);
    headers["x-8fold-job-exists"] = names.includes("Job") ? "1" : "0";
    headers["x-8fold-jobs-exists"] = names.includes("jobs") ? "1" : "0";
  } catch (e) {
    headers["x-8fold-current-schema"] = "probe_err";
    headers["x-8fold-job-exists"] = "probe_err";
    headers["x-8fold-jobs-exists"] = "probe_err";
  }
  return headers;
}

export async function GET(req: Request) {
  const diagHeaders = await runDiagProbe();
  const diagPayload = {
    resolvedSchema: diagHeaders["x-8fold-resolved-schema"],
    currentSchema: diagHeaders["x-8fold-current-schema"],
    jobExists: diagHeaders["x-8fold-job-exists"],
    jobsExists: diagHeaders["x-8fold-jobs-exists"],
  };
  // eslint-disable-next-line no-console
  console.info("PUBLIC_JOBS_RECENT_DIAG::", JSON.stringify(diagPayload));

  try {
    const url = new URL(req.url);
    const parsed = QuerySchema.safeParse({
      limit: url.searchParams.get("limit") ?? undefined
    });
    if (!parsed.success) return badRequest("invalid_query", { headers: diagHeaders });

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

    return ok({ jobs: out }, { headers: diagHeaders });
  } catch (err) {
    const pg = err as { code?: string; message?: string; detail?: string; schema?: string; table?: string; column?: string; constraint?: string };
    const stackTop = err instanceof Error ? (err.stack ?? "").split("\n").slice(0, 3).join(" | ") : "";
    // eslint-disable-next-line no-console
    console.error("PUBLIC_JOBS_RECENT_ERROR::", JSON.stringify({
      code: pg.code ?? null,
      message: pg.message ?? (err instanceof Error ? err.message : String(err)),
      detail: pg.detail ?? null,
      schema: pg.schema ?? null,
      table: pg.table ?? null,
      column: pg.column ?? null,
      constraint: pg.constraint ?? null,
      stackTop: stackTop || null,
    }));
    const resp = handleApiError(err, "GET /api/public/jobs/recent");
    const h = new Headers(resp.headers);
    Object.entries(diagHeaders).forEach(([k, v]) => h.set(k, v));
    return new Response(resp.body, { status: resp.status, headers: h });
  }
}

