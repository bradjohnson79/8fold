import { describe, expect, test } from "vitest";
import { parseOverviewCardsFilters } from "@/src/services/adminV4/overviewCardsService";

describe("overview cards filter parsing", () => {
  test("applies defaults", () => {
    const parsed = parseOverviewCardsFilters(new URLSearchParams());
    expect(parsed.latestJobsRegion).toBe("ALL");
    expect(parsed.overdueRoutingRegion).toBe("ALL");
    expect(parsed.newestJobPostersRegion).toBe("ALL");
    expect(parsed.newestContractorsRegion).toBe("ALL");
    expect(parsed.newestRoutersRegion).toBe("ALL");
    expect(parsed.payoutsPendingRegion).toBe("ALL");
    expect(parsed.payoutsPaidRegion).toBe("ALL");
    expect(parsed.contractorRevenueRange).toBe("30d");
    expect(parsed.routerRevenueRange).toBe("30d");
    expect(parsed.platformRevenueRange).toBe("30d");
  });

  test("normalizes region and range values", () => {
    const parsed = parseOverviewCardsFilters(
      new URLSearchParams({
        latestJobsRegion: "ca",
        overdueRoutingRegion: " all ",
        newestJobPostersRegion: "tx",
        newestContractorsRegion: "bc",
        newestRoutersRegion: "wa",
        payoutsPendingRegion: "ny",
        payoutsPaidRegion: "or",
        contractorRevenueRange: "7d",
        routerRevenueRange: "24h",
        platformRevenueRange: "60d",
      }),
    );
    expect(parsed.latestJobsRegion).toBe("CA");
    expect(parsed.overdueRoutingRegion).toBe("ALL");
    expect(parsed.newestJobPostersRegion).toBe("TX");
    expect(parsed.newestContractorsRegion).toBe("BC");
    expect(parsed.newestRoutersRegion).toBe("WA");
    expect(parsed.payoutsPendingRegion).toBe("NY");
    expect(parsed.payoutsPaidRegion).toBe("OR");
    expect(parsed.contractorRevenueRange).toBe("7d");
    expect(parsed.routerRevenueRange).toBe("24h");
    expect(parsed.platformRevenueRange).toBe("60d");
  });

  test("falls back on invalid ranges", () => {
    const parsed = parseOverviewCardsFilters(
      new URLSearchParams({
        contractorRevenueRange: "week",
        routerRevenueRange: "365d",
        platformRevenueRange: "unknown",
      }),
    );
    expect(parsed.contractorRevenueRange).toBe("30d");
    expect(parsed.routerRevenueRange).toBe("30d");
    expect(parsed.platformRevenueRange).toBe("30d");
  });
});
