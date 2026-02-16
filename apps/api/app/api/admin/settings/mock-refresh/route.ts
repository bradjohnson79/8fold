import { NextResponse } from "next/server";
import { requireAdmin } from "@/src/lib/auth/requireAdmin";
import { handleApiError } from "@/src/lib/errorHandler";
import { and, eq, lt, sql } from "drizzle-orm";
import { db } from "../../../../../db/drizzle";
import { jobs } from "../../../../../db/schema/job";

const DEFAULT_SETTINGS = {
  mockRefreshEnabled: false,
  jobsPerCycle: 5,
  refreshIntervalHours: 24,
};

export async function GET(req: Request) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  try {
    return NextResponse.json({
      ok: true,
      data: {
        settings: { ...DEFAULT_SETTINGS },
      config: {
        enabled: DEFAULT_SETTINGS.mockRefreshEnabled,
        jobsPerCycle: DEFAULT_SETTINGS.jobsPerCycle,
        intervalHours: DEFAULT_SETTINGS.refreshIntervalHours,
      },
      configUpdatedAt: null as string | null,
        regions: [] as { country: string; regionCode: string; mockJobCount: number; lastRefreshAt: string | null }[],
      },
    });
  } catch (err) {
    return handleApiError(err, "GET /api/admin/settings/mock-refresh");
  }
}

export async function POST(req: Request) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  try {
    // Mock job generation is permanently disabled.
    // This endpoint only "refreshes" existing mock jobs by bumping publishedAt
    // so they remain visible without creating any new mock rows.
    const refreshed = await db
      .update(jobs)
      .set({ publishedAt: sql`now()` as any })
      .where(
        and(
          eq(jobs.publicStatus, "OPEN" as any),
          eq(jobs.isMock, true),
          lt(jobs.publishedAt, sql`now() - interval '48 hours'` as any),
        ),
      )
      .returning({ id: jobs.id });

    return NextResponse.json({
      ok: true,
      data: {
        config: {
          enabled: false,
          jobsPerCycle: DEFAULT_SETTINGS.jobsPerCycle,
          intervalHours: DEFAULT_SETTINGS.refreshIntervalHours,
        },
        configUpdatedAt: new Date().toISOString(),
        refreshedJobs: refreshed.length,
        regions: [] as { country: string; regionCode: string; mockJobCount: number; lastRefreshAt: string | null }[],
      },
    });
  } catch (err) {
    return handleApiError(err, "POST /api/admin/settings/mock-refresh");
  }
}
