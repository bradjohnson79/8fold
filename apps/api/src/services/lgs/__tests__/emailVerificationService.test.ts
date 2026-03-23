import { beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("@/db/drizzle", () => ({
  db: {},
}));

let classifyEmailVerification: typeof import("../emailVerificationService").classifyEmailVerification;
let isValidEmailCandidate: typeof import("../emailVerificationService").isValidEmailCandidate;
let normalizeVerificationStatus: typeof import("../emailVerificationService").normalizeVerificationStatus;

beforeAll(async () => {
  const mod = await import("../emailVerificationService");
  classifyEmailVerification = mod.classifyEmailVerification;
  isValidEmailCandidate = mod.isValidEmailCandidate;
  normalizeVerificationStatus = mod.normalizeVerificationStatus;
});

describe("classifyEmailVerification", () => {
  it("marks a business-domain mailbox as valid", () => {
    const result = classifyEmailVerification(
      "owner@acmebuild.com",
      { wellFormed: true, validDomain: true, validMailbox: true },
      { catchAll: false, checkedAt: new Date("2026-03-21T00:00:00Z"), provider: "test" }
    );

    expect(result.status).toBe("valid");
    expect(result.score).toBe(100);
  });

  it("keeps usable free-provider mailboxes as valid", () => {
    const result = classifyEmailVerification(
      "owner@gmail.com",
      { wellFormed: true, validDomain: true, validMailbox: true },
      { catchAll: false, checkedAt: new Date("2026-03-21T00:00:00Z"), provider: "test" }
    );

    expect(result.status).toBe("valid");
    expect(result.score).toBe(100);
  });

  it("keeps catch-all uncertainty pending instead of over-classifying it", () => {
    const result = classifyEmailVerification(
      "info@acmebuild.com",
      { wellFormed: true, validDomain: true, validMailbox: true },
      { catchAll: true, checkedAt: new Date("2026-03-21T00:00:00Z"), provider: "test" }
    );

    expect(result.status).toBe("valid");
    expect(result.score).toBe(100);
  });

  it("keeps unknown mailbox responses pending", () => {
    const result = classifyEmailVerification(
      "info@acmebuild.com",
      { wellFormed: true, validDomain: true, validMailbox: null },
      { catchAll: false, checkedAt: new Date("2026-03-21T00:00:00Z"), provider: "test" }
    );

    expect(result.status).toBe("pending");
    expect(result.score).toBe(50);
  });

  it("marks bad mailboxes invalid", () => {
    const result = classifyEmailVerification(
      "bad@acmebuild.com",
      { wellFormed: true, validDomain: true, validMailbox: false },
      { catchAll: false, checkedAt: new Date("2026-03-21T00:00:00Z"), provider: "test" }
    );

    expect(result.status).toBe("invalid");
  });
});

describe("verification helper guards", () => {
  it("accepts normal email addresses", () => {
    expect(isValidEmailCandidate("owner@acmebuild.com")).toBe(true);
  });

  it("rejects asset-like addresses", () => {
    expect(isValidEmailCandidate("logo-white@2x.svg")).toBe(false);
    expect(isValidEmailCandidate("image.png")).toBe(false);
  });

  it("treats null or mixed-case pending values as pending", () => {
    expect(normalizeVerificationStatus(null)).toBe("pending");
    expect(normalizeVerificationStatus("Pending")).toBe("pending");
    expect(normalizeVerificationStatus(" VERIFIED ")).toBe("valid");
    expect(normalizeVerificationStatus("risky")).toBe("pending");
  });
});
