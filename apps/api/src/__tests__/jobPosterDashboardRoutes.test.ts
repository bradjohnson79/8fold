import { beforeEach, describe, expect, it, vi } from "vitest";

describe("job poster dashboard routes", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
  });

  it("GET /api/web/v4/job-poster/jobs returns 200 with empty jobs array", async () => {
    vi.doMock("@/src/auth/requireV4Role", () => ({
      requireV4Role: vi.fn(async () => ({
        userId: "user_empty",
        role: "JOB_POSTER",
        clerkUserId: "clerk_1",
        requestId: "req_empty",
      })),
    }));
    vi.doMock("@/src/services/v4/jobPosterJobsService", () => ({
      listJobsForJobPoster: vi.fn(async () => []),
    }));

    const { GET } = await import("@/app/api/web/v4/job-poster/jobs/route");
    const res = await GET(new Request("http://localhost/api/web/v4/job-poster/jobs"));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({ jobs: [] });
  });

  it("GET /api/web/v4/job-poster/jobs returns populated jobs list", async () => {
    const jobs = [
      {
        id: "job_1",
        title: "Fix outlet",
        status: "PUBLISHED",
        routingStatus: "UNROUTED",
        amountCents: 12000,
        createdAt: "2026-03-02T00:00:00.000Z",
        canMarkComplete: false,
        contractorMarkedCompleteAt: null,
        posterMarkedCompleteAt: null,
        completedAt: null,
        executionStatus: "PUBLISHED",
      },
    ];

    vi.doMock("@/src/auth/requireV4Role", () => ({
      requireV4Role: vi.fn(async () => ({
        userId: "user_with_jobs",
        role: "JOB_POSTER",
        clerkUserId: "clerk_2",
        requestId: "req_jobs",
      })),
    }));
    vi.doMock("@/src/services/v4/jobPosterJobsService", () => ({
      listJobsForJobPoster: vi.fn(async () => jobs),
    }));

    const { GET } = await import("@/app/api/web/v4/job-poster/jobs/route");
    const res = await GET(new Request("http://localhost/api/web/v4/job-poster/jobs"));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({ jobs });
  });

  it("GET /api/web/v4/job-poster/dashboard/summary returns required summary fields", async () => {
    vi.doMock("@/src/auth/requireV4Role", () => ({
      requireV4Role: vi.fn(async () => ({
        userId: "user_summary",
        role: "JOB_POSTER",
        clerkUserId: "clerk_3",
        requestId: "req_summary",
      })),
    }));
    vi.doMock("@/src/services/v4/jobPosterSummaryService", () => ({
      getJobPosterSummary: vi.fn(async () => ({
        jobsPosted: 2,
        fundsSecured: 45000,
        paymentStatus: "CONNECTED",
        unreadMessages: 1,
        activeAssignments: 1,
      })),
    }));

    const { GET } = await import("@/app/api/web/v4/job-poster/dashboard/summary/route");
    const res = await GET(new Request("http://localhost/api/web/v4/job-poster/dashboard/summary"));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toMatchObject({
      jobsPosted: 2,
      fundsSecured: 45000,
      paymentStatus: "CONNECTED",
      unreadMessages: 1,
      activeAssignments: 1,
    });
  });

  it("GET /api/web/v4/job-poster/jobs returns graceful fallback instead of 500", async () => {
    vi.doMock("@/src/auth/requireV4Role", () => ({
      requireV4Role: vi.fn(async () => ({
        userId: "user_fail_jobs",
        role: "JOB_POSTER",
        clerkUserId: "clerk_4",
        requestId: "req_fail_jobs",
      })),
    }));
    vi.doMock("@/src/services/v4/jobPosterJobsService", () => ({
      listJobsForJobPoster: vi.fn(async () => {
        throw new Error("column does not exist");
      }),
    }));

    const { GET } = await import("@/app/api/web/v4/job-poster/jobs/route");
    const res = await GET(new Request("http://localhost/api/web/v4/job-poster/jobs"));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({ jobs: [], error: "Partial failure, please retry" });
  });

  it("GET /api/web/v4/job-poster/dashboard/summary returns graceful fallback instead of 500", async () => {
    vi.doMock("@/src/auth/requireV4Role", () => ({
      requireV4Role: vi.fn(async () => ({
        userId: "user_fail_summary",
        role: "JOB_POSTER",
        clerkUserId: "clerk_5",
        requestId: "req_fail_summary",
      })),
    }));
    vi.doMock("@/src/services/v4/jobPosterSummaryService", () => ({
      getJobPosterSummary: vi.fn(async () => {
        throw new Error("schema mismatch");
      }),
    }));

    const { GET } = await import("@/app/api/web/v4/job-poster/dashboard/summary/route");
    const res = await GET(new Request("http://localhost/api/web/v4/job-poster/dashboard/summary"));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({
      summary: {},
      jobs: [],
      error: "Partial failure, please retry",
    });
  });
});
