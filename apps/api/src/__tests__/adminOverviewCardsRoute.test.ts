import { beforeEach, describe, expect, test, vi } from "vitest";

process.env.DATABASE_URL ||= "postgres://localhost:5432/8fold_test?schema=8fold_test";

beforeEach(() => {
  vi.resetModules();
  vi.restoreAllMocks();
});

describe("admin overview cards route", () => {
  test("GET /api/admin/v4/overview/cards returns payload when authed", async () => {
    vi.doMock("@/src/auth/requireAdminV4", () => ({
      requireAdminV4: vi.fn(async () => ({ adminId: "admin_1" })),
    }));
    vi.doMock("@/src/services/adminV4/overviewCardsService", () => ({
      parseOverviewCardsFilters: vi.fn(() => ({
        latestJobsRegion: "ALL",
        overdueRoutingRegion: "ALL",
        newestJobPostersRegion: "ALL",
        newestContractorsRegion: "ALL",
        newestRoutersRegion: "ALL",
        payoutsPendingRegion: "ALL",
        payoutsPaidRegion: "ALL",
        contractorRevenueRange: "30d",
        routerRevenueRange: "30d",
        platformRevenueRange: "30d",
      })),
      getOverviewCardsPayload: vi.fn(async () => ({
        filters: { selected: {}, regionOptions: ["ALL", "CA"] },
        latestJobs: [],
        overdueRouting: [],
        openSupportMessages: [],
        openDisputes: [],
        newestJobPosters: [],
        newestContractors: [],
        newestRouters: [],
        payoutsPending: [],
        payoutsPaid: [],
        revenue: {
          contractor: { totalCents: 0, jobsCount: 0 },
          router: { totalCents: 0, jobsCount: 0 },
          platform: { totalCents: 0, jobsCount: 0, topJobs: [] },
        },
      })),
    }));

    const mod = await import("../../app/api/admin/v4/overview/cards/route");
    const resp = await mod.GET(new Request("http://localhost/api/admin/v4/overview/cards?latestJobsRegion=ca"));
    expect(resp.status).toBe(200);
    const json = (await resp.json()) as any;
    expect(json.ok).toBe(true);
    expect(Array.isArray(json.data?.filters?.regionOptions)).toBe(true);
  });

  test("GET /api/admin/v4/overview/cards returns auth response when unauthenticated", async () => {
    vi.doMock("@/src/auth/requireAdminV4", () => ({
      requireAdminV4: vi.fn(async () => new Response("unauthorized", { status: 401 })),
    }));
    vi.doMock("@/src/services/adminV4/overviewCardsService", () => ({
      parseOverviewCardsFilters: vi.fn(),
      getOverviewCardsPayload: vi.fn(),
    }));

    const mod = await import("../../app/api/admin/v4/overview/cards/route");
    const resp = await mod.GET(new Request("http://localhost/api/admin/v4/overview/cards"));
    expect(resp.status).toBe(401);
  });
});
