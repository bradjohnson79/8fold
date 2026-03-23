import { beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("@/db/drizzle", () => ({
  db: {},
}));

let calculatePriority: typeof import("../priorityScoringService").calculatePriority;

beforeAll(async () => {
  const mod = await import("../priorityScoringService");
  calculatePriority = mod.calculatePriority;
});

describe("calculatePriority", () => {
  it("scores valid, complete contractor leads as high priority", () => {
    const result = calculatePriority({
      pipeline: "contractor",
      verificationStatus: "valid",
      firstName: "Jane",
      title: "Owner",
      companyName: "Acme Builders",
      city: "Los Angeles",
      state: "CA",
      email: "jane@acmebuild.com",
      trade: "Roofing",
    });

    expect(result.score).toBeGreaterThanOrEqual(85);
    expect(result.bucket).toBe("high");
  });

  it("keeps missing-email leads below the high bucket", () => {
    const result = calculatePriority({
      pipeline: "contractor",
      verificationStatus: "pending",
      companyName: "Acme Builders",
      trade: "Roofing",
      email: null,
    });

    expect(result.score).toBeLessThan(70);
    expect(result.bucket).not.toBe("high");
  });

  it("heavily penalizes invalid emails", () => {
    const result = calculatePriority({
      pipeline: "jobs",
      verificationStatus: "invalid",
      companyName: "Acme Property",
      category: "property_management",
      email: "bad-email",
    });

    expect(result.score).toBeLessThan(0);
    expect(result.bucket).toBe("low");
  });

  it("keeps pending leads below the high bucket", () => {
    const result = calculatePriority({
      pipeline: "jobs",
      verificationStatus: "pending",
      firstName: "Taylor",
      title: "Owner",
      companyName: "Solid Property Group",
      city: "San Diego",
      state: "CA",
      email: "taylor@solidpropertygroup.com",
      category: "property_management",
    });

    expect(result.score).toBeLessThan(70);
    expect(result.bucket).not.toBe("high");
  });

  it("boosts replied leads while staying capped at 100", () => {
    const result = calculatePriority({
      pipeline: "contractor",
      verificationStatus: "valid",
      firstName: "Jamie",
      title: "Owner",
      companyName: "Prime Roofing",
      city: "San Jose",
      state: "CA",
      email: "jamie@primeroofing.com",
      trade: "roofing",
      replyCount: 2,
      lastRepliedAt: new Date(),
      domainReplyRate: 0.35,
    });

    expect(result.score).toBe(100);
    expect(result.bucket).toBe("high");
  });
});
